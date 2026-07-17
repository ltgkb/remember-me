"""向量索引模块 — 基于 ChromaDB 的语义搜索核心。

为 Remember Me 提供跨对话、项目上下文与决策记录的语义检索能力。
设计目标：

* **懒加载**：模型与 ChromaDB 客户端在首次使用时才初始化，避免服务启动延迟。
* **项目隔离**：每个项目对应一个独立的 ChromaDB collection（``remember_me_{project}``），
  全局记忆使用 ``remember_me_global``。
* **优雅降级**：ChromaDB 或嵌入模型不可用时，``SemanticSearchError`` 携带可读提示，
  上层（HTTP 端点）据此返回 503 并引导用户回退到关键词搜索。
* **幂等索引**：同一 ``memory_id`` 重复 index 会覆盖旧向量，不产生重复条目。
"""

from __future__ import annotations

import hashlib
import logging
import os
import time
from pathlib import Path
from typing import Any

logger = logging.getLogger("memory_engine.vector_index")


class SemanticSearchError(RuntimeError):
    """语义搜索不可用时抛出，携带面向用户的提示信息。"""


def _reset_chromadb_registry() -> None:
    """清理 chromadb ``SharedSystemClient`` 注册表中的残留状态。

    A1-修复：chromadb 1.x 的 ``PersistentClient`` 初始化失败时，部分初始化的
    ``System`` 会残留在 ``SharedSystemClient._identifier_to_system`` 中（refcount
    未同步），导致后续 ``PersistentClient`` 调用抛出逃逸的 ``KeyError``，穿透 HTTP
    处理器造成连接重置（RemoteDisconnected）。在失败路径调用官方
    ``clear_system_cache()`` 重置注册表，保证下次重试从干净状态开始。
    清理失败不应掩盖原始异常，仅记录日志。
    """
    try:
        from chromadb.api.shared_system_client import (  # type: ignore[import-untyped]
            SharedSystemClient,
        )

        SharedSystemClient.clear_system_cache()
        logger.debug("已清理 chromadb SharedSystemClient 注册表残留")
    except Exception:  # noqa: BLE001 - 清理失败不应掩盖原始异常
        logger.debug("清理 chromadb SharedSystemClient 注册表失败", exc_info=True)


# ---------------------------------------------------------------------------
# 默认配置
# ---------------------------------------------------------------------------
DEFAULT_MODEL_NAME = "all-MiniLM-L6-v2"
GLOBAL_PROJECT = "global"


def _default_data_dir() -> Path:
    """返回 Remember Me 数据目录（与 cli._data_dir 保持一致）。"""
    env = os.getenv("REMEMBER_ME_DATA_DIR")
    if env:
        return Path(env)
    return Path.home() / ".remember-me"


class VectorIndex:
    """基于 ChromaDB 的向量索引，封装索引、检索、删除与统计。

    Args:
        data_dir: Remember Me 数据目录，ChromaDB 持久化路径位于其下的 ``vector_db/``。
        model_name: sentence-transformers 模型名，默认 ``all-MiniLM-L6-v2``。

    Raises:
        SemanticSearchError: ChromaDB 或嵌入模型不可用时抛出。
    """

    def __init__(
        self,
        data_dir: Path | None = None,
        model_name: str = DEFAULT_MODEL_NAME,
        preload: bool = False,
    ) -> None:
        self.data_dir = data_dir or _default_data_dir()
        self.model_name = model_name
        self._db_path = self.data_dir / "vector_db"
        self._db_path.mkdir(parents=True, exist_ok=True)

        # 懒加载字段
        self._client: Any = None
        self._model: Any = None
        self._initialized = False

        if preload:
            self._ensure_initialized()

    # ------------------------------------------------------------------
    # 懒加载
    # ------------------------------------------------------------------

    def _ensure_initialized(self) -> None:
        """首次使用时初始化 ChromaDB 客户端与嵌入模型。

        刻意不让 ChromaDB 调用 embedding function（其 1.x 协议变动频繁），
        改由本类自行用 sentence-transformers 编码，索引时传 ``embeddings``、
        查询时传 ``query_embeddings``，彻底规避适配层兼容性问题。
        """
        if self._initialized:
            return
        start = time.perf_counter()
        try:
            import chromadb  # type: ignore[import-untyped]
            from chromadb.config import Settings  # type: ignore[import-untyped]
        except ImportError as exc:  # pragma: no cover - 环境依赖
            raise SemanticSearchError(
                "语义搜索需要 chromadb，请运行 pip install chromadb"
            ) from exc

        try:
            from sentence_transformers import SentenceTransformer  # type: ignore[import-untyped]
        except ImportError as exc:  # pragma: no cover - 环境依赖
            raise SemanticSearchError(
                "语义搜索需要 sentence-transformers，请运行 "
                "pip install sentence-transformers"
            ) from exc

        logger.info("正在加载嵌入模型 %s ...", self.model_name)
        try:
            self._model = SentenceTransformer(self.model_name)
        except Exception as exc:  # noqa: BLE001 - A1-修复: 模型加载失败同样走 503 降级
            raise SemanticSearchError(
                f"嵌入模型 {self.model_name} 加载失败: "
                f"{type(exc).__name__}: {exc}"
            ) from exc

        # A1-修复: PersistentClient 可能抛出任意运行时异常（如 Python 3.14 下
        # Rust 绑定报 'RustBindingsAPI' object has no attribute 'bindings'），
        # 必须包装为 SemanticSearchError 以便上层返回 503 优雅降级；
        # 同时清理 SharedSystemClient 注册表残留，避免后续调用抛出 KeyError。
        try:
            self._client = chromadb.PersistentClient(
                path=str(self._db_path),
                settings=Settings(anonymized_telemetry=False, allow_reset=True),
            )
        except Exception as exc:  # noqa: BLE001
            _reset_chromadb_registry()
            raise SemanticSearchError(
                f"ChromaDB 初始化失败: {type(exc).__name__}: {exc}"
            ) from exc
        self._initialized = True
        elapsed = time.perf_counter() - start
        logger.info("嵌入模型加载完成，耗时 %.2fs", elapsed)
        logger.info("向量索引初始化完成，持久化路径: %s", self._db_path)

        # A3-优化: 预热推理路径与全局集合，避免首次真实查询承担
        # torch 推理初始化 + HNSW 索引加载的一次性开销（实测 ~500ms）。
        # 预热失败不影响可用性，仅记录日志。
        try:
            self._encode(["remember-me warmup"])
            self._client.get_or_create_collection(
                name=self._collection_name(None),
                metadata={"hnsw:space": "cosine"},
            ).count()
            logger.info("语义栈预热完成")
        except Exception:  # noqa: BLE001
            logger.debug("语义栈预热失败（不影响后续按需初始化）", exc_info=True)

    def _encode(self, texts: list[str]) -> list[list[float]]:
        """用 sentence-transformers 编码文本为向量列表。"""
        embeddings = self._model.encode(texts, convert_to_numpy=True, show_progress_bar=False)
        return [list(map(float, row)) for row in embeddings]

    def _collection_name(self, project: str | None) -> str:
        """根据项目名生成合法的 collection 名（小写字母、数字、下划线、连字符）。"""
        safe = "".join(c if c.isalnum() or c in "-_" else "_" for c in (project or ""))
        safe = safe.lower().strip("_") or GLOBAL_PROJECT
        return f"remember_me_{safe}"

    def _get_collection(self, project: str | None) -> Any:
        """获取或创建指定项目的 collection（不绑定 embedding function）。"""
        self._ensure_initialized()
        name = self._collection_name(project)
        return self._client.get_or_create_collection(
            name=name,
            metadata={"hnsw:space": "cosine"},
        )

    # ------------------------------------------------------------------
    # 公开 API
    # ------------------------------------------------------------------

    def index_memory(
        self,
        project: str | None,
        memory_id: str,
        text: str,
        metadata: dict[str, Any] | None = None,
    ) -> bool:
        """将单条记忆文本编码为向量并写入集合。

        Args:
            project: 项目名，``None`` 或空字符串表示全局。
            memory_id: 记忆唯一标识，重复写入会覆盖。
            text: 待索引的文本。
            metadata: 附加元数据（source / date 等）。

        Returns:
            成功返回 True；失败返回 False 并记录日志。
        """
        if not text or not text.strip():
            return False
        try:
            collection = self._get_collection(project)
            embeddings = self._encode([text])
            collection.upsert(
                ids=[memory_id],
                embeddings=embeddings,
                documents=[text],
                metadatas=[metadata or {}],
            )
            return True
        except SemanticSearchError:
            raise
        except Exception as exc:  # noqa: BLE001 - 索引失败不应中断调用方
            logger.error("索引记忆失败 (%s/%s): %s", project, memory_id, exc)
            return False

    def semantic_search(
        self,
        project: str | None,
        query: str,
        top_k: int = 5,
        threshold: float = 0.0,
    ) -> list[dict[str, Any]]:
        """语义检索：返回与 query 最相似的 Top-K 记忆片段。

        Args:
            project: 项目名，``None`` 表示全局。
            query: 自然语言查询。
            top_k: 返回结果数上限。
            threshold: 相似度下限（0~1，余弦相似度），低于此值的结果被过滤。

        Returns:
            结果列表，每项含 ``id`` / ``text`` / ``score`` / ``metadata``，
            按 score 降序排列。失败时返回空列表。
        """
        if not query or not query.strip():
            return []
        try:
            collection = self._get_collection(project)
            query_embedding = self._encode([query])
            result = collection.query(
                query_embeddings=query_embedding,
                n_results=max(top_k, 1),
                include=["documents", "metadatas", "distances"],
            )
        except SemanticSearchError:
            raise
        except Exception as exc:  # noqa: BLE001
            logger.error("语义检索失败 (%s): %s", project, exc)
            return []

        documents = result.get("documents", [[]])
        metadatas = result.get("metadatas", [[]])
        distances = result.get("distances", [[]])
        ids = result.get("ids", [[]])

        if not documents or not documents[0]:
            return []

        out: list[dict[str, Any]] = []
        for i, doc in enumerate(documents[0]):
            distance = distances[0][i] if distances and i < len(distances[0]) else 1.0
            # ChromaDB cosine space: distance = 1 - similarity
            score = max(0.0, 1.0 - float(distance))
            if score < threshold:
                continue
            meta = metadatas[0][i] if metadatas and i < len(metadatas[0]) else {}
            mid = ids[0][i] if ids and i < len(ids[0]) else ""
            out.append(
                {
                    "id": mid,
                    "text": doc,
                    "score": round(score, 4),
                    "metadata": meta or {},
                }
            )
        out.sort(key=lambda r: r["score"], reverse=True)
        return out

    def delete_memory(self, project: str | None, memory_id: str) -> bool:
        """从集合中删除指定记忆。"""
        try:
            collection = self._get_collection(project)
            collection.delete(ids=[memory_id])
            return True
        except SemanticSearchError:
            raise
        except Exception as exc:  # noqa: BLE001
            logger.error("删除记忆失败 (%s/%s): %s", project, memory_id, exc)
            return False

    def get_stats(self, project: str | None = None) -> dict[str, Any]:
        """返回集合统计信息。"""
        try:
            collection = self._get_collection(project)
            count = collection.count()
        except SemanticSearchError:
            raise
        except Exception as exc:  # noqa: BLE001
            logger.error("获取统计失败 (%s): %s", project, exc)
            return {"project": project or GLOBAL_PROJECT, "count": 0, "error": str(exc)}

        disk_bytes = 0
        try:
            for entry in self._db_path.rglob("*"):
                if entry.is_file():
                    disk_bytes += entry.stat().st_size
        except OSError:
            pass

        return {
            "project": project or GLOBAL_PROJECT,
            "collection": self._collection_name(project),
            "count": count,
            "model": self.model_name,
            "disk_bytes": disk_bytes,
            "disk_mb": round(disk_bytes / (1024 * 1024), 2),
        }

    def close(self) -> None:
        """释放资源。"""
        self._client = None
        self._model = None
        self._initialized = False


# ---------------------------------------------------------------------------
# 工具：把 ~/.remember-me 下的记忆批量灌入索引（供运维或首次启用时调用）
# ---------------------------------------------------------------------------


def _stable_id(text: str) -> str:
    """根据文本内容生成稳定的 16 位哈希 ID。"""
    return hashlib.md5(text.encode("utf-8")).hexdigest()[:16]


def index_all_memories(index: VectorIndex, data_dir: Path | None = None) -> dict[str, int]:
    """扫描数据目录下所有 JSON 记忆并批量索引。

    返回每个项目索引的条目数。该函数对运维场景友好，可重复执行。
    """
    import json

    root = data_dir or _default_data_dir()
    stats: dict[str, int] = {}

    # 1. 全局 profile.json
    profile_path = root / "profile.json"
    if profile_path.exists():
        try:
            text = profile_path.read_text(encoding="utf-8")
            if index.index_memory(None, _stable_id(text), text, {"source": "profile"}):
                stats[GLOBAL_PROJECT] = stats.get(GLOBAL_PROJECT, 0) + 1
        except OSError:
            pass

    # 2. 各项目目录
    projects_dir = root / "projects"
    if projects_dir.exists():
        for project_dir in projects_dir.iterdir():
            if not project_dir.is_dir():
                continue
            project_name = project_dir.name
            count = 0
            for json_file in project_dir.rglob("*.json"):
                # 跳过 .backups 目录
                if ".backups" in json_file.parts:
                    continue
                try:
                    text = json_file.read_text(encoding="utf-8")
                except OSError:
                    continue
                mid = _stable_id(f"{project_name}:{json_file.relative_to(project_dir)}")
                rel = str(json_file.relative_to(project_dir))
                if index.index_memory(
                    project_name,
                    mid,
                    text,
                    {"source": rel, "project": project_name},
                ):
                    count += 1
            if count:
                stats[project_name] = count

    logger.info("批量索引完成: %s", stats)
    return stats


if __name__ == "__main__":
    # 手动触发批量索引的命令行入口
    import argparse

    logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
    parser = argparse.ArgumentParser(description="批量索引 Remember Me 记忆")
    parser.add_argument("--data-dir", type=Path, default=None, help="数据目录")
    parser.add_argument("--query", default=None, help="索引后执行一次测试查询")
    args = parser.parse_args()

    idx = VectorIndex(data_dir=args.data_dir)
    start = time.time()
    result = index_all_memories(idx, args.data_dir)
    print(f"索引完成，耗时 {time.time() - start:.2f}s: {result}")
    if args.query:
        hits = idx.semantic_search(None, args.query, top_k=5)
        print(json.dumps(hits, ensure_ascii=False, indent=2))

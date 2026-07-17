"""简易 HTTP 服务 — 供 VS Code 插件通过 localhost 调用。

使用标准库 ``http.server`` 实现，单线程模型，适合本地开发环境。
"""

from __future__ import annotations

import json
import sys
import threading
from http.server import BaseHTTPRequestHandler, HTTPServer
from pathlib import Path
from typing import Any
from urllib.parse import parse_qs, urlparse

from .cli import backup_list_cmd, search_cmd
from .extractor import ExtractedInfo, InfoExtractor
from .vector_index import GLOBAL_PROJECT, SemanticSearchError, VectorIndex


class _RequestHandler(BaseHTTPRequestHandler):
    """HTTP 请求处理器，实现 Memory Engine REST API。"""

    # 类级共享提取器实例（线程安全，因为 extract() 无副作用）
    extractor = InfoExtractor()
    # 类级共享向量索引（懒加载，首次语义搜索请求时初始化）
    _vector_index: VectorIndex | None = None
    # 向量索引后台预加载完成标志 — A1-修复: 用 Lock 保护跨线程可见性
    _vector_index_ready: bool = False
    _vector_index_lock = threading.Lock()
    # A1-修复: 服务器关闭事件，用于优雅终止后台线程
    _shutdown_event = threading.Event()

    @classmethod
    def get_vector_index(cls, force: bool = False) -> VectorIndex | None:
        """懒加载 VectorIndex 实例。

        Args:
            force: 为 True 时跳过懒加载检查，强制初始化。

        ChromaDB / 模型不可用时返回 None，端点据此返回 503 降级。
        """
        if cls._vector_index is None or force:
            try:
                cls._vector_index = VectorIndex(preload=True)
            except SemanticSearchError as exc:
                sys.stderr.write(f"[semantic] 向量索引不可用: {exc}\n")
                cls._vector_index = None  # type: ignore[assignment]
        return cls._vector_index

    # ------------------------------------------------------------------
    # HTTP 基础
    # ------------------------------------------------------------------

    def log_message(self, format: str, *args: Any) -> None:
        """重写日志输出到 stderr，保留时间戳。"""
        sys.stderr.write(f"[{self.log_date_time_string()}] {format % args}\n")

    def _send_json(self, status: int, data: dict[str, object]) -> None:
        """发送 JSON 响应。"""
        body = json.dumps(data, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.end_headers()
        self.wfile.write(body)

    def _read_json_body(self) -> dict[str, Any]:
        """读取并解析请求体为 JSON 对象。

        Returns:
            解析后的字典。非 JSON 请求返回空字典。
        """
        content_length = self.headers.get("Content-Length")
        if not content_length:
            return {}
        try:
            length = int(content_length)
        except ValueError:
            return {}
        if length <= 0:
            return {}
        raw = self.rfile.read(length).decode("utf-8")
        try:
            data = json.loads(raw)
            if isinstance(data, dict):
                return data
        except json.JSONDecodeError:
            pass
        return {}

    def do_OPTIONS(self) -> None:
        """处理 CORS 预检请求。"""
        self.send_response(204)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.end_headers()

    def do_GET(self) -> None:
        """处理 GET 请求。"""
        parsed = urlparse(self.path)
        path = parsed.path

        if path == "/health":
            self._handle_health()
        elif path == "/backups":
            self._handle_backups(parsed.query)
        else:
            self._send_json(404, {"error": f"未知端点: {path}"})

    def do_POST(self) -> None:
        """处理 POST 请求。"""
        parsed = urlparse(self.path)
        path = parsed.path
        body = self._read_json_body()

        if path == "/extract":
            self._handle_extract(body)
        elif path == "/search":
            self._handle_search(body)
        elif path == "/semantic-search":
            self._handle_semantic_search(body)
        elif path == "/semantic-index":
            self._handle_semantic_index(body)
        elif path == "/hybrid-search":
            self._handle_hybrid_search(body)
        else:
            self._send_json(404, {"error": f"未知端点: {path}"})

    # ------------------------------------------------------------------
    # 端点实现
    # ------------------------------------------------------------------

    def _handle_health(self) -> None:
        """GET /health — 健康检查。"""
        model_loaded = "unknown"
        # 直接检查类级实例，避免在 health check 中触发懒加载阻塞
        index = _RequestHandler._vector_index
        if index is not None:
            model_loaded = getattr(index, "model_name", "unknown")
        # A1-修复: 用锁读取就绪标志，确保跨线程可见性
        with _RequestHandler._vector_index_lock:
            semantic_ready = _RequestHandler._vector_index_ready
        self._send_json(
            200,
            {
                "status": "ok",
                "service": "remember-me-engine",
                "version": "0.3.0",
                "semantic_ready": semantic_ready,
                "model_loaded": model_loaded,
            },
        )

    def _handle_extract(self, body: dict[str, Any]) -> None:
        """POST /extract — 接收文本，返回提取结果。

        请求体示例::

            {
                "text": "我们决定采用 Python 3.11 作为运行时...",
                "include_insights": true,
                "min_confidence": 0.6
            }
        """
        text = body.get("text", "")
        if not isinstance(text, str) or not text.strip():
            self._send_json(400, {"error": "缺少或无效的 'text' 字段"})
            return

        include_insights = body.get("include_insights", False)
        min_confidence = body.get("min_confidence", 0.0)
        if not isinstance(min_confidence, (int, float)):
            min_confidence = 0.0

        extracted = self.extractor.extract(text)
        if min_confidence > 0:
            extracted = [e for e in extracted if e.confidence >= min_confidence]

        response: dict[str, object] = {
            "count": len(extracted),
            "results": [
                {
                    "type": e.type,
                    "raw_text": e.raw_text,
                    "suggested_title": e.suggested_title,
                    "confidence": e.confidence,
                }
                for e in extracted
            ],
        }

        if include_insights:
            insights = self.extractor.generate_insights(extracted)
            response["insights"] = [
                {
                    "category": i.category,
                    "summary": i.summary,
                    "related_indices": i.related_indices,
                    "severity": i.severity,
                }
                for i in insights
            ]

        self._send_json(200, response)

    def _run_keyword_search(
        self,
        keyword: str,
        project: str | None,
        max_results: int,
    ) -> tuple[list[dict[str, Any]], int]:
        """执行关键词搜索，返回匹配列表和扫描文件数（不含 HTTP 响应逻辑）。"""
        from .cli import _data_dir
        import gzip

        data_dir = _data_dir()
        search_root = data_dir
        if isinstance(project, str) and project:
            search_root = data_dir / project

        if not search_root.exists():
            return [], 0

        keyword_lower = keyword.lower()
        matches: list[dict[str, Any]] = []
        files = list(search_root.rglob("*.json")) + list(search_root.rglob("*.json.gz"))

        for file_path in files:
            if len(matches) >= max_results:
                break
            try:
                if file_path.suffixes == [".json", ".gz"]:
                    with gzip.open(file_path, "rt", encoding="utf-8") as f:
                        raw = f.read()
                else:
                    raw = file_path.read_text(encoding="utf-8")
            except (OSError, gzip.BadGzipFile):
                continue

            for line_num, line in enumerate(raw.splitlines(), start=1):
                if keyword_lower in line.lower():
                    snippet = line.strip()
                    if len(snippet) > 200:
                        idx = snippet.lower().find(keyword_lower)
                        start = max(0, idx - 80)
                        end = min(len(snippet), idx + len(keyword) + 80)
                        snippet = snippet[start:end]
                        if start > 0:
                            snippet = "..." + snippet
                        if end < len(line.strip()):
                            snippet = snippet + "..."
                    matches.append(
                        {
                            "file": str(file_path.relative_to(search_root)),
                            "line": line_num,
                            "snippet": snippet,
                        }
                    )
                    if len(matches) >= max_results:
                        break

        return matches, len(files)

    def _handle_search(self, body: dict[str, Any]) -> None:
        """POST /search — 接收关键词，返回搜索结果。

        请求体示例::

            {
                "keyword": "Python",
                "project": "my-project",
                "max_results": 20
            }
        """
        keyword = body.get("keyword", "")
        if not isinstance(keyword, str) or not keyword.strip():
            self._send_json(400, {"error": "缺少或无效的 'keyword' 字段"})
            return

        project = body.get("project")
        max_results = body.get("max_results", 50)
        if not isinstance(max_results, int) or max_results <= 0:
            max_results = 50

        from .cli import _data_dir

        data_dir = _data_dir()
        search_root = data_dir
        if isinstance(project, str) and project:
            search_root = data_dir / project

        if not search_root.exists():
            self._send_json(404, {"error": f"数据目录不存在: {search_root}"})
            return

        matches, files_scanned = self._run_keyword_search(keyword, project, max_results)

        self._send_json(
            200,
            {
                "keyword": keyword,
                "search_root": str(search_root.resolve()),
                "files_scanned": files_scanned,
                "match_count": len(matches),
                "matches": matches,
            },
        )

    def _handle_semantic_search(self, body: dict[str, Any]) -> None:
        """POST /semantic-search — 语义检索记忆。

        请求体示例::

            {
                "project": "my-project",
                "query": "用户登录相关的讨论",
                "top_k": 5,
                "threshold": 0.3
            }

        当 ChromaDB 或嵌入模型不可用时返回 503，引导客户端回退到 /search。
        """
        query = body.get("query", "")
        if not isinstance(query, str) or not query.strip():
            self._send_json(400, {"error": "缺少或无效的 'query' 字段"})
            return

        project = body.get("project")
        if not isinstance(project, str) or not project.strip():
            project = None

        top_k = body.get("top_k", 5)
        if not isinstance(top_k, int) or top_k <= 0:
            top_k = 5

        threshold = body.get("threshold", 0.0)
        if not isinstance(threshold, (int, float)) or threshold < 0:
            threshold = 0.0

        import time

        start = time.perf_counter()
        index = self.get_vector_index()
        if index is None:
            self._send_json(
                503,
                {
                    "error": "语义搜索服务暂不可用",
                    "fallback": "请使用关键词搜索 POST /search",
                    "reason": "chromadb 或 sentence-transformers 未安装",
                },
            )
            return

        try:
            results = index.semantic_search(project, query, top_k=top_k, threshold=threshold)
        except SemanticSearchError as exc:
            self._send_json(
                503,
                {
                    "error": "语义搜索服务暂不可用",
                    "fallback": "请使用关键词搜索 POST /search",
                    "reason": str(exc),
                },
            )
            return

        latency_ms = round((time.perf_counter() - start) * 1000, 2)
        self._send_json(
            200,
            {
                "query": query,
                "project": project or GLOBAL_PROJECT,
                "results": results,
                "total": len(results),
                "latency_ms": latency_ms,
            },
        )

    def _handle_semantic_index(self, body: dict[str, Any]) -> None:
        """POST /semantic-index — 触发批量索引。

        请求体示例::

            {"project": "my-project"}
            {}

        将 ~/.remember-me 下（或指定项目）的 JSON 记忆灌入向量索引。
        """
        from .vector_index import index_all_memories

        index = self.get_vector_index()
        if index is None:
            self._send_json(
                503,
                {
                    "error": "语义搜索服务暂不可用",
                    "reason": "chromadb 或 sentence-transformers 未安装",
                },
            )
            return

        import time

        start = time.perf_counter()
        stats = index_all_memories(index)
        latency_ms = round((time.perf_counter() - start) * 1000, 2)
        self._send_json(
            200,
            {
                "indexed": stats,
                "total_memories": sum(stats.values()),
                "latency_ms": latency_ms,
            },
        )

    def _handle_hybrid_search(self, body: dict[str, Any]) -> None:
        """POST /hybrid-search — 混合检索（关键词 + 语义，RRF 融合）。

        请求体示例::

            {
                "project": "my-project",
                "query": "用户登录相关的讨论",
                "top_k": 5,
                "keyword_weight": 0.3,
                "semantic_weight": 0.7
            }

        内部并行执行关键词搜索（Top-20）与语义搜索（Top-20），
        使用 RRF (Reciprocal Rank Fusion) 公式融合排序::

            score_rrf = Σ 1 / (k + rank_i)   (k = 60)
        """
        query = body.get("query", "")
        if not isinstance(query, str) or not query.strip():
            self._send_json(400, {"error": "缺少或无效的 'query' 字段"})
            return

        project = body.get("project")
        if not isinstance(project, str) or not project.strip():
            project = None

        top_k = body.get("top_k", 5)
        if not isinstance(top_k, int) or top_k <= 0:
            top_k = 5

        keyword_weight = body.get("keyword_weight", 0.3)
        if not isinstance(keyword_weight, (int, float)):
            keyword_weight = 0.3
        semantic_weight = body.get("semantic_weight", 0.7)
        if not isinstance(semantic_weight, (int, float)):
            semantic_weight = 0.7

        # 归一化权重（和为 1）
        total_weight = keyword_weight + semantic_weight
        if total_weight > 0:
            keyword_weight = keyword_weight / total_weight
            semantic_weight = semantic_weight / total_weight
        else:
            keyword_weight, semantic_weight = 0.0, 1.0

        import concurrent.futures
        import time

        start = time.perf_counter()

        def _keyword_search() -> list[dict[str, Any]]:
            """执行关键词搜索，返回 Top-20 结果。"""
            return self._run_keyword_search(query, project, 20)[0]

        def _semantic_search() -> list[dict[str, Any]]:
            """执行语义搜索，返回 Top-20 结果。"""
            index = self.get_vector_index()
            if index is None:
                return []
            try:
                return index.semantic_search(project, query, top_k=20, threshold=0.0)
            except SemanticSearchError:
                return []

        # 并行执行两种搜索
        keyword_results: list[dict[str, Any]] = []
        semantic_results: list[dict[str, Any]] = []
        with concurrent.futures.ThreadPoolExecutor(max_workers=2) as executor:
            future_kw = executor.submit(_keyword_search)
            future_sem = executor.submit(_semantic_search)
            keyword_results = future_kw.result()
            semantic_results = future_sem.result()

        # RRF 融合: score_rrf = Σ w_i * (1 / (k + rank_i))
        k = 60
        scores: dict[str, dict[str, Any]] = {}

        for rank, item in enumerate(keyword_results, start=1):
            key = f"kw:{item['file']}:{item['line']}"
            if key not in scores:
                scores[key] = {
                    "item": item,
                    "keyword_score": 0.0,
                    "semantic_score": 0.0,
                    "rrf_score": 0.0,
                }
            scores[key]["keyword_score"] = 1.0 / (k + rank)
            scores[key]["rrf_score"] += keyword_weight * (1.0 / (k + rank))

        for rank, item in enumerate(semantic_results, start=1):
            key = item.get("id", f"sem:{rank}")
            if key not in scores:
                scores[key] = {
                    "item": item,
                    "keyword_score": 0.0,
                    "semantic_score": 0.0,
                    "rrf_score": 0.0,
                }
            scores[key]["semantic_score"] = 1.0 / (k + rank)
            scores[key]["rrf_score"] += semantic_weight * (1.0 / (k + rank))

        # 排序并取 top_k
        sorted_scores = sorted(scores.values(), key=lambda x: x["rrf_score"], reverse=True)
        top_results = sorted_scores[:top_k]

        # 构造响应（与 /semantic-search 格式一致，新增 hybrid_scores）
        results: list[dict[str, Any]] = []
        for entry in top_results:
            item = entry["item"]
            # 统一字段：语义结果已有 id/text/score/metadata，关键词结果需要映射
            if "id" in item:
                # 语义结果格式
                result_item: dict[str, Any] = {
                    "id": item.get("id", ""),
                    "text": item.get("text", ""),
                    "score": round(entry["rrf_score"], 4),
                    "metadata": item.get("metadata", {}),
                }
            else:
                # 关键词结果格式
                result_item = {
                    "id": f"{item.get('file', '')}:{item.get('line', 0)}",
                    "text": item.get("snippet", ""),
                    "score": round(entry["rrf_score"], 4),
                    "metadata": {
                        "file": item.get("file", ""),
                        "line": item.get("line", 0),
                        "source": "keyword",
                    },
                }
            result_item["hybrid_scores"] = {
                "keyword": round(entry["keyword_score"], 4),
                "semantic": round(entry["semantic_score"], 4),
                "rrf": round(entry["rrf_score"], 4),
            }
            results.append(result_item)

        latency_ms = round((time.perf_counter() - start) * 1000, 2)
        self._send_json(
            200,
            {
                "query": query,
                "project": project or GLOBAL_PROJECT,
                "results": results,
                "total": len(results),
                "latency_ms": latency_ms,
            },
        )

    def _handle_backups(self, query: str) -> None:
        """GET /backups?file=<path> — 列出备份。

        查询参数::

            file    目标文件绝对路径或相对路径（必须）
        """
        params = parse_qs(query)
        file_param = params.get("file", [""])[0]
        if not file_param:
            self._send_json(400, {"error": "缺少 'file' 查询参数"})
            return

        target = Path(file_param).resolve()
        if not target.exists():
            self._send_json(404, {"error": f"目标文件不存在: {target}"})
            return

        backups_dir = target.parent / ".backups"
        if not backups_dir.exists():
            self._send_json(
                200,
                {
                    "target": str(target),
                    "backups_dir": str(backups_dir),
                    "backup_count": 0,
                    "backups": [],
                },
            )
            return

        stem = target.stem
        backups: list[dict[str, object]] = []
        import time

        for entry in backups_dir.iterdir():
            if not entry.is_file():
                continue
            name = entry.name
            if not name.startswith(stem):
                continue
            try:
                stat = entry.stat()
                mtime = stat.st_mtime
                size = stat.st_size
            except OSError:
                continue
            backups.append(
                {
                    "name": name,
                    "path": str(entry.resolve()),
                    "size_bytes": size,
                    "modified": time.strftime(
                        "%Y-%m-%d %H:%M:%S", time.localtime(mtime)
                    ),
                    "timestamp": mtime,
                }
            )

        backups.sort(key=lambda b: b["timestamp"], reverse=True)  # type: ignore[arg-type]

        self._send_json(
            200,
            {
                "target": str(target),
                "backups_dir": str(backups_dir),
                "backup_count": len(backups),
                "backups": backups,
            },
        )


class MemoryEngineServer:
    """简易 HTTP 服务，供 VS Code 插件或其他客户端通过 localhost 调用。

    提供以下端点::

        POST /extract            接收文本，返回提取结果
        POST /search             接收关键词，返回搜索结果
        POST /semantic-search    语义检索记忆（ChromaDB + sentence-transformers）
        POST /semantic-index     触发批量索引
        POST /hybrid-search      混合检索（关键词 + 语义，RRF 融合）
        GET  /health             健康检查
        GET  /backups            列出备份历史

    用法::

        server = MemoryEngineServer(host="127.0.0.1", port=8765)
        server.run()
    """

    def __init__(self, host: str = "127.0.0.1", port: int = 8765) -> None:
        """初始化服务器。

        Args:
            host: 监听地址，默认仅本地回环。
            port: 监听端口。
        """
        self.host = host
        self.port = port
        self._server: HTTPServer | None = None

    def run(self) -> None:
        """启动阻塞式 HTTP 服务。"""
        self._server = HTTPServer((self.host, self.port), _RequestHandler)
        print(
            f"Remember Me Engine 服务已启动: http://{self.host}:{self.port}",
            file=sys.stderr,
        )
        print("按 Ctrl+C 停止服务", file=sys.stderr)

        # A2: 后台线程延迟预加载语义搜索模型
        def _preload_vector_index() -> None:
            """延迟初始化向量索引，完成后设置就绪标志。"""
            import time

            # A1-修复: 缩短固定睡眠，改为可中断的轮询，提升关闭响应性
            for _ in range(20):  # 2 秒 = 20 × 0.1 秒
                if _RequestHandler._shutdown_event.is_set():
                    return
                time.sleep(0.1)
            try:
                _RequestHandler.get_vector_index(force=True)
                # A1-修复: 用锁保护就绪标志写入
                with _RequestHandler._vector_index_lock:
                    _RequestHandler._vector_index_ready = True
                sys.stderr.write("[preload] 后台向量索引预加载完成\n")
            except SemanticSearchError as exc:
                # A1-修复: 保留具体异常类型信息，便于诊断
                sys.stderr.write(
                    f"[preload] 后台向量索引预加载失败 ({type(exc).__name__}): {exc}\n"
                )
            except Exception as exc:  # noqa: BLE001
                sys.stderr.write(
                    f"[preload] 后台向量索引预加载失败 ({type(exc).__name__}): {exc}\n"
                )

        preload_thread = threading.Thread(target=_preload_vector_index, daemon=True)
        preload_thread.start()

        try:
            self._server.serve_forever()
        except KeyboardInterrupt:
            print("\n正在关闭服务...", file=sys.stderr)
        finally:
            # A1-修复: 通知后台预加载线程优雅退出
            _RequestHandler._shutdown_event.set()
            self._server.server_close()
            # 释放向量索引资源
            if _RequestHandler._vector_index is not None:
                _RequestHandler._vector_index.close()
                _RequestHandler._vector_index = None

    def run_once(self) -> None:
        """处理单个请求后退出（用于测试）。"""
        server = HTTPServer((self.host, self.port), _RequestHandler)
        server.handle_request()
        server.server_close()


def main(argv: list[str] | None = None) -> None:
    """命令行入口，用于直接启动 HTTP 服务。"""
    import argparse

    parser = argparse.ArgumentParser(
        prog="remember-me-server",
        description="启动 Remember Me Engine HTTP 服务",
    )
    parser.add_argument(
        "--host",
        default="127.0.0.1",
        help="监听地址 (默认: 127.0.0.1)",
    )
    parser.add_argument(
        "--port",
        type=int,
        default=8765,
        help="监听端口 (默认: 8765)",
    )
    args = parser.parse_args(argv)

    server = MemoryEngineServer(host=args.host, port=args.port)
    server.run()


if __name__ == "__main__":
    main()

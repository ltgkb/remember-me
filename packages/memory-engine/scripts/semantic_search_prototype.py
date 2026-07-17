#!/usr/bin/env python3
"""
Remember Me — 语义搜索快速原型验证脚本
任务组 D1：ChromaDB + sentence-transformers 原型验证

运行方式:
    cd packages/memory-engine
    uv run scripts/semantic_search_prototype.py
    # 或
    .venv/Scripts/python.exe scripts/semantic_search_prototype.py

降级策略：若 chromadb 或 sentence-transformers 导入失败，自动切换为纯 NumPy cosine similarity。
"""

from __future__ import annotations

import json
import os
import random
import sys
import time
from dataclasses import dataclass, field
from pathlib import Path
from typing import List, Tuple

# ---------------------------------------------------------------------------
# 1. 依赖探测与降级策略
# ---------------------------------------------------------------------------
USE_CHROMADB = False
USE_SENTENCE_TRANSFORMERS = False

# 尝试导入 chromadb
try:
    import chromadb
    USE_CHROMADB = True
except Exception as e:
    print(f"[WARN] ChromaDB 导入失败: {e}，将使用纯 NumPy 降级方案")

# 尝试导入 sentence-transformers
try:
    from sentence_transformers import SentenceTransformer
    USE_SENTENCE_TRANSFORMERS = True
except Exception as e:
    print(f"[WARN] sentence-transformers 导入失败: {e}，将使用纯 NumPy 降级方案")

# 纯 NumPy 降级必备
try:
    import numpy as np
except Exception as e:
    print(f"[FATAL] NumPy 不可用: {e}")
    sys.exit(1)

# ---------------------------------------------------------------------------
# 2. 全局配置
# ---------------------------------------------------------------------------
MODEL_NAME = "all-MiniLM-L6-v2"
EMBEDDING_DIM = 384
TOP_K = 5

# 持久化路径（仅当使用 ChromaDB PersistentClient 时记录磁盘占用）
PERSIST_DIR = Path(__file__).parent.parent / "data" / "chroma_prototype"


# ---------------------------------------------------------------------------
# 3. 模拟记忆片段数据（100 条，中英文混合）
# ---------------------------------------------------------------------------
MEMORY_TEMPLATES = [
    # --- PRD / 需求相关 (1-15) ---
    {"category": "PRD", "lang": "zh", "text": "PRD v2.3：用户登录模块需支持 OAuth2 + 短信验证码双因子认证"},
    {"category": "PRD", "lang": "en", "text": "PRD requirement: login flow must support SSO integration with Azure AD"},
    {"category": "PRD", "lang": "zh", "text": "需求评审结论：记住我功能在 Phase 4 引入语义搜索，允许用户用自然语言检索历史记忆"},
    {"category": "PRD", "lang": "en", "text": "Product decision: semantic search will be a Pro-only feature gated by license key"},
    {"category": "PRD", "lang": "zh", "text": "PRD 更新：设置页面新增「语义搜索模型选择」下拉框（all-MiniLM-L6-v2 / bge-small-zh）"},
    {"category": "PRD", "lang": "en", "text": "User story: as a developer, I want to search my codebase memories by natural language so that I can find past decisions quickly"},
    {"category": "PRD", "lang": "zh", "text": "需求文档：记忆编辑器需要支持 Markdown 语法高亮和实时预览"},
    {"category": "PRD", "lang": "en", "text": "Feature spec: auto-extract keywords from memory content using NLP pipeline"},
    {"category": "PRD", "lang": "zh", "text": "产品决策：免费版最多存储 1000 条记忆，Pro 版无限制"},
    {"category": "PRD", "lang": "en", "text": "PRD clarification: memory sync should be incremental, not full rebuild every time"},
    {"category": "PRD", "lang": "zh", "text": "需求变更：取消原定的 GraphQL 接口，改为 RESTful HTTP API 降低集成复杂度"},
    {"category": "PRD", "lang": "en", "text": "Mobile app spec: offline-first architecture with background sync when network returns"},
    {"category": "PRD", "lang": "zh", "text": "PRD 遗留问题：是否需要支持团队共享记忆空间，待 Phase 5 再评估"},
    {"category": "PRD", "lang": "en", "text": "Accessibility requirement: all UI components must pass WCAG 2.1 AA contrast ratio"},
    {"category": "PRD", "lang": "zh", "text": "产品需求：导出功能支持 JSON / Markdown / PDF 三种格式"},

    # --- 技术决策 (16-35) ---
    {"category": "tech", "lang": "zh", "text": "技术决策：采用 ChromaDB 作为向量数据库，因其支持元数据过滤且安装简单"},
    {"category": "tech", "lang": "en", "text": "Architecture decision: use FastAPI for memory-engine HTTP service instead of Flask for async support"},
    {"category": "tech", "lang": "zh", "text": "选型结论：嵌入模型选用 all-MiniLM-L6-v2，384 维，多语言支持，体积约 80MB"},
    {"category": "tech", "lang": "en", "text": "Tech decision: memory storage will use SQLite with JSONB for flexible schema evolution"},
    {"category": "tech", "lang": "zh", "text": "后端讨论：Python 3.12 作为最低版本，放弃 3.10 支持以使用类型参数语法"},
    {"category": "tech", "lang": "en", "text": "We chose Pydantic v2 for data validation; migration from v1 is tracked in issue #89"},
    {"category": "tech", "lang": "zh", "text": "技术方案：VS Code 插件通过 LSP 风格的 JSON-RPC 与 memory-engine 通信，避免额外端口占用"},
    {"category": "tech", "lang": "en", "text": "Security review: API tokens must be rotated every 90 days; implement refresh endpoint"},
    {"category": "tech", "lang": "zh", "text": "决策记录：放弃 FAISS，选择 ChromaDB 的原因是 Windows 安装体验更好"},
    {"category": "tech", "lang": "en", "text": "Database schema v3: added vector_embedding column and GIN index on metadata JSONB"},
    {"category": "tech", "lang": "zh", "text": "技术讨论：如何处理大文件记忆的向量切片？结论：按 512 token 滑动窗口分块"},
    {"category": "tech", "lang": "en", "text": "CI/CD decision: use GitHub Actions with self-hosted Windows runner for VS Code extension tests"},
    {"category": "tech", "lang": "zh", "text": "性能优化：向量索引采用 HNSW，参数 ef_construction=200, M=16"},
    {"category": "tech", "lang": "en", "text": "Caching strategy: embed model loaded once per process, shared across requests via singleton"},
    {"category": "tech", "lang": "zh", "text": "技术债务：当前 JSON 文件存储没有版本号，需在 header 中加入 schema_version 字段"},
    {"category": "tech", "lang": "en", "text": "Monitoring: add OpenTelemetry traces for semantic search pipeline latency breakdown"},
    {"category": "tech", "lang": "zh", "text": "架构评审：将提取器（extractor）从插件端迁移到 Python 服务，减少 Extension Host 内存占用"},
    {"category": "tech", "lang": "en", "text": "Refactor plan: split EngineClient into SyncClient and AsyncClient to support both sync and async consumers"},
    {"category": "tech", "lang": "zh", "text": "部署方案：PyInstaller 打包 memory-engine 为独立 exe，用户无需安装 Python 环境"},
    {"category": "tech", "lang": "en", "text": "Error handling: semantic search failures should degrade gracefully to keyword search without user interruption"},

    # --- 论文 / 学术 (36-50) ---
    {"category": "paper", "lang": "zh", "text": "论文阅读：Devign 使用图神经网络检测软件漏洞，启发我们可用 GNN 做记忆关系建模"},
    {"category": "paper", "lang": "en", "text": "Paper: 'BERT-based semantic search for code review comments' — relevant to our memory retrieval approach"},
    {"category": "paper", "lang": "zh", "text": "学术讨论：对比学习（Contrastive Learning）在句子表示中的应用，可用于优化记忆相似度排序"},
    {"category": "paper", "lang": "en", "text": "Survey: neural information retrieval with dense passage retrieval (DPR) — good baseline for our system"},
    {"category": "paper", "lang": "zh", "text": "论文笔记：COLING 2024 有一篇关于多语言语义搜索的，提到代码注释的跨语言检索挑战"},
    {"category": "paper", "lang": "en", "text": "Research insight: fine-tuning MiniLM on domain-specific corpus improves recall by 12% in technical Q&A"},
    {"category": "paper", "lang": "zh", "text": "文献综述：边缘计算场景下的异常检测综述，特别关注了跨操作系统主机遥测数据"},
    {"category": "paper", "lang": "en", "text": "Paper: 'Self-supervised learning for time-series anomaly detection on IoT edge nodes' — IoT security focus"},
    {"category": "paper", "lang": "zh", "text": "学术灵感：可以把 CORAL 域自适应方法借鉴到记忆迁移学习——旧项目记忆迁移到新项目"},
    {"category": "paper", "lang": "en", "text": "Related work: hnswlib achieves 99.3% recall@10 on SIFT1M with 3.5ms latency — performance benchmark"},
    {"category": "paper", "lang": "zh", "text": "论文写作：IEEE IoT Journal 投稿要求双栏 10pt 格式，图表需为矢量图（EPS/SVG）"},
    {"category": "paper", "lang": "en", "text": "Citation: the CORAL method for domain adaptation was introduced by Sun et al. in 2016, now widely adopted"},
    {"category": "paper", "lang": "zh", "text": "实验设计：KS 筛选后的特征子集在 Windows-Linux 跨域检测上 F1 提升 8.3%"},
    {"category": "paper", "lang": "en", "text": "Academic note: transformer-based embedding models outperform TF-IDF by large margins on semantic similarity tasks"},
    {"category": "paper", "lang": "zh", "text": "学术会议：准备投稿 ACM SIGCOMM 2027 Workshop on Edge Intelligence"},

    # --- 竞品分析 (51-65) ---
    {"category": "competitor", "lang": "zh", "text": "竞品分析：Mem.ai 支持语义搜索，但数据存储在云端，隐私性不如我们的本地方案"},
    {"category": "competitor", "lang": "en", "text": "Competitor: Notion AI has Q&A feature but requires cloud sync — we differentiate on offline-first"},
    {"category": "competitor", "lang": "zh", "text": "竞品调研：Obsidian 的 Graph View 可视化记忆关系，我们 Phase 5 可考虑类似功能"},
    {"category": "competitor", "lang": "en", "text": "Analysis: Raycast has quick AI search but no persistent memory layer — opportunity for us"},
    {"category": "competitor", "lang": "zh", "text": "竞品对比：Roam Research 的双向链接理念很好，但学习曲线陡峭，我们应保持简单直接"},
    {"category": "competitor", "lang": "en", "text": "Competitive landscape: GitHub Copilot Chat remembers conversation context but not across sessions"},
    {"category": "competitor", "lang": "zh", "text": "竞品分析：Cursor 的 composer 功能可以记住项目级代码决策，是我们要追赶的方向"},
    {"category": "competitor", "lang": "en", "text": "Differentiation: our semantic search works on both Chinese and English memories natively, unlike some US-only tools"},
    {"category": "competitor", "lang": "zh", "text": "竞品缺陷：大多数笔记工具不支持向量搜索，只依赖标签和文件夹分类"},
    {"category": "competitor", "lang": "en", "text": "Pricing analysis: competitors charge $10-20/month for AI features; our Pro tier at $8 is competitive"},
    {"category": "competitor", "lang": "zh", "text": "竞品调研：Apple Notes 的搜索基于 Spotlight 索引，没有语义理解能力"},
    {"category": "competitor", "lang": "en", "text": "Feature gap: no competitor offers local semantic search with cross-language matching in developer tools"},
    {"category": "competitor", "lang": "zh", "text": "竞品观察：Logseq 的查询语法强大但太复杂，普通用户难以掌握"},
    {"category": "competitor", "lang": "en", "text": "Market signal: rising interest in 'second brain' tools indicates strong demand for memory augmentation"},
    {"category": "competitor", "lang": "zh", "text": "竞品总结：我们的核心优势是本地优先 + 语义搜索 + 开发者场景深度优化"},

    # --- 日常开发记录 (66-85) ---
    {"category": "devlog", "lang": "zh", "text": "今天修复了 memory-engine 的并发写入 bug，原因是 SQLite 连接没有正确关闭"},
    {"category": "devlog", "lang": "en", "text": "Debug session: traced memory leak to unclosed file handles in JSON loader — fixed with context manager"},
    {"category": "devlog", "lang": "zh", "text": "重构 cli.py，将命令解析逻辑抽离到 commands 子模块，主文件减少 200 行"},
    {"category": "devlog", "lang": "en", "text": "Code review: suggested using dataclasses instead of dicts for MemoryItem to improve type safety"},
    {"category": "devlog", "lang": "zh", "text": "今日进展：完成了 extractor 的 keyword 提取模块，支持中文分词和英文词干还原"},
    {"category": "devlog", "lang": "en", "text": "Sprint retro: semantic search took longer than expected due to model download issues; need offline bundle"},
    {"category": "devlog", "lang": "zh", "text": "测试发现：Windows 上文件路径含中文时 glob 匹配失败，已改用 pathlib 的 rglob"},
    {"category": "devlog", "lang": "en", "text": "Performance test: keyword search on 5000 memories takes 12ms; target for semantic search is <100ms"},
    {"category": "devlog", "lang": "zh", "text": "技术讨论：是否引入 redis 做缓存？结论：单机场景没必要，SQLite 的内存缓存足够"},
    {"category": "devlog", "lang": "en", "text": "Refactor: moved all HTTP route definitions to routers/ subpackage for better scalability"},
    {"category": "devlog", "lang": "zh", "text": "今日踩坑：sentence-transformers 在 Python 3.14 上安装 torch 耗时很长，需要预编译 wheel"},
    {"category": "devlog", "lang": "en", "text": "Experiment: tried ONNX runtime for embedding inference — 2x faster but increases binary size by 40MB"},
    {"category": "devlog", "lang": "zh", "text": "团队讨论：搜索结果的「为什么匹配」解释功能，先用关键词重叠高亮做 MVP"},
    {"category": "devlog", "lang": "en", "text": "Meeting notes: decided to use uv for Python packaging instead of poetry for faster dependency resolution"},
    {"category": "devlog", "lang": "zh", "text": " Bug 修复：设置页面的搜索防抖间隔从 300ms 改为 500ms，减少输入过程中的无效请求"},
    {"category": "devlog", "lang": "en", "text": "UX improvement: added keyboard shortcut Ctrl+Shift+R for quick semantic search from any editor"},
    {"category": "devlog", "lang": "zh", "text": "代码质量：为 server.py 添加 85% 的单元测试覆盖率，重点覆盖异常处理分支"},
    {"category": "devlog", "lang": "en", "text": "DevOps: set up GitHub Actions workflow to build VS Code extension vsix on every PR"},
    {"category": "devlog", "lang": "zh", "text": "部署记录：v1.2.0 发布后收到 3 个关于 Windows 防火墙阻止的反馈，需要添加自动端口检测"},
    {"category": "devlog", "lang": "en", "text": "Release note: v1.3.0-beta includes semantic search MVP; invite 20 users for closed beta testing"},

    # --- 会议 / 沟通 (86-100) ---
    {"category": "meeting", "lang": "zh", "text": "周会结论：本周重点完成语义搜索原型验证，下周进入正式集成开发"},
    {"category": "meeting", "lang": "en", "text": "Sprint planning: allocated 8 story points for vector index sync module and 5 for HTTP endpoint"},
    {"category": "meeting", "lang": "zh", "text": "与设计师沟通：搜索结果页需要展示相似度分数和匹配关键词高亮"},
    {"category": "meeting", "lang": "en", "text": "User interview: developer mentioned they often forget why they chose a specific library version — pain point confirmed"},
    {"category": "meeting", "lang": "zh", "text": "技术评审：ChromaDB 的 SQLite 锁定问题在单进程写入模式下可避免，方案通过"},
    {"category": "meeting", "lang": "en", "text": "Stakeholder review: Pro pricing approved at $8/month or $80/year with 2-month free trial"},
    {"category": "meeting", "lang": "zh", "text": "团队建设：讨论远程协作工具，决定使用 Slack 做即时沟通，Notion 做文档沉淀"},
    {"category": "meeting", "lang": "en", "text": "All-hands: Q3 OKR includes 'launch semantic search to 100 beta users with NPS > 40'"},
    {"category": "meeting", "lang": "zh", "text": "与法务确认：all-MiniLM-L6-v2 采用 Apache 2.0 协议，可商用，无需额外授权"},
    {"category": "meeting", "lang": "en", "text": "Partner discussion: potential integration with JetBrains IDE plugin — evaluate after VS Code stable release"},
    {"category": "meeting", "lang": "zh", "text": "月会总结：用户增长 15%，付费转化 3.2%，核心功能满意度 4.6/5"},
    {"category": "meeting", "lang": "en", "text": "Retrospective: we underestimated Windows compatibility testing; add dedicated QA task for Windows in next sprint"},
    {"category": "meeting", "lang": "zh", "text": "需求澄清会：「语义搜索」和「智能推荐」的边界——前者是用户主动查询，后者是系统被动推送"},
    {"category": "meeting", "lang": "en", "text": "Investor update: demoed semantic search live; feedback was positive on cross-language retrieval accuracy"},
    {"category": "meeting", "lang": "zh", "text": "产品评审：确认语义搜索的默认排序按相似度降序，支持按时间二次排序"},
]


def generate_memories(n: int = 100) -> List[dict]:
    """生成 n 条模拟记忆，若模板不足则随机拼接扩展。"""
    base = MEMORY_TEMPLATES[:n]
    if len(base) < n:
        random.seed(42)
        ext = []
        for i in range(n - len(base)):
            tpl = random.choice(MEMORY_TEMPLATES)
            ext.append({
                "id": f"mem_{len(base)+i:03d}",
                "category": tpl["category"],
                "lang": tpl["lang"],
                "text": tpl["text"] + f" [variant-{i}]",
            })
        base = [dict(t, id=f"mem_{i:03d}") for i, t in enumerate(base)] + ext
    else:
        base = [dict(t, id=f"mem_{i:03d}") for i, t in enumerate(base[:n])]
    return base


# ---------------------------------------------------------------------------
# 4. 纯 NumPy 降级向量索引
# ---------------------------------------------------------------------------
@dataclass
class SimpleVectorIndex:
    """基于 NumPy 的简易向量索引（cosine similarity）。"""

    embeddings: np.ndarray = field(default_factory=lambda: np.zeros((0, EMBEDDING_DIM), dtype=np.float32))
    documents: List[dict] = field(default_factory=list)
    model_name: str = MODEL_NAME

    def _norm(self, vectors: np.ndarray) -> np.ndarray:
        norms = np.linalg.norm(vectors, axis=1, keepdims=True)
        norms[norms == 0] = 1.0
        return vectors / norms

    def add(self, docs: List[dict], embeddings: np.ndarray):
        self.documents.extend(docs)
        if self.embeddings.size == 0:
            self.embeddings = embeddings.copy()
        else:
            self.embeddings = np.vstack([self.embeddings, embeddings])

    def query(self, query_embedding: np.ndarray, top_k: int = TOP_K) -> Tuple[List[dict], List[float], float]:
        start = time.perf_counter()
        q_norm = query_embedding / (np.linalg.norm(query_embedding) + 1e-10)
        doc_norms = self._norm(self.embeddings)
        similarities = doc_norms @ q_norm
        top_indices = np.argsort(similarities)[::-1][:top_k]
        latency_ms = (time.perf_counter() - start) * 1000
        results = [self.documents[i] for i in top_indices]
        scores = [float(similarities[i]) for i in top_indices]
        return results, scores, latency_ms


# ---------------------------------------------------------------------------
# 5. 主流程
# ---------------------------------------------------------------------------
def main():
    print("=" * 72)
    print("Remember Me — 语义搜索快速原型验证")
    print("=" * 72)
    print(f"运行时间: {time.strftime('%Y-%m-%d %H:%M:%S')}")
    print(f"Python: {sys.version}")
    print(f"工作目录: {Path.cwd()}")
    print()

    # 5.1 生成数据
    memories = generate_memories(100)
    print(f"[1] 已生成 {len(memories)} 条模拟记忆片段")
    lang_dist = {"zh": 0, "en": 0}
    for m in memories:
        lang_dist[m["lang"]] += 1
    print(f"    语言分布: 中文 {lang_dist['zh']} 条, 英文 {lang_dist['en']} 条")
    print()

    # 5.2 加载嵌入模型
    print("[2] 加载嵌入模型...")
    t0 = time.perf_counter()
    if USE_SENTENCE_TRANSFORMERS:
        print(f"    使用 sentence-transformers: {MODEL_NAME}")
        model = SentenceTransformer(MODEL_NAME)
        model_load_ms = (time.perf_counter() - t0) * 1000
        print(f"    模型加载耗时: {model_load_ms:.1f} ms")
    else:
        print("    [降级] 使用随机向量（无法验证语义相关性，仅做延迟基准）")
        model = None
        model_load_ms = 0.0
    print()

    # 5.3 构建索引
    print("[3] 构建向量索引...")
    texts = [m["text"] for m in memories]

    if USE_SENTENCE_TRANSFORMERS:
        t0 = time.perf_counter()
        embeddings = model.encode(texts, show_progress_bar=False, convert_to_numpy=True)
        encode_ms = (time.perf_counter() - t0) * 1000
        print(f"    100 条记忆编码耗时: {encode_ms:.1f} ms")
    else:
        random.seed(42)
        embeddings = np.random.randn(len(memories), EMBEDDING_DIM).astype(np.float32)
        encode_ms = 0.0
        print("    [降级] 随机生成 384 维向量")

    # 磁盘占用（持久化模式）
    disk_usage_kb = 0.0

    if USE_CHROMADB and USE_SENTENCE_TRANSFORMERS:
        print(f"    使用 ChromaDB PersistentClient (持久化目录: {PERSIST_DIR})")
        PERSIST_DIR.mkdir(parents=True, exist_ok=True)
        # 清理旧数据以获取准确磁盘占用
        for p in PERSIST_DIR.rglob("*"):
            if p.is_file():
                p.unlink()
        if PERSIST_DIR.exists():
            for p in PERSIST_DIR.iterdir():
                if p.is_dir():
                    import shutil
                    shutil.rmtree(p)

        client = chromadb.PersistentClient(path=str(PERSIST_DIR))
        collection = client.get_or_create_collection(
            name="prototype_memories",
            metadata={"hnsw:space": "cosine"}
        )
        t0 = time.perf_counter()
        collection.add(
            ids=[m["id"] for m in memories],
            documents=[m["text"] for m in memories],
            embeddings=[e.tolist() for e in embeddings],
            metadatas=[{"category": m["category"], "lang": m["lang"]} for m in memories],
        )
        index_ms = (time.perf_counter() - t0) * 1000
        print(f"    ChromaDB 索引构建耗时: {index_ms:.1f} ms")

        # 计算磁盘占用
        disk_usage_bytes = sum(f.stat().st_size for f in PERSIST_DIR.rglob("*") if f.is_file())
        disk_usage_kb = disk_usage_bytes / 1024
        print(f"    持久化磁盘占用: {disk_usage_kb:.1f} KB")
    else:
        print("    [降级] 使用纯 NumPy 内存索引")
        index = SimpleVectorIndex()
        t0 = time.perf_counter()
        index.add(memories, embeddings)
        index_ms = (time.perf_counter() - t0) * 1000
        print(f"    NumPy 索引构建耗时: {index_ms:.1f} ms")
    print()

    # 5.4 定义查询
    queries = [
        ("中文查询", "用户登录相关的讨论"),
        ("英文查询", "authentication and OAuth decisions"),
        ("混合查询", "Python 项目的认证方案"),
    ]

    # 5.5 执行查询
    print("[4] 执行查询测试 (Top-5)...")
    query_results = []
    for label, query_text in queries:
        print(f"\n  ── {label}: \"{query_text}\" ──")

        if USE_SENTENCE_TRANSFORMERS:
            q_emb = model.encode(query_text, convert_to_numpy=True)
        else:
            q_emb = np.random.randn(EMBEDDING_DIM).astype(np.float32)

        if USE_CHROMADB and USE_SENTENCE_TRANSFORMERS:
            t0 = time.perf_counter()
            res = collection.query(query_embeddings=[q_emb.tolist()], n_results=TOP_K)
            latency_ms = (time.perf_counter() - t0) * 1000
            docs = res["documents"][0]
            metas = res["metadatas"][0]
            dists = res["distances"][0]
            # ChromaDB 使用 cosine distance: distance = 1 - cosine_similarity
            # 因此 cosine_similarity = 1 - distance
            scores = [1 - d for d in dists]
            top5 = [
                {"text": d, "category": m["category"], "lang": m["lang"], "score": s}
                for d, m, s in zip(docs, metas, scores)
            ]
        else:
            results, scores, latency_ms = index.query(q_emb, top_k=TOP_K)
            top5 = [
                {"text": r["text"], "category": r["category"], "lang": r["lang"], "score": s}
                for r, s in zip(results, scores)
            ]

        print(f"    查询延迟: {latency_ms:.2f} ms")
        for rank, item in enumerate(top5, 1):
            flag = "[HIT]" if item["score"] > 0.5 else "     "
            print(f"    {flag} #{rank} [score={item['score']:.4f}] [{item['lang']}] {item['text'][:90]}...")

        query_results.append({
            "label": label,
            "query": query_text,
            "latency_ms": latency_ms,
            "top5": top5,
        })
    print()

    # 5.6 跨语言效果评估
    print("[5] 跨语言语义匹配评估...")
    if USE_SENTENCE_TRANSFORMERS:
        cross_lang_pairs = [
            ("用户登录相关的讨论", "en", "中文查询召回英文记忆"),
            ("authentication and OAuth decisions", "zh", "英文查询召回中文记忆"),
            ("Python 项目的认证方案", "en", "混合查询召回英文记忆"),
        ]
        for query_text, expected_lang, desc in cross_lang_pairs:
            q_emb = model.encode(query_text, convert_to_numpy=True)
            if USE_CHROMADB:
                res = collection.query(query_embeddings=[q_emb.tolist()], n_results=TOP_K)
                metas = res["metadatas"][0]
            else:
                results, _, _ = index.query(q_emb, top_k=TOP_K)
                metas = results
            cross_hits = sum(1 for m in metas if m["lang"] == expected_lang)
            print(f"    {desc}: Top-5 中召回 {expected_lang} 语言 {cross_hits}/5 条")
    else:
        print("    [降级] 无法评估跨语言效果（使用随机向量）")
    print()

    # 5.7 汇总输出
    print("=" * 72)
    print("验证结果汇总")
    print("=" * 72)
    summary = {
        "timestamp": time.strftime("%Y-%m-%d %H:%M:%S"),
        "python_version": sys.version,
        "model": MODEL_NAME if USE_SENTENCE_TRANSFORMERS else "random_dummy",
        "vector_db": "ChromaDB" if USE_CHROMADB else "NumPy",
        "model_load_ms": round(model_load_ms, 2),
        "encode_100_ms": round(encode_ms, 2),
        "index_build_ms": round(index_ms, 2),
        "disk_usage_kb": round(disk_usage_kb, 2),
        "queries": [
            {
                "label": r["label"],
                "query": r["query"],
                "latency_ms": round(r["latency_ms"], 2),
                "top5_scores": [round(item["score"], 4) for item in r["top5"]],
                "top5_langs": [item["lang"] for item in r["top5"]],
            }
            for r in query_results
        ],
    }
    print(json.dumps(summary, indent=2, ensure_ascii=False))
    print()

    # 5.8 保存详细 JSON 供报告引用
    report_json_path = Path(__file__).parent.parent.parent.parent / "docs" / "research" / "semantic-search-prototype-results.json"
    report_json_path.parent.mkdir(parents=True, exist_ok=True)
    with open(report_json_path, "w", encoding="utf-8") as f:
        json.dump(summary, f, indent=2, ensure_ascii=False)
    print(f"[INFO] 详细结果已保存: {report_json_path}")
    print()

    # 返回状态
    return summary


if __name__ == "__main__":
    summary = main()
    sys.exit(0)

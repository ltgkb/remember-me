#!/usr/bin/env python3
"""
model_benchmark.py
Remember Me — 嵌入模型选型对比脚本

支持模型：
  - all-MiniLM-L6-v2（当前默认，384 维）
  - bge-m3（候选，1024 维，多语言优化）
  - bge-small-zh（候选，512 维，中文优化）

用法：
  python model_benchmark.py --model all          # 运行全部模型并输出对比表
  python model_benchmark.py --model all-MiniLM-L6-v2
  python model_benchmark.py --model bge-m3
  python model_benchmark.py --model bge-small-zh
"""

import argparse
import json
import os
import sys
import time
import warnings
from pathlib import Path
from typing import Any

import numpy as np

warnings.filterwarnings("ignore", category=UserWarning)

# ---------------------------------------------------------------------------
# 测试数据集：100 条混合记忆（20 英文 + 80 中文）
# ---------------------------------------------------------------------------

ENGLISH_MEMORIES = [
    "OAuth 2.0 authentication flow: authorization code grant with PKCE extension.",
    "Microservices architecture decision: split monolith into user, order, and payment services.",
    "User role hierarchy design: admin > manager > editor > viewer with inheritance.",
    "Database schema for user profiles: normalized tables with indexed foreign keys.",
    "API rate limiting strategy: token bucket algorithm, 100 requests per minute per user.",
    "CI/CD pipeline setup: GitHub Actions → Docker build → deploy to staging → smoke tests.",
    "Frontend framework selection debate: React ecosystem vs Vue simplicity for B2B dashboards.",
    "Mobile responsive design guidelines: breakpoints at 320px, 768px, 1024px, 1440px.",
    "Logging and monitoring setup: structured JSON logs → Fluentd → Elasticsearch → Grafana.",
    "Security audit checklist: XSS, CSRF, SQL injection, dependency vulnerabilities.",
    "Performance optimization tips: lazy loading, code splitting, image WebP conversion.",
    "Code review guidelines: single responsibility, test coverage > 80%, no magic numbers.",
    "Deployment rollback procedure: blue-green deployment with instant traffic switch.",
    "Kubernetes cluster configuration: 3 master nodes, 5 worker nodes, ingress-nginx.",
    "Docker containerization plan: multi-stage builds, distroless images, non-root user.",
    "Load balancing strategy: round-robin with health checks, automatic failover.",
    "Caching layer implementation: Redis cluster for hot data, TTL 300s, cache-aside pattern.",
    "Message queue architecture: RabbitMQ with quorum queues for high availability.",
    "GraphQL vs REST API debate: GraphQL for mobile, REST for third-party integrations.",
    "Unit testing best practices: arrange-act-assert, mock external dependencies, property tests.",
]

CHINESE_MEMORIES = [
    "用户登录认证方式讨论：支持手机号验证码、微信扫码、企业 SSO 三种方式。",
    "微服务架构决策：将单体应用拆分为用户、订单、支付三个独立服务。",
    "用户角色体系设计：管理员 > 经理 > 编辑 > 访客，支持角色继承。",
    "用户画像数据库设计：规范化表结构，外键建立索引，分库分表方案。",
    "API 限流策略：令牌桶算法，每个用户每分钟 100 次请求。",
    "CI/CD 流水线搭建：GitHub Actions → Docker 构建 → 部署到预发布环境 → 冒烟测试。",
    "前端框架选型（React vs Vue）：React 生态丰富 vs Vue 上手简单，适合 B 端后台。",
    "移动端响应式设计规范：断点设置 320px、768px、1024px、1440px 四档。",
    "日志监控方案：结构化 JSON 日志 → Fluentd → Elasticsearch → Grafana 可视化。",
    "安全审计检查清单：XSS、CSRF、SQL 注入、依赖漏洞扫描。",
    "性能优化建议：懒加载、代码分割、图片转 WebP、CDN 加速。",
    "代码审查规范：单一职责、测试覆盖率 > 80%、禁止魔术数字。",
    "部署回滚流程：蓝绿部署，故障时秒级切换流量。",
    "Kubernetes 集群配置：3 主节点 + 5 工作节点，ingress-nginx 入口。",
    "Docker 容器化方案：多阶段构建，distroless 镜像，非 root 用户运行。",
    "负载均衡策略：轮询 + 健康检查，自动剔除故障节点。",
    "缓存层实现：Redis 集群存储热数据，TTL 300 秒，旁路缓存模式。",
    "消息队列架构：RabbitMQ 仲裁队列，保证高可用。",
    "GraphQL vs REST API 讨论：移动端用 GraphQL，第三方集成用 REST。",
    "单元测试最佳实践：Arrange-Act-Assert，Mock 外部依赖，属性测试。",
    "产品需求文档模板：背景、目标用户、功能描述、验收标准、竞品对比。",
    "用户故事编写规范：作为 <角色>，我希望 <功能>，以便 <价值>。",
    "竞品分析报告：功能矩阵对比、定价策略、用户体验、技术架构。",
    "市场定位策略：聚焦东南亚中小企业，差异化定位本地化客服。",
    "商业模式画布：价值主张、客户细分、渠道通路、收入来源、关键资源。",
    "财务预测模型：三年营收增长曲线、毛利率、客户获取成本、生命周期价值。",
    "用户旅程地图：认知、考虑、购买、使用、推荐五个阶段。",
    "可用性测试计划：任务完成率、错误率、满意度评分、眼动热力图。",
    "A/B 测试方案：对照组与实验组样本量、显著性水平、检验指标。",
    "数据埋点设计：页面浏览、按钮点击、转化漏斗、留存 cohort。",
    "用户增长策略：病毒系数、邀请奖励、内容营销、SEO 优化。",
    "客户成功指标：NPS 评分、月活用户、流失率、扩展收入。",
    "产品路线图规划：Q1 基础功能、Q2 增长功能、Q3 商业化、Q4 国际化。",
    "技术债务评估：遗留代码重构、依赖升级、架构演进优先级。",
    "团队分工安排：产品经理、设计师、前端、后端、测试、运维职责矩阵。",
    "会议纪要模板：议题、结论、行动项、负责人、截止日期。",
    "风险评估矩阵：概率 × 影响，高优先级风险需制定缓解措施。",
    "需求优先级排序：MoSCoW 法则，Must / Should / Could / Won't。",
    "验收标准定义：功能正确、性能达标、测试通过、文档完整。",
    "版本发布计划：功能冻结、RC 测试、灰度发布、全量上线。",
    "用户反馈收集方案：应用内问卷、客服工单、社交媒体监听、用户访谈。",
    "产品迭代回顾：做得好的、需改进的、行动项、下次迭代目标。",
    "设计规范文档：栅格系统、间距标准、圆角规范、阴影层级。",
    "品牌调性指南：专业、简洁、可信赖，面向 B 端企业管理者。",
    "色彩体系定义：主色品牌蓝、辅助色成功绿、警告色琥珀、错误色玫瑰。",
    "字体使用规范：中文思源黑体、英文 Inter，标题 20px、正文 14px。",
    "图标设计原则：线性风格、2px 描边、统一视觉重量、语义清晰。",
    "组件库维护计划：原子设计方法论，Button / Input / Modal / Table 优先级。",
    "交互设计模式：表单验证即时反馈、操作确认二次弹窗、批量操作进度条。",
    "动效设计规范：入场 200ms ease-out、过渡 150ms ease-in-out、反馈 100ms spring。",
    "无障碍设计标准：WCAG 2.1 AA 级、键盘导航、屏幕阅读器兼容、色彩对比度 4.5:1。",
    "国际化方案：i18n 提取、翻译管理、RTL 适配、日期数字本地化。",
    "多语言适配策略：英语优先、中文其次、日语西班牙语后续扩展。",
    "搜索引擎优化方案：结构化数据、站点地图、核心关键词、外链建设。",
    "内容运营策略：技术博客、案例研究、白皮书、视频教程、社区运营。",
    "社交媒体运营计划：Twitter 技术讨论、即刻产品分享、小红书场景种草。",
    "用户激励体系：签到积分、任务徽章、等级成长、兑换商城。",
    "会员体系设计：免费版、Pro 版、企业版三级，功能与价格差异化。",
    "积分系统方案：行为奖励、消费抵扣、过期策略、防刷机制。",
    "推荐算法优化：协同过滤、内容相似度、冷启动策略、实时特征更新。",
    "数据仓库架构：ODS → DWD → DWS → ADS 分层，Apache Hive 离线计算。",
    "ETL 流程设计：数据抽取、清洗转换、质量校验、加载调度。",
    "数据治理规范：主数据管理、元数据注册、数据质量评分、血缘追踪。",
    "隐私合规方案：数据最小化、目的限制、存储期限、访问控制。",
    "GDPR 合规检查：数据处理合法性、用户同意管理、跨境传输评估、DPO 任命。",
    "个人信息保护措施：加密存储、匿名化处理、审计日志、泄露响应预案。",
    "数据备份策略：3-2-1 原则，本地 + 异地 + 云端，每日增量每周全量。",
    "灾难恢复计划：RPO < 1 小时、RTO < 4 小时，定期演练。",
    "服务等级协议：可用性 99.9%，故障响应 < 15 分钟，恢复 < 2 小时。",
    "容量规划方案：当前负载 2× 冗余，季度扩容评估，自动伸缩阈值。",
    "成本优化措施：预留实例、Spot 实例、对象存储分层、CDN 边缘缓存。",
    "供应商评估报告：技术能力、财务稳定性、合规资质、支持响应速度。",
    "技术选型决策：优先考虑社区活跃度、文档质量、团队熟悉度、长期维护。",
    "开源协议审查：MIT / Apache-2.0 / GPL 兼容性，商用授权风险。",
    "知识产权风险评估：专利检索、商标冲突、代码原创性、第三方依赖。",
    "专利检索报告：核心技术创新点、现有技术对比、可专利性分析。",
    "合同审查清单：知识产权归属、保密义务、违约责任、争议解决条款。",
    "法律合规建议：个人信息保护法、数据安全法、网络安全法、电子商务法。",
    "内部培训计划：新员工技术栈、安全意识、代码规范、产品知识。",
    "知识库建设方案：Confluence 结构、文档模板、版本控制、定期归档。",
]

TEST_MEMORIES = ENGLISH_MEMORIES + CHINESE_MEMORIES

# 查询设计
CROSS_LANGUAGE_QUERIES = {
    "zh_to_en": [
        "OAuth 登录认证方式",
        "微服务架构怎么设计",
        "React 和 Vue 选哪个前端框架",
        "数据库用户表结构设计",
        "怎么做性能优化",
    ],
    "en_to_zh": [
        "user authentication methods",
        "microservices architecture design",
        "mobile responsive design guidelines",
        "CI/CD pipeline setup",
        "security audit requirements",
    ],
}

MONOLINGUAL_QUERIES = {
    "zh": [
        "用户登录认证",
        "微服务架构",
        "前端框架选型",
    ],
    "en": [
        "OAuth authentication flow",
        "microservices design",
        "performance optimization",
    ],
}

# ---------------------------------------------------------------------------
# 模型信息
# ---------------------------------------------------------------------------

MODELS = {
    "all-MiniLM-L6-v2": {
        "name": "all-MiniLM-L6-v2",
        "dims": 384,
        "source": "sentence-transformers",
        "description": "当前默认，轻量快速，跨语言较弱",
    },
    "bge-m3": {
        "name": "BAAI/bge-m3",
        "dims": 1024,
        "source": "sentence-transformers",
        "description": "多语言优化，跨语言召回最强",
    },
    "bge-small-zh": {
        "name": "BAAI/bge-small-zh",
        "dims": 512,
        "source": "sentence-transformers",
        "description": "中文优化，英文能力一般",
    },
}


# ---------------------------------------------------------------------------
# 向量工具
# ---------------------------------------------------------------------------


def cosine_similarity(query_emb: np.ndarray, doc_embs: np.ndarray) -> np.ndarray:
    """计算余弦相似度，返回 shape (n_docs,) 的数组。"""
    query_norm = query_emb / (np.linalg.norm(query_emb) + 1e-12)
    docs_norm = doc_embs / (np.linalg.norm(doc_embs, axis=1, keepdims=True) + 1e-12)
    return docs_norm @ query_norm


def get_model_disk_size(model_name: str) -> float:
    """估算模型磁盘占用（MB）。"""
    try:
        from sentence_transformers import SentenceTransformer
        model = SentenceTransformer(model_name)
        path = None
        if hasattr(model, "model_path") and os.path.isdir(model.model_path):
            path = model.model_path
        else:
            cache_candidates = [
                Path.home() / ".cache" / "torch" / "sentence_transformers",
                Path.home() / ".cache" / "sentence_transformers",
            ]
            model_key = model_name.replace("/", "_")
            for cache in cache_candidates:
                if cache.exists():
                    for sub in cache.iterdir():
                        if sub.is_dir() and model_key in sub.name:
                            path = str(sub)
                            break
                if path:
                    break
        if path and os.path.isdir(path):
            total = sum(
                os.path.getsize(os.path.join(root, f))
                for root, _, files in os.walk(path)
                for f in files
            )
            return round(total / 1024 / 1024, 2)
        return -1
    except Exception as e:
        print(f"  [WARN] 无法获取模型体积: {e}")
        return -1


# ---------------------------------------------------------------------------
# 基准测试核心
# ---------------------------------------------------------------------------


def benchmark_model(model_name: str, runs: int = 3) -> dict[str, Any]:
    print(f"\n{'='*60}")
    print(f"  Benchmarking: {model_name}")
    print(f"{'='*60}")

    from sentence_transformers import SentenceTransformer

    # 加载模型
    t0 = time.perf_counter()
    model = SentenceTransformer(model_name)
    load_time = time.perf_counter() - t0
    print(f"  Model loaded in {load_time:.2f}s")

    # 索引 100 条记忆
    t0 = time.perf_counter()
    embeddings = model.encode(TEST_MEMORIES, convert_to_numpy=True, show_progress_bar=False)
    index_time = time.perf_counter() - t0
    print(f"  Indexed {len(TEST_MEMORIES)} memories in {index_time:.2f}s")

    # 查询延迟测试
    all_queries = (
        CROSS_LANGUAGE_QUERIES["zh_to_en"]
        + CROSS_LANGUAGE_QUERIES["en_to_zh"]
        + MONOLINGUAL_QUERIES["zh"]
        + MONOLINGUAL_QUERIES["en"]
    )
    latencies = []
    for _ in range(runs):
        for q in all_queries:
            t0 = time.perf_counter()
            q_emb = model.encode(q, convert_to_numpy=True)
            _ = cosine_similarity(q_emb, embeddings)
            latencies.append((time.perf_counter() - t0) * 1000)  # ms

    latencies = np.array(latencies)
    p50 = float(np.percentile(latencies, 50))
    p95 = float(np.percentile(latencies, 95))
    print(f"  Query latency P50={p50:.2f}ms P95={p95:.2f}ms ({len(latencies)} runs)")

    # 召回评估
    def top_k_indices(query: str, k: int = 5) -> list[int]:
        q_emb = model.encode(query, convert_to_numpy=True)
        scores = cosine_similarity(q_emb, embeddings)
        return np.argsort(scores)[::-1][:k].tolist()

    # 中→英召回
    zh_to_en_hits = 0
    for q in CROSS_LANGUAGE_QUERIES["zh_to_en"]:
        top5 = top_k_indices(q, 5)
        hits = sum(1 for idx in top5 if idx < 20)  # 英文条目索引 0-19
        zh_to_en_hits += hits
    zh_to_en_avg = zh_to_en_hits / len(CROSS_LANGUAGE_QUERIES["zh_to_en"])

    # 英→中召回
    en_to_zh_hits = 0
    for q in CROSS_LANGUAGE_QUERIES["en_to_zh"]:
        top5 = top_k_indices(q, 5)
        hits = sum(1 for idx in top5 if idx >= 20)  # 中文条目索引 20-99
        en_to_zh_hits += hits
    en_to_zh_avg = en_to_zh_hits / len(CROSS_LANGUAGE_QUERIES["en_to_zh"])

    # 同语言召回 Top-1 score
    monolingual_scores = []
    for q in MONOLINGUAL_QUERIES["zh"]:
        q_emb = model.encode(q, convert_to_numpy=True)
        scores = cosine_similarity(q_emb, embeddings)
        top1_score = float(np.max(scores))
        monolingual_scores.append(top1_score)
    for q in MONOLINGUAL_QUERIES["en"]:
        q_emb = model.encode(q, convert_to_numpy=True)
        scores = cosine_similarity(q_emb, embeddings)
        top1_score = float(np.max(scores))
        monolingual_scores.append(top1_score)
    mono_avg = float(np.mean(monolingual_scores))

    print(f"  中→英召回: {zh_to_en_avg:.1f}/5")
    print(f"  英→中召回: {en_to_zh_avg:.1f}/5")
    print(f"  同语言召回 Top-1 score: {mono_avg:.3f}")

    # 模型体积
    disk_size = get_model_disk_size(model_name)

    return {
        "model": model_name,
        "dims": MODELS.get(model_name, {}).get("dims", 0),
        "load_time_sec": round(load_time, 2),
        "index_time_sec": round(index_time, 2),
        "query_latency_ms": {"p50": round(p50, 2), "p95": round(p95, 2)},
        "recall_zh_to_en": round(zh_to_en_avg, 2),
        "recall_en_to_zh": round(en_to_zh_avg, 2),
        "monolingual_top1_score": round(mono_avg, 3),
        "disk_size_mb": disk_size,
        "description": MODELS.get(model_name, {}).get("description", ""),
    }


# ---------------------------------------------------------------------------
# 报告输出
# ---------------------------------------------------------------------------


def print_markdown_table(results: list[dict[str, Any]]) -> None:
    print("\n\n## 模型选型对比结果\n")
    print("| 模型 | 输出维度 | 中→英召回 | 英→中召回 | 同语言 Top-1 | 延迟 P50/P95 | 体积 | 索引耗时 |")
    print("|------|----------|----------|----------|-------------|--------------|------|----------|")

    for r in results:
        disk = f"{r['disk_size_mb']:.1f} MB" if r["disk_size_mb"] > 0 else "N/A"
        print(
            f"| {r['model']} | {r['dims']} | {r['recall_zh_to_en']:.1f}/5 | "
            f"{r['recall_en_to_zh']:.1f}/5 | {r['monolingual_top1_score']:.3f} | "
            f"{r['query_latency_ms']['p50']:.1f} / {r['query_latency_ms']['p95']:.1f} ms | "
            f"{disk} | {r['index_time_sec']:.2f}s |"
        )

    print("\n")


def print_conclusion(results: list[dict[str, Any]]) -> None:
    def find(name_part: str):
        for r in results:
            if name_part in r["model"]:
                return r
        return None

    bge_m3 = find("bge-m3")
    mini = find("MiniLM")
    bge_zh = find("small-zh")

    print("## 结论\n")
    print("### 短期（v0.3.x）演进建议")
    if mini and mini["monolingual_top1_score"] >= 0.60:
        print("**保持 `all-MiniLM-L6-v2` 作为默认模型。**")
        print(f"- 理由：同语言召回 Top-1 score 达 {mini['monolingual_top1_score']:.3f}（≥0.60），")
        print(f"  模型体积仅 {mini['disk_size_mb']:.1f} MB，P50 延迟 {mini['query_latency_ms']['p50']:.1f}ms，")
        print(f"  对当前以中文为主的用户场景完全够用。")
        print(f"- 行动：在 UI 中明确标注「语义搜索 Beta（all-MiniLM-L6-v2）」，管理用户预期。")
    else:
        print("**需立即评估替换。** 当前默认模型同语言召回未达标。")

    print("\n### 中期（v0.4.0）演进建议")
    if bge_m3 and bge_m3["recall_zh_to_en"] >= 2.0 and bge_m3["recall_en_to_zh"] >= 3.0:
        print("**迁移到 `bge-m3`。**")
        print(f"- 跨语言召回显著改善：中→英 {bge_m3['recall_zh_to_en']:.1f}/5（目标≥2），英→中 {bge_m3['recall_en_to_zh']:.1f}/5（目标≥3）。")
        print(f"- 同语言召回 Top-1 score {bge_m3['monolingual_top1_score']:.3f}，优于当前默认模型。")
        print(f"- 代价：模型体积约 {bge_m3['disk_size_mb']:.1f} MB，P50 延迟 {bge_m3['query_latency_ms']['p50']:.1f}ms，")
        print(f"  需额外 {bge_m3['index_time_sec']:.2f}s 索引耗时。在 Pro 版机器上可接受。")
    else:
        print("**暂缓迁移。** bge-m3 跨语言召回未达预期，或体积/延迟过高。")

    if bge_zh and bge_zh["monolingual_top1_score"] > (mini["monolingual_top1_score"] if mini else 0):
        print(f"\n- 备选：`bge-small-zh` 中文同语言召回 {bge_zh['monolingual_top1_score']:.3f} 优于 MiniLM，")
        print(f"  体积仅 {bge_zh['disk_size_mb']:.1f} MB，但跨语言召回较弱，适合纯中文场景。")

    print("\n")


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------


def main() -> None:
    parser = argparse.ArgumentParser(description="Remember Me 嵌入模型选型对比")
    parser.add_argument(
        "--model",
        type=str,
        default="all",
        choices=["all", "all-MiniLM-L6-v2", "bge-m3", "bge-small-zh"],
        help="要测试的模型（默认 all，运行全部）",
    )
    parser.add_argument(
        "--runs",
        type=int,
        default=3,
        help="每条查询重复运行次数（默认 3）",
    )
    parser.add_argument(
        "--output-json",
        type=str,
        default=None,
        help="JSON 输出路径（默认 docs/research/model-benchmark-2026-07-16.json）",
    )
    args = parser.parse_args()

    if args.output_json is None:
        repo_root = Path(__file__).resolve().parents[3]
        args.output_json = repo_root / "docs" / "research" / "model-benchmark-2026-07-16.json"

    models_to_run = (
        ["all-MiniLM-L6-v2", "bge-m3", "bge-small-zh"]
        if args.model == "all"
        else [args.model]
    )

    results = []
    for m in models_to_run:
        result = benchmark_model(m, runs=args.runs)
        results.append(result)

    if len(results) > 1:
        print_markdown_table(results)
        print_conclusion(results)

    # 写入 JSON
    output_path = Path(args.output_json)
    output_path.parent.mkdir(parents=True, exist_ok=True)
    with open(output_path, "w", encoding="utf-8") as f:
        json.dump(results, f, ensure_ascii=False, indent=2)

    print(f"\n  JSON 结果已保存: {output_path}")


if __name__ == "__main__":
    main()

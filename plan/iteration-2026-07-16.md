# Remember Me — 开发迭代计划

**迭代日期**: 2026-07-16（凌晨 02:00 启动）  
**计划编制时间**: 2026-07-15 20:00  
**迭代类型**: Phase 4.1 语义搜索增强 + 工程基础设施加固  
**预估工时**: 6~7 小时（单轮迭代）  

---

## 一、当前进度总览

### 1.1 已完成模块（截至 2026-07-15 20:00）

| 阶段 | 模块 | 状态 | 验证方式 |
|------|------|------|----------|
| Phase 1 MVP | 插件脚手架、JSON 存储、画像/项目/对话管理、6×AI 提供商、23 命令、首次使用向导 | ✅ 完成 | E2E 验证 20/20 通过 |
| Phase 2 核心 | 手动搜索、多项目切换、对话历史视图、记忆更新确认、关键信息提取 | ✅ 完成 | E2E 验证 20/20 通过 |
| Phase 3 增强 | 模板系统（8 场景）、风格一致性检查、智能推荐、版本控制 UI、搜索索引优化、社区模板市场、EngineClient 集成 | ✅ 完成 | E2E 验证 + 4 边缘场景通过 |
| Phase 4.1 MVP | vector_index.py、POST /semantic-search、POST /semantic-index、EngineClient 语义方法、VS Code 搜索 UI 双模式切换、状态栏搜索模式显示 | ✅ 完成 | TS 333/333 · Python 6/6 测试通过 |
| 工程债务 | Windows 目录删除 EPERM 修复、ProjectManager.list 排序测试修复 | ✅ 完成 | 333/333 测试通过 |
| 预研 | 语义搜索原型（ChromaDB + all-MiniLM-L6-v2） | ✅ 完成 | 原型验证报告 |
| 文档 | CHANGELOG v0.3.0、PHASE3_DEMO.md、README 更新、社交媒体宣发素材 | ✅ 完成 | 文档审查 |
| CI 配置 | `.github/workflows/ci.yml` 双环境矩阵（Node.js + Python） | ✅ 已创建 | 待首次运行验证 |

### 1.2 待办事项与已知问题（按 PRD 里程碑）

| 需求 | 来源 | 当前状态 | 阻塞影响 |
|------|------|----------|----------|
| **CI 首次运行验证** | 工程最佳实践 | ⏳ 待验证 | **P0** — CI 已配置但未实际运行，可能隐藏环境矩阵兼容性问题（Windows + chromadb） |
| **语义搜索模型预加载** | 原型报告 §8.1 | ⏳ 待开发 | **P0** — 首次查询 7~12s 冷启动严重影响用户体验，PRD 对话场景要求"秒级响应" |
| **bge-m3 模型选型对比** | 原型报告 §6 / PRD §4.1 | ⏳ 待启动 | **P1** — 中→英跨语言召回 0/5，距生产可用差距大；需在 MVP 阶段确定模型演进路线 |
| **混合搜索（关键词+语义）** | PRD §4.1 Pro 版 | ⏳ 待启动 | **P1** — PRD 明确要求"混合搜索：关键词 + 语义，权重融合"，当前仅支持独立模式切换 |
| **社交媒体宣发执行** | 运营计划 | ⏳ 待执行 | **P2** — 素材已准备（docs/demo/social-media-2026-07-15.md），需在 v0.3.0 发布窗口期内完成发布 |
| **Phase 4.2 云端同步预研** | PRD §4.2 | ⏳ 待启动 | **P3** — 商业化路径关键，需提前完成技术选型与架构设计 |

---

## 二、本次迭代目标

> **目标**：验证并加固 CI 工程基础设施，消除语义搜索模型冷启动痛点，完成嵌入模型选型对比与混合搜索 MVP 原型，执行 Phase 3 发布后的社交媒体宣发，为 Phase 4.2 云端同步启动技术预研。确保 Phase 4.1 从"功能可用"迈向"体验可用"。

---

## 三、开发任务明细

### 任务组 A：工程基础设施与 CI 验证（优先级 P0）

#### A1. GitHub Actions CI 首次运行验证与修复
- **优先级**: P0 🔴
- **负责模块**: `.github/workflows/ci.yml` + 双包工程配置
- **任务描述**:
  1. 确认当前 `git status` 工作区干净，将已完成的 v0.3.0 变更推送到 `main` 分支
  2. 观察 GitHub Actions 首次运行结果，重点检查以下潜在故障点：
     - **Node.js 侧**：`npm ci` 在 `windows-latest` 下的路径兼容性、`npm test` 是否因文件句柄未释放而 flaky
     - **Python 侧**：`chromadb` 在 `windows-latest` + Python 3.11/3.12 下是否可从 wheel 安装；若编译失败，需改为 `--only-binary :all:` 或条件跳过语义搜索测试
     - **服务启动**：`python -m memory_engine.server --port 8765 &` 在 Windows `bash` shell 中的后台进程是否成功启动；`sleep 3` 是否足够覆盖模型冷启动
  3. 若 CI 失败，根据日志定位问题并修复：
     - Node 失败 → 检查 `package-lock.json` 同步状态
     - Python 依赖失败 → 在 `pyproject.toml` 中增加 `optional = ["semantic"]` 分组，CI 中改为 `pip install -e .[minimal]` + 条件安装 `chromadb`
     - 端口占用/服务未就绪 → 改为 `python -m memory_engine.server --port 8766` 随机端口或增加 `sleep 10`
  4. 在迭代报告中记录 CI 矩阵最终通过状态
- **预期产出**:
  - `.github/workflows/ci.yml` 修复补丁（如有）
  - GitHub Actions 首次绿钩截图或运行日志
  - 迭代报告中 CI 验证结论

#### A2. 语义搜索模型预加载机制
- **优先级**: P0 🔴
- **负责模块**: `packages/memory-engine/src/memory_engine/server.py`
- **任务描述**:
  1. 在 `MemoryEngineServer` 中新增后台预加载线程（`threading.Thread`）：
     - 服务启动后 2 秒延迟启动（避免阻塞 `HTTPServer.serve_forever()` 初始化）
     - 线程内调用 `_RequestHandler.get_vector_index(force=True)` 触发 `VectorIndex` 实例化与模型加载
     - 加载完成后写入类级标志 `_vector_index_ready = True`
  2. 修改 `VectorIndex.__init__` 支持可选的 `preload: bool = False` 参数：当 `preload=True` 时，在 `__init__` 中立即调用 `_ensure_initialized()`（而非懒加载），供后台线程使用
  3. 修改 `GET /health` 端点响应，新增字段：
     ```json
     {
       "status": "ok",
       "service": "remember-me-engine",
       "version": "0.3.0",
       "semantic_ready": true,
       "model_loaded": "all-MiniLM-L6-v2"
     }
     ```
     - `semantic_ready` 为 `true` 当且仅当 `_vector_index_ready` 为 `True`
  4. 修改 `engineClient.ts` 的 `healthCheck()`：解析 `semantic_ready` 字段，若 `false` 则在日志中提示"语义模型加载中"
  5. 修改 `extension.ts` 启动时的健康检查逻辑：
     - 首次 `healthCheck` 若 `semantic_ready=false`，设置 10 秒轮询，直到 `semantic_ready=true` 或超时 60 秒
     - 期间状态栏 tooltip 显示"🧠 语义模型预热中…"
  6. 在 `vector_index.py` 的 `_ensure_initialized()` 中增加加载耗时日志：`logger.info("嵌入模型加载完成，耗时 %.2fs", elapsed)`
- **预期产出**:
  - `server.py` 新增后台预加载线程与 `semantic_ready` 状态（~40 行）
  - `vector_index.py` 支持 `preload` 参数与耗时日志（~10 行）
  - `engineClient.ts` 解析 `semantic_ready`（~5 行）
  - `extension.ts` 启动轮询逻辑（~20 行）
  - 首次语义查询延迟从 7~12s 降至 < 200ms

---

### 任务组 B：Phase 4.1 语义搜索增强（优先级 P1）

#### B1. bge-m3 模型选型对比实验
- **优先级**: P1 🔴
- **负责模块**: `packages/memory-engine/scripts/model_benchmark.py` + 文档
- **任务描述**:
  1. 新建 `scripts/model_benchmark.py`，复用原型验证的数据集生成逻辑（100 条中英文混合记忆），支持通过 CLI 参数切换模型：
     - `all-MiniLM-L6-v2`（当前默认，384 维）
     - `bge-m3`（候选，1024 维，多语言优化）
     - `bge-small-zh`（候选，512 维，中文优化）
  2. 对比维度：
     | 维度 | 度量方式 | 通过标准 |
     |------|---------|---------|
     | 中→英召回 | 中文查询 → Top-5 中英文混合结果中的英文条目数 | ≥ 2/5（相较当前 0/5 提升） |
     | 英→中召回 | 英文查询 → Top-5 中的中文条目数 | ≥ 3/5（当前 2/5） |
     | 同语言召回 | 中文查中文、英文查英文的相关性评分 | Top-1 score ≥ 0.60 |
     | 查询延迟 | 单条查询 P50 / P95 | P50 < 50ms |
     | 模型体积 | 磁盘占用 | < 2GB（可接受范围） |
     | 索引耗时 | 100 条记忆编码耗时 | < 5s |
  3. 实验输出：
     - 控制台打印 Markdown 表格对比结果
     - 详细 JSON 结果保存至 `docs/research/model-benchmark-2026-07-16.json`
     - 选型报告 `docs/research/model-benchmark-2026-07-16.md`，给出明确结论：
       - **短期（v0.3.x）**：是否保持 all-MiniLM-L6-v2，在 UI 中标注"语义搜索 Beta"
       - **中期（v0.4.0）**：是否迁移到 bge-m3，迁移成本（磁盘、内存、兼容性）
  4. 在 `pyproject.toml` 的 `[project.optional-dependencies]` 中新增 `benchmark = ["sentence-transformers>=2.3.0"]` 分组（若尚未存在）
- **预期产出**:
  - `scripts/model_benchmark.py`（~150 行，支持 3 模型对比）
  - `docs/research/model-benchmark-2026-07-16.md` 选型报告
  - `docs/research/model-benchmark-2026-07-16.json` 原始数据
  - 明确模型演进决策记录

#### B2. 混合搜索（Hybrid Search）MVP
- **优先级**: P1 🔴
- **负责模块**: `server.py` + `engineClient.ts` + `searchSettings.ts`
- **任务描述**:
  1. 在 `server.py` 新增 `POST /hybrid-search` 端点：
     - 请求体：
       ```json
       {
         "project": "my-project",
         "query": "用户登录相关的讨论",
         "top_k": 5,
         "keyword_weight": 0.3,
         "semantic_weight": 0.7
       }
       ```
     - 内部并行执行：
       - 关键词搜索：复用 `_handle_search` 逻辑，取 Top-20
       - 语义搜索：复用 `_handle_semantic_search` 逻辑，取 Top-20
     - 结果融合：使用 **RRF (Reciprocal Rank Fusion)** 公式：
       ```
       score_rrf = Σ 1 / (k + rank_i)   (k=60 为常数)
       ```
       对关键词结果和语义结果分别计算 RRF 分数，按总分降序排列，取 Top-K
     - 响应体：与 `/semantic-search` 格式一致，新增 `hybrid_scores` 字段展示各子分数
  2. 在 `engineClient.ts` 新增 `hybridSearch()` 方法：
     ```typescript
     async hybridSearch(query: string, project?: string, topK?: number): Promise<SemanticSearchResult[]>
     ```
  3. 在 `searchSettings.ts` 中扩展 `SearchMode` 类型：
     ```typescript
     export type SearchMode = 'keyword' | 'semantic' | 'hybrid';
     ```
     默认仍为 `'keyword'`，hybrid 作为实验性选项
  4. 在 `statusBar.ts` 中更新搜索模式图标：hybrid 模式显示 "🔍🧠"
  5. 在 `test_endpoints.py` 新增 `/hybrid-search` 测试：验证字段完整性、RRF 排序合理性、keyword_weight=0 时退化为纯语义搜索
- **预期产出**:
  - `server.py` 新增 `/hybrid-search` 端点（~80 行）
  - `engineClient.ts` 新增 `hybridSearch` 方法（~30 行）
  - `searchSettings.ts` 扩展 `SearchMode`（~2 行）
  - `test_endpoints.py` 新增 2 个 hybrid 测试用例
  - 混合搜索端到端可验证

---

### 任务组 C：产品运营与文档（优先级 P2）

#### C1. 社交媒体宣发执行
- **优先级**: P2 🟡
- **负责模块**: 运营 / 文档
- **任务描述**:
  1. 使用已准备好的素材（`docs/demo/social-media-2026-07-15.md`），选择适合的平台发布：
     - **Twitter/X 中文**：推文三（极简版，≤ 280 字）
     - **即刻**：推文一（功能亮点版，≤ 500 字）
     - **小红书**：推文二（场景痛点版，800-1000 字）
     - **Twitter/X 英文**：Single Tweet Version + Thread（5 条推）
     - **Hacker News**：HN Style Launch Post
  2. 替换素材中的占位符链接为实际链接（GitHub 仓库、文档站点）
  3. 在 GitHub Release v0.3.0 讨论区开启反馈帖，引导用户试用语义搜索 Beta
  4. 记录各平台发布链接到 `docs/demo/social-media-2026-07-15.md` 末尾的"发布记录"段落
- **预期产出**:
  - 至少 3 个平台实际发布（Twitter/X、即刻、小红书 或 HN）
  - `docs/demo/social-media-2026-07-15.md` 更新发布记录

#### C2. 迭代报告撰写
- **优先级**: P2 🟡
- **负责模块**: `reports/`
- **任务描述**:
  1. 编写 `reports/iteration-2026-07-16.md`（迭代总结报告）：
     - 任务完成情况对照表（A1~B2~C1~D1）
     - CI 验证结果、模型预加载前后延迟对比
     - bge-m3 选型结论
     - 代码统计（新增文件数、修改行数、测试增量）
  2. 编写 `reports/daily-2026-07-16.md`（日报精简版，适合快速浏览）
  3. 编写 `reports/daily-2026-07-16-detailed.md`（详细版，含决策记录、问题日志、下一步行动）
- **预期产出**:
  - `reports/iteration-2026-07-16.md`
  - `reports/daily-2026-07-16.md`
  - `reports/daily-2026-07-16-detailed.md`

---

### 任务组 D：Phase 4.2 云端同步预研（优先级 P3）

#### D1. 云端同步架构设计文档
- **优先级**: P3 🟢
- **负责模块**: `docs/design/`
- **任务描述**:
  1. 基于 PRD §4.2（云端同步 Pro 版）需求，撰写架构设计文档：
     - **端到端加密**：
       - 密钥管理：用户主密钥派生（PBKDF2 / Argon2），本地永不暴露明文
       - 加密粒度：单文件级加密（profile.json、每个 project's context.json、conversations/*.json）
       - 加密方案：AES-256-GCM，每个文件独立 IV
     - **同步协议**：
       - 冲突检测：基于向量时钟或最后修改时间戳（Lamport timestamp）
       - 冲突解决策略：Last-Write-Wins（默认）、用户手动合并（关键文件）
       - 增量同步：仅传输变更块（基于文件内容哈希分块）
     - **存储后端选型对比**：
       | 方案 | 优点 | 缺点 | 适用场景 |
       |------|------|------|----------|
       | 自托管 MinIO | 成本低、数据主权 | 运维负担 | 企业版 |
       | AWS S3 + KMS | 成熟、全球 CDN | 合规/成本 | Pro 版海外 |
       | 阿里云 OSS + KMS | 国内延迟低、合规 | 供应商锁定 | Pro 版国内 |
       | Cloudflare R2 | 零出口费、价格友好 | 生态较新 | 初创期 Pro 版 |
     - **隐私与合规**：
       - 零知识架构：服务端仅存储密文，无法解密
       - GDPR / 个人信息保护法合规要点
       - 用户数据导出与删除（Right to Erasure）
  2. 文档中标注技术风险与依赖项（如加密库选择、身份验证方案 OAuth vs 自建）
  3. 输出文件：`docs/design/cloud-sync-architecture-2026-07-16.md`
- **预期产出**:
  - `docs/design/cloud-sync-architecture-2026-07-16.md`（~3000 字，含架构图 Mermaid、选型对比表、风险分析）

---

## 四、任务优先级矩阵

```
           紧急程度
           高 ←————————→ 低
           ┌─────────┬─────────┐
     高   │  A1 A2  │   B1    │
重        │ (P0)    │   B2    │
要        │         │  (P1)   │
性        │         │         │
          │         │         │
          ├─────────┼─────────┤
     低   │   C1    │   D1    │
          │  (P2)   │  (P3)   │
          │   C2    │         │
          │         │         │
          └─────────┴─────────┘
```

---

## 五、执行顺序建议（时间线）

```
02:00 ─┬─ 启动开发环境，确认 git 分支干净，回顾 07-15 日报
       │
02:10 ─┬─ 【A1】GitHub Actions CI 首次运行验证
       │    └─ 推送 main 分支或创建测试 PR，观察运行日志
       │    └─ 如失败，立即定位并修复（预计最多 2 轮）
       │
03:00 ─┬─ 【A2】语义搜索模型预加载机制
       │    └─ server.py 后台线程 + VectorIndex preload 参数
       │    └─ /health 端点新增 semantic_ready 字段
       │    └─ engineClient.ts + extension.ts 轮询逻辑
       │    └─ 本地验证：启动服务后首次查询延迟 < 200ms
       │
04:00 ─┬─ 【B1】bge-m3 模型选型对比实验
       │    └─ 运行 scripts/model_benchmark.py（3 模型 × 3 查询方向）
       │    └─ 记录指标，撰写选型报告
       │
05:00 ─┬─ 【B2】混合搜索（Hybrid Search）MVP
       │    └─ server.py /hybrid-search 端点 + RRF 融合
       │    └─ engineClient.ts + searchSettings.ts 扩展
       │    └─ test_endpoints.py 新增断言
       │    └─ npm test + Python 端点测试验证
       │
06:00 ─┬─ 【C1】社交媒体宣发执行
       │    └─ Twitter/X、即刻、小红书 / HN 发布
       │    └─ GitHub Release 讨论区反馈帖
       │
06:30 ─┬─ 【C2】迭代报告撰写
       │    └─ iteration-2026-07-16.md + daily 报告 2 份
       │
07:00 ─┬─ 【D1】云端同步架构设计文档（如时间允许）
       │    └─ 端到端加密方案 + 存储后端选型 + 同步协议
       │
07:30 ── 迭代结束，提交代码，最终检查（git diff + npm test + tsc）
```

---

## 六、验收标准

| 检查项 | 标准 | 验证方式 |
|--------|------|----------|
| A1 CI 验证 | GitHub Actions 至少 Node.js 矩阵绿钩通过；Python 矩阵若因 chromadb 编译失败，需提供条件跳过补丁 | GitHub Actions 页面 |
| A2 模型预加载 | 服务启动后后台线程自动加载模型；/health 返回 `semantic_ready: true`；首次语义查询延迟 < 200ms | `python -m memory_engine.server` 本地启动 + `test_endpoints.py` |
| B1 模型选型 | `model_benchmark.py` 可运行并输出 3 模型对比表；报告给出明确的短期/中期模型演进建议 | 运行脚本 + 审查报告 |
| B2 混合搜索 | `POST /hybrid-search` 返回正确结构；RRF 融合后 Top-1 结果质量优于纯关键词或纯语义单一模式 | `test_endpoints.py` + 人工抽查 |
| C1 宣发 | 至少 3 个平台实际发布，链接记录于社交素材文档 | 平台链接截图 |
| C2 报告 | 3 份报告文件完整，含代码统计、决策记录、问题日志 | 文档审查 |
| D1 架构设计 | 文档覆盖加密、同步协议、存储选型、隐私合规四方面 | 文档审查 |
| 全局回归 | `tsc -p ./` 0 错误 0 警告；`npm test` 全部通过；Python 端点测试全部通过 | 命令行 |

---

## 七、风险与应对

| 风险 | 可能性 | 影响 | 应对 |
|------|--------|------|------|
| CI 中 Windows + chromadb 安装持续失败 | 中 | A1 阻塞 | 将 chromadb 移入 `optional-dependencies`，CI Python 侧仅跑非语义测试；语义测试在独立 job 中条件执行 |
| bge-m3 模型体积过大（> 2GB）或加载极慢 | 中 | B1 结论偏差 | 在 benchmark 脚本中增加体积/加载耗时检测；若超限，仅保留 all-MiniLM-L6-v2 与 bge-small-zh 对比 |
| 混合搜索 RRF 融合效果不如预期（Top-1 质量下降） | 低 | B2 需要调整 | 预留备选融合策略：线性加权分数替代 RRF；增加 `fusion_strategy` 参数便于 A/B |
| 单轮迭代 7h 超出预期 | 中 | 任务挤压 | 若 06:00 时 B2 未完成，优先保证 A2（预加载）和 B1（选型），C1/C2/D1 延后至下轮迭代 |
| 后台线程模型预加载导致服务启动崩溃（OOM） | 低 | A2 阻塞 | 增加 try/except 捕获 OOM，降级为懒加载模式；在低端机环境测试 |

---

## 八、相关文档与代码入口

- **PRD 需求**: `docs/PRD.md`（§4.1 语义搜索、§4.2 云端同步、§7 Phase 4 里程碑）
- **架构文档**: `docs/ARCHITECTURE.md`
- **Phase 3 演示文档**: `docs/PHASE3_DEMO.md`
- **语义搜索原型报告**: `docs/research/semantic-search-prototype-2026-07-13.md`
- **社交媒体素材**: `docs/demo/social-media-2026-07-15.md`
- **CI 配置**: `.github/workflows/ci.yml`
- **插件入口**: `packages/vscode-extension/src/extension.ts`
- **EngineClient**: `packages/vscode-extension/src/utils/engineClient.ts`
- **搜索设置**: `packages/vscode-extension/src/utils/searchSettings.ts`
- **状态栏**: `packages/vscode-extension/src/ui/statusBar.ts`
- **Python HTTP 服务**: `packages/memory-engine/src/memory_engine/server.py`
- **向量索引**: `packages/memory-engine/src/memory_engine/vector_index.py`
- **端点测试**: `packages/memory-engine/scripts/test_endpoints.py`
- **07-15 日报**: `reports/daily-2026-07-15.md`
- **07-15 迭代报告**: `reports/iteration-2026-07-15.md`
- **07-15 计划**: `plan/iteration-2026-07-15.md`

---

**计划版本**: v1.0  
**编制者**: 迭代计划系统  
**最后更新**: 2026-07-15 20:00 CST

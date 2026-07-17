# Remember Me — 开发迭代计划

**迭代日期**: 2026-07-15（凌晨 02:00 启动）  
**计划编制时间**: 2026-07-14 20:00  
**迭代类型**: Phase 3 正式交付 + Phase 4.1 MVP 语义搜索集成启动  
**预估工时**: 6~7 小时（单轮迭代）  

---

## 一、当前进度总览

### 1.1 已完成模块（截至 2026-07-14 20:00）

| 阶段 | 模块 | 状态 | 验证方式 |
|------|------|------|----------|
| Phase 1 MVP | 插件脚手架、JSON 存储、画像/项目/对话管理、6×AI 提供商、23 命令、首次使用向导 | ✅ 完成 | E2E 验证 20/20 通过 |
| Phase 2 核心 | 手动搜索、多项目切换、对话历史视图、记忆更新确认、关键信息提取 | ✅ 完成 | E2E 验证 20/20 通过 |
| Phase 3 增强 | 模板系统（8 场景）、风格一致性检查、智能推荐、版本控制 UI、搜索索引优化、社区模板市场、EngineClient 集成 | ✅ 完成 | E2E 验证 + 4 边缘场景通过 |
| 工程债务 | ProjectManager.list 排序测试修复 | ✅ 完成 | 320/320 测试通过 |
| 预研 | 语义搜索原型（ChromaDB + all-MiniLM-L6-v2） | ✅ 完成 | 原型验证报告 |
| 文档 | PHASE3_DEMO.md、README 更新、E2E 报告 | ✅ 完成 | 文档审查 |

### 1.2 待办事项与已知问题（按 PRD 里程碑）

| 需求 | 来源 | 当前状态 | 阻塞影响 |
|------|------|----------|----------|
| **Phase 3 v0.3.0 Release 发布** | PRD §7 Phase 3 交付 | ⏳ 待执行 | **P0** — 里程碑交付物，需产出 GitHub Release 与更新日志 |
| **Phase 4.1 语义搜索 MVP** | PRD §5.2 Pro 版功能 | ⏳ 待启动 | **P1** — 原型验证通过，需正式集成 `vector_index.py` + `/semantic-search` 端点 + VS Code UI |
| **Windows 目录删除 EPERM** | e2e-issues-2026-07-13 | ⏳ 待修复 | **P2** — `JsonStorage.delete()` 使用 `fs.unlinkSync` 无法删除目录，生产环境可能残留空子目录 |
| **端点测试 CI 集成** | 工程最佳实践 | ⏳ 待执行 | **P2** — 将 `test_endpoints.py` 纳入 GitHub Actions / 预提交钩子 |
| **Phase 3 社交媒体宣发** | 运营计划 | ⏳ 待执行 | **P2** — 功能亮点推文，附演示文档链接 |

---

## 二、本次迭代目标

> **目标**：完成 Phase 3 v0.3.0 正式 Release 发布，启动 Phase 4.1 语义搜索 MVP 集成（`vector_index.py` + `POST /semantic-search` + VS Code 切换 UI），修复 Windows 目录删除工程债务，建立端点自动化测试 CI 基线，为 Phase 4 商业化功能奠定可交付的工程基础。

---

## 三、开发任务明细

### 任务组 A：Phase 3 v0.3.0 Release 发布（优先级 P0）

#### A1. GitHub Release 创建与版本标签
- **优先级**: P0 🔴
- **负责模块**: 全局 / 发布管理
- **任务描述**:
  1. 确认当前 `git status` 工作区干净，所有变更已提交
  2. 创建并推送 `v0.3.0` 标签：`git tag -a v0.3.0 -m "Phase 3 智能增强 — 模板系统、风格检查、智能推荐、版本控制"`
  3. 在 GitHub 创建 Release，使用 `v0.3.0` 标签
  4. 编写 Release Note（中英文对照），包含：
     - Phase 3 六大功能亮点（模板系统、风格一致性检查、智能推荐、版本控制、搜索索引优化、社区模板市场）
     - 支持的 6 个 AI 提供商清单
     - 快速上手指南（3 步：安装 → Onboarding → 开始对话）
     - 截图/演示文档链接：`docs/PHASE3_DEMO.md`
     - 已知限制与 Roadmap（Phase 4 展望）
  5. 确认 Release 附件无需包含编译产物（`.vsix` 可后续通过 CI 构建）
- **预期产出**:
  - GitHub 上 `v0.3.0` Release 页面可访问
  - `git tag v0.3.0` 指向 Phase 3 交付的 commit

#### A2. CHANGELOG 更新
- **优先级**: P0 🔴
- **负责模块**: 文档
- **任务描述**:
  1. 在项目根目录创建/更新 `CHANGELOG.md`（遵循 [Keep a Changelog](https://keepachangelog.com/) 格式）
  2. 新增 `## [0.3.0] - 2026-07-15` 段落，列出 Phase 3 全部新增功能与修复
  3. 包含对比 v0.2.0 的变更摘要（新增 6 项增强功能、23 个命令稳定运行、320 测试通过）
- **预期产出**:
  - `CHANGELOG.md`（根目录）新增 v0.3.0 条目

---

### 任务组 B：Phase 4.1 MVP 语义搜索集成（优先级 P1 — 核心开发任务）

#### B1. `vector_index.py` 模块开发
- **优先级**: P1 🔴
- **负责模块**: `packages/memory-engine/src/memory_engine/`
- **任务描述**:
  1. 新建 `src/memory_engine/vector_index.py`，实现 `VectorIndex` 类：
     - `__init__(data_dir: Path, model_name: str = "all-MiniLM-L6-v2")` — 初始化 ChromaDB PersistentClient，加载嵌入模型
     - `index_memory(project: str, memory_id: str, text: str, metadata: dict) -> bool` — 将单条记忆文本编码为向量并插入 ChromaDB 集合
     - `semantic_search(project: str, query: str, top_k: int = 5) -> list[dict]` — 接收自然语言查询，返回 Top-K 最相似记忆片段，包含 `id`, `text`, `score`, `metadata`
     - `delete_memory(project: str, memory_id: str) -> bool` — 从向量索引中删除指定记忆
     - `get_stats(project: str) -> dict` — 返回集合统计（文档数、维度、磁盘占用）
     - `close()` — 关闭 ChromaDB 客户端连接
  2. 集合命名规则：`remember_me_{project}`，确保项目隔离
  3. 嵌入模型路径：`data_dir / "models" / "sentence-transformers"`，使用本地缓存避免重复下载
  4. 异常处理：ChromaDB 未安装时抛出 `ImportError` 并提供降级提示；索引失败时返回 `False` 并记录日志
  5. 依赖声明：在 `pyproject.toml` 的 `dependencies` 中追加 `chromadb>=1.5.0` 和 `sentence-transformers>=2.3.0`
- **预期产出**:
  - `packages/memory-engine/src/memory_engine/vector_index.py`（~200 行，完整实现）
  - `pyproject.toml` 依赖更新

#### B2. `POST /semantic-search` 端点实现
- **优先级**: P1 🔴
- **负责模块**: `packages/memory-engine/src/memory_engine/server.py`
- **任务描述**:
  1. 在 `server.py` 的 `_RequestHandler` 中新增 `do_POST` 分支：`path == "/semantic-search"`
  2. 请求体格式：
     ```json
     {
       "project": "my-project",
       "query": "用户登录相关的讨论",
       "top_k": 5,
       "threshold": 0.3
     }
     ```
  3. 响应体格式：
     ```json
     {
       "query": "用户登录相关的讨论",
       "project": "my-project",
       "results": [
         {
           "id": "memory_001",
           "text": "PRD v2.3：用户登录模块需支持 OAuth2 + 短信验证码...",
           "score": 0.6819,
           "metadata": { "source": "conversation", "date": "2026-07-08" }
         }
       ],
       "total": 1,
       "latency_ms": 12.5
     }
     ```
  4. 在 `MemoryEngineServer` 类级初始化 `VectorIndex` 实例（懒加载，首次请求时实例化）
  5. 处理降级：ChromaDB 未安装或模型加载失败时返回 `503` 状态码 + `{"error": "语义搜索服务暂不可用", "fallback": "请使用关键词搜索 /search"}`
  6. 端点支持 CORS 预检（`do_OPTIONS` 已统一处理）
- **预期产出**:
  - `server.py` 新增 `/semantic-search` 端点（~60 行）
  - `test_endpoints.py` 新增 `/semantic-search` 断言（字段完整性 + 降级场景）

#### B3. `EngineClient` 新增语义搜索方法
- **优先级**: P1 🔴
- **负责模块**: `packages/vscode-extension/src/utils/engineClient.ts`
- **任务描述**:
  1. 在 `EngineClient` 类中新增 `semanticSearch(query: string, project?: string, topK?: number): Promise<SemanticSearchResult[]>` 方法
  2. 定义 `SemanticSearchResult` 接口：
     ```typescript
     export interface SemanticSearchResult {
       id: string;
       text: string;
       score: number;
       metadata?: Record<string, unknown>;
     }
     ```
  3. 请求体映射：`{ query, project, top_k: topK ?? 5 }`
  4. 响应映射：将 `results[].id/text/score/metadata` 映射到 TypeScript 接口
  5. 降级处理：当端点返回 503 或网络失败时，返回空数组并记录 warn 日志，UI 层可自动切换回关键词搜索
  6. 超时设置：与 `extract`/`search` 一致，使用 `3000ms` 超时
- **预期产出**:
  - `engineClient.ts` 新增 `semanticSearch` 方法 + `SemanticSearchResult` 接口（~40 行）
  - 编译通过（0 错误 0 警告）

#### B4. VS Code 搜索 UI 新增语义搜索切换按钮
- **优先级**: P1 🔴
- **负责模块**: `src/ui/sidebarProvider.ts` + `src/extension.ts`
- **任务描述**:
  1. 在侧边栏搜索框（`sidebarProvider.ts`）下方新增一行控件：
     - 切换按钮：「🔍 关键词」 / 「🧠 语义」两种模式切换
     - 当前模式持久化到 `profile.json` 的 `searchMode` 字段（默认 `keyword`）
     - 切换时实时刷新搜索结果列表
  2. 在 `extension.ts` 中新增命令：`rememberMe.toggleSearchMode`（默认快捷键 `Ctrl+Shift+M`）
  3. 当语义搜索模式激活时：
     - 搜索输入框 placeholder 变为「🧠 用自然语言描述你想找的记忆…」
     - 调用 `EngineClient.semanticSearch()` 替代 `search()`
     - 结果列表按 `score` 降序排列，显示相似度分数（百分比）
     - 空结果时提示「未找到语义匹配，尝试切换回关键词搜索？」
  4. 当 EngineClient 检测到 `memory-engine` 服务未启动时，自动禁用语义搜索按钮并显示 tooltip「请先启动 memory-engine 服务」
- **预期产出**:
  - `sidebarProvider.ts` 搜索模式状态管理 + UI 渲染（~50 行）
  - `extension.ts` 新增 `toggleSearchMode` 命令注册（~15 行）
  - `profile.json` 新增 `searchMode` 字段支持

#### B5. 语义搜索单元测试
- **优先级**: P1 🟡
- **负责模块**: `src/test/suite/engineClient.test.ts` + Python 测试
- **任务描述**:
  1. TypeScript 侧：在 `engineClient.test.ts` 新增 3 个测试用例：
     - `semanticSearch 应返回正确结构的结果`（Mock 200 响应）
     - `semanticSearch 在 503 降级时应返回空数组`（Mock 503 响应）
     - `semanticSearch 字段映射应正确`（验证 `id/text/score/metadata` 映射）
  2. Python 侧：在 `test_endpoints.py` 新增 `/semantic-search` 测试：
     - 正常查询：验证 `results[].id/text/score/metadata` 字段非空
     - 降级场景：当 `chromadb` 不可用时验证 503 响应结构
- **预期产出**:
  - `engineClient.test.ts` 新增 3 个测试用例（通过编译）
  - `test_endpoints.py` 新增 `/semantic-search` 断言（3/3 通过）

---

### 任务组 C：工程债务修复（优先级 P2）

#### C1. 修复 Windows 目录删除 EPERM 问题
- **优先级**: P2 🟡
- **负责模块**: `src/memory/storage.ts`
- **任务描述**:
  1. 修改 `JsonStorage.delete()` 方法（第 78-89 行）：
     - 在 `fs.unlinkSync` 前判断路径类型：若为目录，改用 `fs.rmSync(filePath, { recursive: true, force: true })`
     - 若 Node.js 版本 < 14.14（无 `fs.rmSync`），降级使用 `fs.rmdirSync(filePath, { recursive: true })`
  2. 修改后代码示例：
     ```typescript
     delete(...pathSegments: string[]): boolean {
       const filePath = this.resolvePath(...pathSegments);
       try {
         if (fs.existsSync(filePath)) {
           const stat = fs.statSync(filePath);
           if (stat.isDirectory()) {
             fs.rmSync(filePath, { recursive: true, force: true });
           } else {
             fs.unlinkSync(filePath);
           }
         }
         return true;
       } catch (error) {
         getLogger().error(`[RememberMe] 删除失败: ${filePath}`, error);
         return false;
       }
     }
     ```
  3. 在 `storage.test.ts` 中新增测试用例：
     - `delete 应递归删除目录及其内容`
     - `delete 对不存在路径应返回 true`（幂等性）
  4. 运行 `npm test` 确认 `ProjectManager.delete` 测试不再产生 EPERM 日志
- **预期产出**:
  - `src/memory/storage.ts` 修改（~10 行）
  - `src/test/suite/storage.test.ts` 新增 2 个测试用例
  - 320+ 测试全部通过，EPERM 日志消失

---

### 任务组 D：CI / 自动化测试集成（优先级 P2）

#### D1. GitHub Actions 工作流配置
- **优先级**: P2 🟡
- **负责模块**: `.github/workflows/`
- **任务描述**:
  1. 新建 `.github/workflows/ci.yml`，配置双环境 CI：
     - **Node.js 侧**：`ubuntu-latest` + `windows-latest`，Node 18/20，执行 `npm ci && npm run compile && npm test`
     - **Python 侧**：`ubuntu-latest` + `windows-latest`，Python 3.11/3.12，执行 `pip install -e . && python scripts/test_endpoints.py`
  2. 触发条件：`push` 到 `main` 分支、`pull_request` 到 `main` 分支
  3. 缓存配置：Node `node_modules`、Python `.venv` 缓存加速
  4. 失败通知：在 CI 失败时输出简明的错误摘要到 PR comment（可选，MVP 阶段可延后）
- **预期产出**:
  - `.github/workflows/ci.yml`（~80 行，双环境矩阵）
  - 在测试分支上验证 CI 可通过（Node 320 测试 + Python 3 端点测试）

#### D2. 预提交钩子配置（Husky + lint-staged）
- **优先级**: P2 🟢（如时间不足可延后）
- **负责模块**: `packages/vscode-extension/`
- **任务描述**:
  1. 安装 `husky` + `lint-staged`：`npm install -D husky lint-staged`
  2. 配置 `package.json`：
     - `lint-staged` 对 `*.ts` 执行 `tsc --noEmit` 和 `eslint --fix`
     - 对 `*.py` 执行 `black --check` 和 `flake8`（Python 代码格式化检查）
  3. 初始化 Husky：`npx husky-init && npm install`
  4. 确保每次 `git commit` 前自动运行编译检查
- **预期产出**:
  - `.husky/pre-commit` 钩子脚本
  - `package.json` 新增 `lint-staged` 配置

---

### 任务组 E：Phase 3 演示与宣发（优先级 P2）

#### E1. 社交媒体宣发素材准备
- **优先级**: P2 🟢
- **负责模块**: 运营 / 文档
- **任务描述**:
  1. 编写中文推文（适合 Twitter/X / 即刻 / 小红书）：
     - 标题：「🧠 Remember Me v0.3.0 发布 — AI 终于能记住你了」
     - 亮点：3 分钟上手、8 种文档模板、自动风格检查、智能记忆推荐
     - 链接：GitHub Release 页面 + `docs/PHASE3_DEMO.md`
     - 标签：`#AI #VSCode #生产力工具 #开源`
  2. 编写英文推文（适合 Twitter / Hacker News / Reddit r/vscode）：
     - 标题：「Remember Me v0.3.0 — AI Memory for Non-Technical Users」
     - 亮点：persistent memory across conversations, 8 writing templates, style consistency check
  3. 保存推文草稿到 `docs/demo/social-media-2026-07-15.md`
- **预期产出**:
  - `docs/demo/social-media-2026-07-15.md`（中英文推文草稿）

#### E2. 迭代报告撰写
- **优先级**: P2 🟢
- **负责模块**: `reports/`
- **任务描述**:
  1. 编写 `reports/iteration-2026-07-15.md`（迭代总结报告）
  2. 编写 `reports/daily-2026-07-15.md`（日报精简版）
  3. 记录内容：v0.3.0 Release 详情、语义搜索 MVP 启动进度、工程债务修复、CI 配置、代码统计
- **预期产出**:
  - `reports/iteration-2026-07-15.md`
  - `reports/daily-2026-07-15.md`
  - `reports/daily-2026-07-15-detailed.md`（详细版）

---

## 四、任务优先级矩阵

```
           紧急程度
           高 ←————————→ 低
           ┌─────────┬─────────┐
     高   │  A1 A2  │   B1    │
重        │ (P0)    │   B2    │
要        │         │   B3    │
性        │         │   B4    │
          │         │  (P1)   │
          ├─────────┼─────────┤
     低   │   B5    │   C1    │
          │  (P1)   │   D1    │
          │         │  (P2)   │
          │         │   E1 E2 │
          │         │  (P2)   │
          └─────────┴─────────┘
```

---

## 五、执行顺序建议（时间线）

```
02:00 ─┬─ 启动开发环境，确认 git 分支干净，回顾 07-14 日报
       │
02:10 ─┬─ 【A1】GitHub Release 创建与 v0.3.0 标签推送
       │    └─ 确认 CHANGELOG 已更新，Release Note 编写并发布
       │
02:40 ─┬─ 【A2】CHANGELOG.md 更新（如尚未完成）
       │
02:50 ─┬─ 【B1】vector_index.py 模块开发
       │    └─ VectorIndex 类：index_memory / semantic_search / delete_memory / get_stats
       │    └─ pyproject.toml 依赖追加 chromadb + sentence-transformers
       │
04:00 ─┬─ 【B2】POST /semantic-search 端点实现
       │    └─ server.py 新增端点 + 懒加载 VectorIndex + 降级处理
       │    └─ test_endpoints.py 新增断言
       │
04:40 ─┬─ 【B3】EngineClient 新增 semanticSearch 方法
       │    └─ engineClient.ts 接口与方法实现，编译通过
       │
05:10 ─┬─ 【B4】VS Code 搜索 UI 语义搜索切换按钮
       │    └─ sidebarProvider.ts 模式切换 + extension.ts 命令注册
       │
05:50 ─┬─ 【B5】语义搜索单元测试（TypeScript + Python）
       │    └─ engineClient.test.ts 新增 3 个 Mock 测试
       │    └─ test_endpoints.py 新增 /semantic-search 断言
       │
06:20 ─┬─ 【C1】修复 Windows 目录删除 EPERM
       │    └─ storage.ts 改用 fs.rmSync 递归删除目录
       │    └─ storage.test.ts 新增目录删除测试
       │    └─ npm test 确认 EPERM 日志消失
       │
06:40 ─┬─ 【D1】GitHub Actions CI 工作流配置
       │    └─ .github/workflows/ci.yml 双环境矩阵
       │    └─ 本地用 act 或推测试分支验证
       │
07:10 ─┬─ 【E1/E2】社交媒体宣发素材 + 迭代报告撰写
       │    └─ 推文草稿 + 3 份报告文档
       │
07:40 ── 迭代结束，提交代码，最终检查（git diff + npm test + tsc）
```

---

## 六、验收标准

| 检查项 | 标准 | 验证方式 |
|--------|------|----------|
| A1 Release | GitHub 上 `v0.3.0` Release 页面可访问，标签指向正确 commit | 浏览器 + git log |
| A2 CHANGELOG | `CHANGELOG.md` 包含 v0.3.0 条目，格式符合 Keep a Changelog | 文档审查 |
| B1 vector_index | `vector_index.py` 实现完整 VectorIndex 类，含 index/semantic_search/delete/stats/close | 代码审查 + `python -c "from memory_engine.vector_index import VectorIndex"` |
| B2 端点 | `POST /semantic-search` 返回正确结构（results[].id/text/score/metadata），降级 503 | `test_endpoints.py` 运行 |
| B3 EngineClient | `engineClient.ts` 编译通过，`semanticSearch` 方法返回 `SemanticSearchResult[]` | `tsc -p ./` + 单元测试 |
| B4 UI 切换 | 侧边栏搜索框支持「关键词/语义」模式切换，模式持久化到 profile.json | Extension Host F5 实机验证 |
| B5 测试 | TypeScript 新增 3 个测试通过，Python 新增端点测试通过 | `npm test` + `python test_endpoints.py` |
| C1 目录删除 | `storage.test.ts` 新增目录删除测试通过，`npm test` 无 EPERM 日志 | 单元测试 + 日志审查 |
| D1 CI | `.github/workflows/ci.yml` 配置完成，Node + Python 双环境矩阵 | 代码审查 |
| E1/E2 文档 | 推文草稿 + 3 份报告文档完整 | 文档审查 |
| 全局回归 | `tsc -p ./` 0 错误 0 警告；`npm test` 全部通过 | 命令行 |

---

## 七、风险与应对

| 风险 | 可能性 | 影响 | 应对 |
|------|--------|------|------|
| ChromaDB 在 Windows CI 环境安装失败 | 中 | B1/B2 阻塞 | 预研已验证 Windows 安装可行；CI 中增加 `pip install --only-binary :all: chromadb` 或降级为纯 NumPy 相似度计算 |
| 语义搜索模型加载冷启动延迟（~7s）影响 UI 体验 | 中 | B4 阻塞 | 服务启动时预加载模型；UI 中增加「正在加载语义模型…」进度提示；首次查询时降级到关键词搜索 |
| `fs.rmSync` 在旧版 Node.js 中不存在 | 低 | C1 阻塞 | 增加 Node 版本判断：`< 14.14` 时降级到 `fs.rmdirSync(..., { recursive: true })` |
| GitHub Actions 免费额度限制 | 低 | D1 阻塞 | 矩阵精简：Node 只跑 `ubuntu-latest`，Python 只跑 `windows-latest`；`push` 触发改为 `pull_request` 触发 |
| Release 发布后发现问题需 hotfix | 低 | A1 影响声誉 | 预留 `v0.3.1` 补丁版本号；Release Note 中明确标注「Phase 3 预发布」降低预期 |
| 语义搜索跨语言召回率低（中→英 0/5） | 中 | B1 质量不达标 | 短期：接受当前 all-MiniLM-L6-v2 作为 MVP；中期：Phase 4.2 评估 bge-m3 替换；UI 中标注「语义搜索 Beta」 |
| 单轮迭代时间 7h 超出预期 | 中 | 任务挤压 | 若 06:30 时 B4 未完成，优先保证 B3（EngineClient）和 C1（目录删除），D1/E1/E2 延后至下轮迭代 |

---

## 八、相关文档与代码入口

- **PRD 需求**: `docs/PRD.md`（§5.2 语义搜索、§7 Phase 4 里程碑）
- **架构文档**: `docs/ARCHITECTURE.md`
- **Phase 3 演示文档**: `docs/PHASE3_DEMO.md`
- **语义搜索原型报告**: `docs/research/semantic-search-prototype-2026-07-13.md`
- **E2E 问题报告**: `packages/vscode-extension/reports/e2e-issues-2026-07-13.md`
- **插件入口**: `packages/vscode-extension/src/extension.ts`（751 行，23 命令）
- **EngineClient**: `packages/vscode-extension/src/utils/engineClient.ts`（196 行）
- **Python HTTP 服务**: `packages/memory-engine/src/memory_engine/server.py`（401 行）
- **JSON 存储层**: `packages/vscode-extension/src/memory/storage.ts`（162 行）
- **侧边栏**: `packages/vscode-extension/src/ui/sidebarProvider.ts`
- **07-14 日报**: `reports/daily-2026-07-14.md`
- **07-14 迭代报告**: `reports/iteration-2026-07-13.md`
- **07-14 计划**: `plan/iteration-2026-07-13.md`

---

**计划版本**: v1.0  
**编制者**: 迭代计划系统  
**最后更新**: 2026-07-14 20:00 CST

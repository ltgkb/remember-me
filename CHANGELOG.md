# 更新日志

本项目所有重要变更均会记录于此文件。

格式基于 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/)，
版本号遵循 [语义化版本](https://semver.org/lang/zh-CN/)。

## [0.3.0] - 2026-07-14

### 新增

#### Phase 3 智能增强（正式交付）
- **模板系统**：内置 PRD、商业计划书、学术论文、市场调研、活动策划、设计说明、技术方案、汇报材料 8 种专业写作场景模板，支持一键生成结构化框架、预览、导入导出与社区模板市场。
- **风格一致性检查**：文档保存时自动检测是否符合用户个人习惯，提供「自动补充 / 手动编辑 / 忽略」三选项修复流程。
- **智能推荐记忆**：基于内容感知算法，在开始对话时离线推送相关历史决策与术语。
- **记忆版本控制**：每次更新保留可追溯备份（最近 20 个），支持一键回滚与 JSON 预览，Webview 面板可视化浏览。
- **搜索索引优化**：内存倒排索引将对话搜索从全量遍历 O(N) 优化到 O(1)，索引持久化到磁盘。

#### Phase 4.1 语义搜索 MVP（核心新增）
- **`VectorIndex` 向量索引模块**（`memory_engine/vector_index.py`）：基于 ChromaDB + sentence-transformers（all-MiniLM-L6-v2）实现，懒加载模型、项目级集合隔离（`remember_me_{project}`）、幂等索引、批量索引工具 `index_all_memories`。
- **`POST /semantic-search` 端点**：返回 Top-K 语义相似记忆，含 `id / text / score / metadata / latency_ms`；chromadb 不可用时返回 503 并引导回退关键词搜索。
- **`POST /semantic-index` 端点**：一键将 `~/.remember-me` 下的 JSON 记忆批量灌入向量索引。
- **EngineClient 语义搜索客户端**（`utils/engineClient.ts`）：新增 `semanticSearch()` 与 `buildSemanticIndex()` 方法，503 / 网络异常自动降级为空数组，UI 可据此回退。
- **VS Code 搜索 UI 模式切换**：搜索支持「🔍 关键词」与「🧠 语义」双模式，模式持久化到 `~/.remember-me/search-settings.json`，状态栏实时显示当前模式；新增 `rememberMe.toggleSearchMode` 与 `rememberMe.buildSemanticIndex` 命令；关键词无结果时可一键转语义搜索，语义无结果时可回退或构建索引。
- **AI 提供商**：通义千问、文心一言、智谱 ChatGLM 适配（基于 OpenAI 兼容 API）。

### 变更
- `pyproject.toml` 新增 `chromadb>=1.5.0`、`sentence-transformers>=2.3.0` 依赖，并提供 `minimal` 可选依赖组用于不启用语义搜索的精简安装。
- 状态栏显示新增搜索模式图标（🔍 / 🧠），tooltip 增加当前搜索模式。
- 快捷菜单新增「切换搜索模式」「构建语义索引」入口，搜索条目描述反映当前模式。

### 修复
- **Windows 目录删除 EPERM 问题**：`JsonStorage.delete()` 此前使用 `fs.unlinkSync` 删除目录会在 Windows 下抛 `EPERM` 并残留空子目录；现改为判断路径类型，目录使用 `fs.rmSync({ recursive: true, force: true })` 递归删除（Node < 14.14 降级 `fs.rmdirSync`），文件保持 `fs.unlinkSync`。
- **语义栈降级失效（2026-07-18）**：ChromaDB 初始化失败后 `SharedSystemClient` 注册表残留导致后续请求 `KeyError` 穿透 HTTP 处理器、连接被重置（RemoteDisconnected）。现 `vector_index._ensure_initialized()` 对 `PersistentClient` / `SentenceTransformer` 全异常兜底为 `SemanticSearchError` 并清理注册表，`server.get_vector_index()` 兜底返回 503 + 友好回退提示，预加载线程不再误报 `semantic_ready`。
- **非 UTF-8 请求体崩溃（2026-07-18）**：`_read_json_body()` 捕获 `UnicodeDecodeError`，返回 400 而非连接重置。

### 变更（2026-07-18 环境统一）
- `pyproject.toml` `requires-python` 钉定为 `>=3.11,<3.14`，开发环境统一至 CPython 3.12；CI Python 矩阵覆盖 3.12 + 3.14（3.14 为金丝雀腿，语义栈条件化）。
- 语义索引初始化末尾增加预热，首次语义查询延迟从 ~556ms 降至 <200ms（实测 83.5ms）。

### 测试
- TypeScript 测试从 320 增至 **333 通过**（0 失败）：新增 `semanticSearch`（4 例）、`buildSemanticIndex`（2 例）、`SearchSettingsManager`（5 例）、目录递归删除（2 例）。
- Python 端点测试 `test_endpoints.py` 扩展至 **6 项**：`/health`、`/extract`、`/search`、`/semantic-index`、`/semantic-search`（含字段完整性 + 降级 503）、`/semantic-search` 400 校验，全部通过。

### 已知限制
- 语义搜索跨语言召回率偏低（中文查询 → 英文记忆召回 0/5），MVP 阶段采用 all-MiniLM-L6-v2，Phase 4.2 评估 bge-m3 替换。
- 嵌入模型首次加载冷启动约 7~12s，UI 建议在首次查询时提示「正在加载语义模型」。
- memory-engine 服务为单线程 `http.server`，生产环境建议迁移至 uvicorn + FastAPI。

---

## [0.2.0] - 2026-07-10

### 新增
- 通义千问、文心一言、智谱 ChatGLM 接入。
- 对话历史自动记录与关键信息提取（`InfoExtractor`）。
- 手动搜索记忆、记忆更新确认机制、多项目切换。

## [0.1.0] - 2026-07-08

### 新增
- VS Code 插件脚手架与 23 个命令。
- JSON 存储层（Profile + Project Context + Conversation）。
- 设置向导（3 分钟问卷）。
- DeepSeek + Ollama 接入，基础记忆注入。

[0.3.0]: https://github.com/remember-me-team/remember-me/releases/tag/v0.3.0
[0.2.0]: https://github.com/remember-me-team/remember-me/releases/tag/v0.2.0
[0.1.0]: https://github.com/remember-me-team/remember-me/releases/tag/v0.1.0

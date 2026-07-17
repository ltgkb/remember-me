# Remember Me — 每日迭代报告（详细版）

**报告日期**: 2026-07-10 凌晨批次（00:00–03:00）  
**迭代阶段**: Phase 3 智能增强核心特性  
**统计范围**: `packages/` 下全部代码变更  
**总代码量**: 8,498 行（TypeScript 7,260 + Python 1,238）

---

## 一、交付概览

| 模块 | 包 | 新增/修改文件 | 代码行 | 核心能力 |
|------|-----|--------------|--------|----------|
| Python 记忆引擎 | `packages/memory-engine/` | 5 | 1,238 | 信息提取、语义搜索、备份管理、HTTP 服务 |
| VS Code 扩展 | `packages/vscode-extension/` | 18 | 7,260 | 智能推荐、搜索索引、模板系统、版本控制、对话历史、记忆编辑器 |
| **合计** | — | **23** | **8,498** | — |

---

## 二、新增/修改文件清单

### 2.1 `packages/memory-engine/` — Python 核心引擎（全新模块）

| 文件 | 行数 | 功能说明 | 关键特性 |
|------|------|----------|----------|
| `pyproject.toml` | 51 | 包配置与元数据 | 3 个 CLI 入口脚本、零外部依赖、Python ≥3.9 |
| `src/memory_engine/__init__.py` | 10 | 包入口 | 导出 `InfoExtractor`、`ExtractedInfo`、`Insight`、`main` |
| `src/memory_engine/cli.py` | 387 | 命令行接口 | `extract`/`search`/`backup-list` 三子命令，支持 JSON/JSON Lines 输入、环境变量覆盖数据目录 |
| `src/memory_engine/extractor.py` | 389 | 信息提取器 | 5 类信息提取（决策/术语/待办/日期/角色）、置信度评分（句首+长度+关键词密度）、洞察聚合（密集决策/术语/待办/多方参与/时间敏感） |
| `src/memory_engine/server.py` | 401 | HTTP 服务 | `POST /extract`、`POST /search`、`GET /health`、`GET /backups`，CORS 支持，标准库 `http.server` 实现 |

**CLI 命令验证**:
```bash
remember-me-extract conversation.json --insights --min-confidence 0.6
remember-me-search "OAuth" --project TeamFlow --max-results 20
remember-me-backup-list ~/.remember-me/profile.json
```

**HTTP 端点**:
```bash
python -m memory_engine.server --port 8765
# POST /extract  { "text": "...", "include_insights": true }
# POST /search   { "keyword": "...", "project": "..." }
# GET  /health
# GET  /backups?file=...
```

### 2.2 `packages/vscode-extension/` — TypeScript 扩展（大规模迭代）

| 文件 | 行数 | 修改类型 | 功能说明 |
|------|------|----------|----------|
| `src/extension.ts` | 846 | 修改 | 主入口：注册 18+ 命令，集成搜索索引、智能推荐、模板系统、版本控制、对话历史、记忆编辑器 |
| `src/types.ts` | 132 | 修改 | 核心类型：新增 `RecommendationType`、`MemoryRecommendation` 等 |
| `src/memory/profile.ts` | 228 | 修改 | 用户画像管理：CRUD、自动备份、记忆 Prompt 生成、状态栏标签 |
| `src/memory/recommender.ts` | 423 | 新增 | 智能推荐引擎：中文停用词 144 个、2-gram~4-gram 提取、Dice 系数 + 四维权重（同项目/近期/已确定/用户消息） |
| `src/template/manager.ts` | 462 | 修改 | 模板管理：8 种分类（PRD/商业/学术/调研/活动/设计/技术/汇报）、用户自定义模板、模板应用（自动注入画像+项目+结构要求） |
| `src/utils/searchIndex.ts` | 594 | 新增 | 内存倒排索引：中英文分词、JSON 文本提取、全量重建/增量更新/删除、多关键词交集搜索、词频评分、事件回调 |
| `src/utils/promptBuilder.ts` | 121 | 修改 | Prompt 构建器：身份+风格+项目 三板块注入，结构化/单行摘要双模式 |
| `src/utils/profileGuard.ts` | 37 | 修改 | 画像验证：`isValidProfile` 严格校验 identity/style 字段完整性 |
| `src/ui/statusBar.ts` | 312 | 修改 | 状态栏：激活提示、新信息检测、风格一致性警告、智能推荐弹窗、快捷菜单（8 项操作） |
| `src/ui/sidebarProvider.ts` | 263 | 修改 | 侧边栏：三级缓存（根/项目/模板）、树形展示（画像/项目/模板/快捷操作）、懒加载刷新 |
| `src/ui/webview/conversationHistory.ts` | 1,089 | 新增 | 对话历史：项目分组、多维度筛选（关键词/日期/标签/项目）、消息流渲染、决策/洞察展示、Markdown 导出、防抖刷新（250ms） |
| `src/ui/webview/memoryEditor.ts` | 528 | 新增 | 记忆编辑器：搜索框、项目/标签筛选、结果统计、4 类结果（对话/决策/洞察/术语）、最近活动概览、复制到剪贴板 |
| `src/ui/webview/versionControl.ts` | 960 | 新增 | 版本控制：递归扫描 `.backups`、时间轴分组（手风琴）、JSON 语法高亮、回滚（二次确认+自动备份保护）、删除、路径安全检查 |
| `src/ui/webview/index.ts` | 11 | 修改 | 统一导出：新增 `ConversationHistoryWebview`、`VersionControlWebview` |
| `package.json` | 184 | 修改 | 扩展配置：新增 `openVersionControl`、`ignoreRecommendation` 等命令，模板/版本控制图标 |
| `src/test/suite/recommender.test.ts` | 344 | 新增 | 推荐引擎测试：19 用例，覆盖关键词提取、相关性计算、权重加成、会话忽略、跨项目搜索 |
| `src/test/suite/searchIndex.test.ts` | 511 | 新增 | 搜索索引测试：33 用例，覆盖分词、JSON 提取、单例、重建、增量更新、搜索交集、评分排序、事件回调、写钩子 |
| `src/test/suite/versionControl.test.ts` | 215 | 新增 | 版本控制测试：14 用例，覆盖 HTML 生成、消息处理、文件大小格式化、日期格式化、HTML 转义、备份状态判断、JSON 高亮、路径安全 |

---

## 三、核心功能详解

### 3.1 信息提取引擎（Python）

`InfoExtractor` 采用**规则+统计**混合策略，从对话文本中提取 5 类结构化信息：

| 类型 | 正则触发词 | 置信度加成因素 |
|------|-----------|---------------|
| 决策 | 决定/采用/选择/确定/配置为/设置为 | 句首位置 +0.15 |
| 术语 | `X: Y` / `X 是指 Y` / `X 定义为 Y` | 结构明确 +0.05 |
| 待办 | TODO/FIXME/待办/需要/必须/应该 | 任务关键词密度 |
| 日期 | `YYYY-MM-DD` / `明天` / `下周` / `HH:MM` | 上下文时间词 |
| 角色 | 产品经理/工程师/架构师/CTO/博士等 | 句首 +0.08 |

**洞察聚合**（`generate_insights`）自动识别风险模式：
- 密集决策（≥3 项）→ warning
- 待办任务（>5 项）→ warning
- 时间提及（≥3 个）→ warning（可能存在截止日）
- 多方参与（≥2 种角色）→ info

### 3.2 智能推荐记忆（TypeScript）

`MemoryRecommender` 是 Phase 3 的**核心差异化特性**，实现**零 AI 依赖**的离线内容感知推荐：

**关键词提取流程**:
```
输入文本 → 空格/标点切分 → 中英文分离 → 中文 2-gram~4-gram → 过滤 144 个停用词 → 去重
```

**相关性计算**（Dice 系数变体）:
```
score = 2 × overlap / (contentKeywords + candidateKeywords)
        + 0.2 (同项目)
        + 0.15 (7天内)
        + 0.10 (已确定决策)
        + 0.10 (用户消息匹配)
```

**候选来源**: 项目决策、项目术语、对话标题、对话决策、对话洞察、用户消息内容。

**集成点**: `extension.ts::startChat` 中，注入 Prompt 后自动触发，若 relevanceScore ≥ 0.3 则在状态栏显示推荐。

### 3.3 内存倒排索引（B2 优化）

`SearchIndex` 将对话搜索从**全量 JSON 遍历 O(N)** 优化到 **O(1) 关键词查找**：

```typescript
private index: Map<string, Set<string>>        // 关键词 → 文件路径集合
private docFreq: Map<string, Map<string, number>>  // 文件 → 关键词词频
```

**分词策略**:
- 中文：逐字切分（每个汉字独立为 token）
- 英文：连续字母数字序列，过滤单字符和纯数字
- 保留英文+数字混合词（如 `OAuth2`、`test123abc`）
- 全部转小写

**搜索算法**: 多关键词取交集，结果按词频之和评分降序排列。

**索引生命周期**:
1. 插件激活时 `rebuild()` 全量扫描
2. 文件写入后 `update()` 增量更新
3. 文件删除后 `remove()` 清理索引
4. 支持 `onUpdate()` 事件回调和 `createWriteHook()` 写钩子

### 3.4 模板系统（Phase 3）

`TemplateManager` 管理 8 类文档模板，支持**内置 + 用户自定义**双轨制：

**内置模板分类**: PRD、商业计划、学术论文、调研报告、活动策划、设计文档、技术方案、汇报材料。

**模板应用流程**:
```
选择模板 → 读取模板结构 → 注入用户画像（按 priority 筛选）→ 注入项目上下文（按 projectContextKeys 筛选）→ 生成结构化 Prompt
```

**用户画像注入优先级**: `profile`（身份）→ `style`（风格）→ `project`（项目上下文），模板可配置 `memoryConfig.priority` 决定注入哪些板块。

### 3.5 版本控制 Webview

`VersionControlWebview` 提供可视化的记忆数据版本管理：

**备份扫描**: 递归遍历 `~/.remember-me/` 下所有 `.backups/` 目录，按原文件路径分组，按时间倒序排列。

**时间轴视图**:
- 绿色圆点（recent）：最近 5 个备份
- 黄色圆点（old）：中间备份
- 红色圆点（cleanup）：超过 15 个且索引 ≥15 的旧备份（建议清理）

**安全机制**:
- 回滚前二次确认（modal 对话框）
- 回滚前自动为当前文件创建新备份（防止覆盖丢失）
- 路径安全检查：`path.relative(basePath, checkPath)` 不以 `..` 开头
- JSON 语法高亮（键名/字符串/数字/布尔值独立配色）

---

## 四、测试报告

| 测试套件 | 用例数 | 覆盖范围 | 状态 |
|----------|--------|----------|------|
| `MemoryRecommender` | 19 | 关键词提取、推荐逻辑、权重加成、会话忽略、跨项目搜索 | ✅ 全通 |
| `SearchIndex` | 33 | 分词、JSON 提取、单例、重建、增量更新、搜索交集、评分排序、事件回调、写钩子 | ✅ 全通 |
| `VersionControlWebview` | 14 | HTML 生成、消息处理、格式化、转义、备份状态、JSON 高亮、路径安全 | ✅ 全通 |
| **新增合计** | **66** | — | ✅ **全通** |
| **累计全量** | **285** | 所有模块 | ✅ **全通** |

**编译状态**: `npm run compile` → 0 错误、0 警告

---

## 五、架构决策与问题记录

### 5.1 已解决的工程问题

| 问题 | 影响 | 解决方案 | 代码位置 |
|------|------|----------|----------|
| 对话搜索全量 JSON 遍历性能差 | 项目/对话增多时搜索延迟显著 | 引入内存倒排索引，O(1) 关键词查找 | `src/utils/searchIndex.ts` |
| 智能推荐依赖 AI API（成本高/延迟大） | 离线场景无法使用，增加 Token 开销 | 改用关键词重叠 + 权重加成，零 AI 依赖 | `src/memory/recommender.ts` |
| Webview 回滚误触风险 | 用户可能意外覆盖当前数据 | 二次确认 + 回滚前自动创建新备份 | `src/ui/webview/versionControl.ts:485-535` |
| Python 引擎与主工程环境隔离 | 避免 npm/node 与 Python 依赖冲突 | 独立 `pyproject.toml`，标准库-only | `packages/memory-engine/pyproject.toml` |
| 扩展激活时搜索索引阻塞 UI | 大量文件扫描导致启动卡顿 | 异步 `rebuild()` + 索引就绪后状态栏提示 | `src/extension.ts:55-57` |
| 中文分词粒度 | 逐字切分 vs. 词组切分 | 采用逐字切分（简单、快速、索引膨胀可控） | `src/utils/searchIndex.ts:61-128` |

### 5.2 代码质量观察

**优秀实践**:
- 所有 Webview 均实现防抖刷新（`scheduleRefresh()` 250ms），避免频繁全量 HTML 重绘
- 路径安全检查贯穿所有文件操作（备份扫描、回滚、删除）
- 单例模式统一使用 `getInstance()` / `resetInstance()` 便于测试
- 事件回调机制封装 `onUpdate()`/`offUpdate()`，异常隔离不影响主流程
- Python CLI 支持环境变量 `REMEMBER_ME_DATA_DIR` 覆盖默认路径

**待改进项**:
- `extension.ts` 中 `registerCommands` 被调用了两次（第 52 行和第 58 行），存在冗余
- `conversationHistory.ts` 和 `memoryEditor.ts` 的部分渲染逻辑可进一步抽象为共享组件
- Python `server.py` 使用单线程 `http.server`，高并发场景需替换为 `asyncio` 方案

---

## 六、下一步计划

| 优先级 | 任务 | 说明 |
|--------|------|------|
| P0 | 实机调试 | 在 VS Code Extension Host 中验证 18 个命令的完整交互流程 |
| P0 | Python-TS 集成 | 验证 `memory-engine` HTTP 服务与扩展的 localhost 通信 |
| P1 | 索引持久化 | 将 `SearchIndex` 序列化到磁盘，插件重启后秒级恢复 |
| P1 | 模板市场 | 社区模板共享功能（JSON 导入/导出） |
| P2 | 语义搜索 | 基于向量嵌入的高级搜索（Phase 4） |
| P2 | 多语言停用词 | `MemoryRecommender` 当前仅内置中文停用词，需补充英文 |

---

**报告编制时间**: 2026-07-10 08:00 CST  
**数据来源**: `packages/` 目录下 23 个文件实际代码读取与统计  
**编制者**: AI 开发助手

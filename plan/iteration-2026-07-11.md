# Remember Me — 开发迭代计划

**迭代日期**: 2026-07-11（凌晨 02:00 启动）  
**计划编制时间**: 2026-07-10 20:00  
**迭代类型**: Phase 3 收尾验证 + 工程稳定性加固 + 模板市场 MVP  
**预估工时**: 4~5 小时（单轮迭代）  

---

## 一、当前进度总览

### 1.1 已完成模块（截至 2026-07-10 20:00）

| 阶段 | 模块 | 状态 | 代码位置 |
|------|------|------|----------|
| Phase 1 MVP | VS Code 插件脚手架 | ✅ 完成 | `package.json`, `tsconfig.json` |
| Phase 1 MVP | 核心类型定义 | ✅ 完成 | `src/types.ts` (117 行) |
| Phase 1 MVP | JSON 存储层 + 自动备份 | ✅ 完成 | `src/memory/storage.ts` (162 行) |
| Phase 1 MVP | 用户画像管理 | ✅ 完成 | `src/memory/profile.ts` (226 行) |
| Phase 1 MVP | 项目上下文管理 | ✅ 完成 | `src/memory/project.ts` (381 行) |
| Phase 1 MVP | 对话历史管理 | ✅ 完成 | `src/memory/conversation.ts` (542 行) |
| Phase 1 MVP | AI 适配层（6 提供商） | ✅ 完成 | `src/ai/` (8 个文件) |
| Phase 1 MVP | Provider 工厂 + 单例管理 | ✅ 完成 | `src/ai/provider.ts` (234 行) |
| Phase 1 MVP | 状态栏管理 | ✅ 完成 | `src/ui/statusBar.ts` (275 行) |
| Phase 1 MVP | 侧边栏 TreeDataProvider | ✅ 完成 | `src/ui/sidebarProvider.ts` (197 行) |
| Phase 1 MVP | Webview 基础抽象 | ✅ 完成 | `src/ui/webview/baseWebview.ts` (478 行) |
| Phase 1 MVP | 首次使用向导 | ✅ 完成 | `src/ui/webview/onboarding.ts` (396 行) |
| Phase 1 MVP | 设置面板 | ✅ 完成 | `src/ui/webview/settingsPanel.ts` (679 行) |
| Phase 1 MVP | 记忆编辑器 | ✅ 完成 | `src/ui/webview/memoryEditor.ts` (470 行) |
| Phase 1 MVP | 插件入口（18 命令） | ✅ 完成 | `src/extension.ts` (846 行) |
| Phase 1 MVP | 记忆注入 Prompt 构建器 | ✅ 完成 | `src/utils/promptBuilder.ts` (111 行) |
| Phase 2 核心 | 手动搜索记忆 | ✅ 完成 | `extension.ts::searchInStorage()` |
| Phase 2 核心 | 多项目切换 | ✅ 完成 | `extension.ts::switchProject` |
| Phase 2 核心 | 对话历史视图 | ✅ 完成 | `src/ui/webview/conversationHistory.ts` (1,071 行) |
| Phase 2 核心 | 记忆更新确认机制 | ✅ 完成 | `src/memory/updateDetector.ts` (401 行) |
| Phase 2 核心 | 关键信息自动提取 | ✅ 完成 | `src/memory/extractor.ts` (366 行) |
| Phase 3 增强 | 模板系统（8 场景） | ✅ 完成 | `src/template/` (4 个文件) |
| Phase 3 增强 | 风格一致性检查 | ✅ 完成 | `src/utils/styleChecker.ts` (488 行) |
| Phase 3 增强 | 智能推荐记忆（内容感知） | ✅ 完成 | `src/memory/recommender.ts` (~420 行) |
| Phase 3 增强 | 记忆版本控制 UI | ✅ 完成 | `src/ui/webview/versionControl.ts` (~950 行) |
| Phase 3 增强 | 搜索索引优化 | ✅ 完成 | `src/utils/searchIndex.ts` (~594 行) |
| 全局 | 日志系统（VS Code OutputChannel） | ✅ 完成 | `src/utils/logger.ts` (179 行) |
| 全局 | 测试套件 | ✅ 完成 | `src/test/` (285 个用例，全通) |
| 全局 | memory-engine Python 包 | ✅ 完成 | `packages/memory-engine/` (5 个文件) |
| 全局 | 项目文档 | ✅ 完成 | `docs/`, `README.md` |

### 1.2 待办事项清单（按 PRD 里程碑）

#### Phase 3：智能增强（剩余项）

| 需求 | PRD 章节 | 当前状态 | 阻塞影响 |
|------|----------|----------|----------|
| **社区模板市场** | §5.2 | ❌ 未实现 | **中** — Phase 3 唯一未完成需求，可先实现 MVP（导入/导出） |
| 语义搜索 | §5.2 Pro | ❌ 未实现 | **低** — Phase 4 功能，依赖向量数据库 |

#### 技术债务与已知问题

| 问题 | 影响 | 优先级 |
|------|------|--------|
| **`extension.ts` 中 `registerCommands` 被重复调用** | 第 52 行和第 58 行各调用一次，可能导致命令重复注册或内存泄漏 | **P0** |
| **`extension.ts` 第 697-698 行存在多余 `}`** | 语法冗余，虽当前编译通过但存在隐患 | **P0** |
| 搜索索引无持久化 | 插件重启后索引需全量重建，大数据量启动慢 | **P1** |
| 未在 Extension Host 中做端到端验证 | 18 个命令的实机交互未经验证 | **P0** |
| `memory-engine` 与主工程集成接口未打通 | VS Code 插件尚未调用 Python HTTP 服务 | **P1** |

---

## 二、本次迭代目标

> **目标**：完成 Phase 3 全部需求的 MVP 级别闭环（社区模板市场基础导入/导出），修复 `extension.ts` 关键代码缺陷，实现搜索索引持久化以优化重启体验，并在 VS Code Extension Host 中对核心命令链路进行端到端验证。所有代码保持编译零错误、测试全通过。

---

## 三、开发任务明细

### 任务组 A：端到端验证与关键 Bug 修复（优先级 P0）

#### A1. 修复 `extension.ts` 已知代码缺陷
- **优先级**: P0 🔴
- **负责模块**: `extension.ts`
- **任务描述**:
  1. **修复重复注册命令**：删除第 58 行多余的 `registerCommands(context, storage);` 调用（第 52 行已调用一次）
  2. **清理多余符号**：删除第 697-698 行的两个孤立 `}`（第 697 行 `}` 和第 698 行 `}` 不属于任何函数）
  3. 重新编译验证：`npm run compile` 确认 0 错误 0 警告
- **预期产出**:
  - `src/extension.ts` 修复后代码结构干净
  - 编译通过，无新增警告

#### A2. Extension Host 实机调试（端到端验证）
- **优先级**: P0 🔴
- **负责模块**: 全局 / `extension.ts` + 各 UI 模块
- **任务描述**:
  1. 使用 `F5` 启动 Extension Host，创建测试工作区
  2. **核心链路验证**（必须全部通过）：
     - [ ] 插件激活：状态栏正确显示「🧠 Remember Me」
     - [ ] 首次使用引导：删除 `~/.remember-me/profile.json` 后重启，3 秒后弹出欢迎提示
     - [ ] Onboarding 向导：5 步问卷可正常填写并保存
     - [ ] 开始对话（`rememberMe.startChat`）：正确注入记忆 Prompt，状态栏显示推荐
     - [ ] 切换项目（`rememberMe.switchProject`）：项目切换后状态栏更新
     - [ ] 搜索记忆（`rememberMe.searchMemory`）：输入关键词返回结果
     - [ ] 对话历史（`rememberMe.viewConversationHistory`）：Webview 正常打开
     - [ ] 记忆编辑器（`rememberMe.openMemoryEditor`）：可查看/编辑记忆
     - [ ] 版本控制（`rememberMe.openVersionControl`）：备份列表、JSON 预览、回滚
     - [ ] 模板选择（`rememberMe.selectTemplate`）：8 个内置模板可正常应用
     - [ ] 风格检查（`rememberMe.autoFixStyle`）：在 Markdown 文档上触发检查
  3. **边缘场景验证**：
     - [ ] 无网络时（AI 提供商不可达）的降级提示
     - [ ] 未设置画像时点击「开始对话」的引导流程
     - [ ] 快速连续点击命令无异常
  4. 记录所有发现的 UI/交互问题到 `reports/e2e-issues-2026-07-11.md`
- **预期产出**:
  - `reports/e2e-issues-2026-07-11.md`（问题清单，含复现步骤）
  - 发现的阻塞性问题当场修复，非阻塞性问题记录待排期

---

### 任务组 B：搜索索引持久化（优先级 P1）

#### B1. 索引序列化与快速恢复
- **优先级**: P1 🟡
- **负责模块**: `utils/searchIndex.ts` + `extension.ts`
- **任务描述**:
  1. 在 `SearchIndex` 类中新增 `save()` 方法：
     - 将 `Map<string, Set<string>>` 索引结构序列化为 JSON
     - 保存路径：`~/.remember-me/.index/search-index.json`
     - 同时保存元数据：最后更新时间、文档总数、索引版本号
  2. 新增 `load()` 方法：
     - 从上述路径读取索引文件
     - 检查索引版本号与当前代码版本是否匹配（不匹配则丢弃重建）
     - 检查文件修改时间：若任一源文件（profile.json / context.json / conversations/*.json）的 mtime 晚于索引 mtime，则标记为「需重建」
  3. 修改 `extension.ts::activate()` 中的索引初始化逻辑：
     - 优先调用 `searchIndex.load()`
     - 若加载成功且未过期，跳过 `rebuild()`，记录日志「索引从磁盘恢复，共 N 个文档」
     - 若加载失败或过期，执行全量 `rebuild()`，成功后自动 `save()`
  4. 在 `storage.write()` 调用后（通过事件或轮询）触发 `searchIndex.save()`，确保索引实时持久化
  5. 新增 `clear()` 方法：删除持久化索引文件，用于调试
- **依赖文件**: `src/memory/storage.ts`（需确认 write 后的事件暴露）
- **预期产出**:
  - 修改 `src/utils/searchIndex.ts`（~80 行新增：save/load/clear/版本检查）
  - 修改 `src/extension.ts`（~15 行，索引初始化逻辑调整）
  - 新增测试 `src/test/suite/searchIndexPersistence.test.ts`（~8 个用例：save/load/版本不匹配/过期检测）
  - 插件重启后索引恢复时间从 O(N) 全量扫描 → **O(1)** 文件读取

---

### 任务组 C：社区模板市场 MVP（优先级 P1）

#### C1. 模板导入/导出与共享协议
- **优先级**: P1 🟡
- **负责模块**: `template/manager.ts` + `template/types.ts` + `extension.ts`
- **PRD 依据**: §5.2 Pro 版 — 模板市场（社区共享模板）
- **任务描述**:
  1. **模板 JSON Schema 定义**（`src/template/schema.json` 或内联验证）：
     - 必需字段：`id`, `name`, `category`, `description`, `meta.difficulty`, `meta.typicalLength`, `sections`
     - 字段类型校验：确保导入的模板结构正确
  2. **导出模板**：
     - 新增命令 `rememberMe.exportTemplate`
     - 用户选择一个内置或自定义模板，导出为 `.remember-template.json` 文件
     - 导出内容包含完整模板定义 + `exportedAt` 时间戳 + `exportedBy` 标记
  3. **导入模板**：
     - 新增命令 `rememberMe.importTemplate`
     - 用户选择一个 `.remember-template.json` 文件
     - 校验 Schema：字段缺失或类型错误时提示「模板文件格式不正确」
     - 校验 ID 冲突：若 `id` 与现有模板重复，提示覆盖或重命名
     - 导入成功后保存到 `~/.remember-me/templates/` 目录，标记为 `isBuiltIn: false`
     - 导入成功后刷新模板管理器缓存
  4. **模板管理器增强**（`template/manager.ts`）：
     - `importFromFile(filePath: string): Result<Template, string>`
     - `exportToFile(templateId: string, filePath: string): boolean`
     - `validateTemplate(data: unknown): string[]`（返回错误列表，空数组表示通过）
  5. 在 `package.json` 中注册两个新命令
- **预期产出**:
  - 修改 `src/template/types.ts`（~10 行，新增导出元数据类型）
  - 修改 `src/template/manager.ts`（~120 行，import/export/validate 方法）
  - 修改 `src/extension.ts`（~40 行，注册命令和调用逻辑）
  - 修改 `package.json`（~20 行，新增命令声明）
  - 新增测试 `src/test/suite/templateMarket.test.ts`（~12 个用例：有效导入、无效 Schema、ID 冲突、导出内容正确）
  - 用户可通过命令面板导入/导出模板，实现 Phase 3「社区模板共享」的 MVP

---

### 任务组 D：memory-engine 集成检查（优先级 P1）

#### D1. VS Code 插件调用 Python HTTP 服务
- **优先级**: P1 🟡
- **负责模块**: `ai/` 或新建 `utils/engineClient.ts`
- **任务描述**:
  1. 新建 `EngineClient` 类，封装对 `memory-engine` HTTP 服务（默认端口 8765）的调用：
     - `healthCheck(): Promise<boolean>` — 检查服务是否可用
     - `extract(text: string): Promise<ExtractedInfo[]>` — 调用 `/extract`
     - `search(keyword: string): Promise<SearchResult[]>` — 调用 `/search`
  2. 在 `extension.ts::activate()` 中增加可选初始化：
     - 尝试连接 `localhost:8765`
     - 若服务可用，日志记录「memory-engine 服务已连接」
     - 若服务不可用，静默跳过（不阻塞插件启动，降级到 TypeScript 实现）
  3. 在 `InfoExtractor` 或 `UpdateDetector` 中增加「Python 引擎优先」开关：当 EngineClient 可用时，优先调用 Python 版的提取/搜索（更丰富的规则或性能优势）
- **预期产出**:
  - 新增 `src/utils/engineClient.ts`（~100 行）
  - 修改 `src/extension.ts`（~10 行，服务检测）
  - 新增测试 `src/test/suite/engineClient.test.ts`（~6 个用例：健康检查、提取调用、超时处理）
  - Python 服务启动后，VS Code 插件可无缝利用其能力

---

### 任务组 E：工程保障（优先级 P1）

#### E1. 编译与测试回归
- **优先级**: P1 🟡
- **负责模块**: 全局
- **任务描述**:
  1. 所有新增/修改文件通过 `tsc` 编译（`npm run compile`）
  2. 运行全部测试套件（`npm test`），新增用例全部通过
  3. 修复编译错误和测试失败
- **预期产出**:
  - `out/` 目录更新
  - 测试报告：全部通过（目标 310+ 用例）

#### E2. 迭代报告撰写
- **优先级**: P1 🟡
- **负责模块**: `reports/`
- **任务描述**:
  1. 编写 `reports/iteration-2026-07-11.md`
  2. 编写 `reports/daily-2026-07-11.md`
  3. 记录新增功能、修复问题、E2E 验证结果、代码统计、测试报告
- **预期产出**:
  - `reports/iteration-2026-07-11.md`
  - `reports/daily-2026-07-11.md`
  - `reports/e2e-issues-2026-07-11.md`（如 A2 发现问题）

---

## 四、任务优先级矩阵

```
           紧急程度
           高 ←————————→ 低
           ┌─────────┬─────────┐
     高   │ A1  A2  │   B1    │
重        │ (P0)    │  (P1)   │
要        ├─────────┼─────────┤
性   低   │   C1    │   D1    │
          │  (P1)   │  (P1)   │
          └─────────┴─────────┘
              E1 横跨所有象限（贯穿迭代始终）
              E2 在迭代末尾执行
```

---

## 五、执行顺序建议

```
02:00 ─┬─ 启动开发环境，确认 git 分支干净
       │
02:10 ─┬─ 【A1】修复 extension.ts 代码缺陷
       │    └─ 删除重复 registerCommands、清理多余符号，编译验证
       │
02:30 ─┬─ 【A2】Extension Host 实机调试（上）
       │    └─ 核心链路验证：激活 → Onboarding → 开始对话 → 切换项目 → 搜索记忆
       │
03:30 ─┬─ 【A2】Extension Host 实机调试（下）
       │    └─ 核心链路验证：对话历史 → 记忆编辑器 → 版本控制 → 模板选择 → 风格检查
       │
04:30 ─┬─ 【B1】搜索索引持久化
       │    └─ 新增 save/load/clear，修改 activate() 初始化逻辑
       │
05:30 ─┬─ 【C1】社区模板市场 MVP
       │    └─ 导入/导出/Schema 验证
       │
06:30 ─┬─ 【D1】memory-engine 集成检查
       │    └─ EngineClient 封装，服务可用性检测
       │
07:00 ─┬─ 【E1】编译与测试回归
       │    └─ tsc + npm test，修复问题
       │
07:30 ─┬─ 【E2】迭代报告撰写
       │
08:00 ── 迭代结束，提交代码
```

---

## 六、验收标准

| 检查项 | 标准 | 验证方式 |
|--------|------|----------|
| A1 Bug 修复 | `extension.ts` 中 `registerCommands` 仅调用一次；无孤立 `}` | 代码审查 + 编译 |
| A2 实机调试 | 11 项核心链路验证全部通过，记录在 `e2e-issues-*.md` | Extension Host F5 |
| B1 索引持久化 | 插件重启后 `searchIndex.load()` 成功恢复，日志显示恢复文档数 | 手动测试：重启 Extension Host，观察日志 |
| B1 索引过期 | 修改源文件后重启，索引自动重建而非加载过期索引 | 手动测试：touch 文件后重启 |
| C1 模板导出 | 执行「导出模板」命令后，生成有效的 `.remember-template.json` | 手动测试 + 单元测试 |
| C1 模板导入 | 选择有效模板文件导入后，可在「管理模板」中查看 | 手动测试 + 单元测试 |
| C1 Schema 校验 | 导入无效 JSON 时弹出「模板文件格式不正确」警告 | 单元测试 |
| D1 EngineClient | Python 服务启动时插件日志显示「memory-engine 服务已连接」 | 手动测试 |
| E1 编译 | `npm run compile` 0 错误 0 警告 | 命令行 |
| E1 测试 | `npm test` 全部通过 | 命令行 |

---

## 七、风险与应对

| 风险 | 可能性 | 影响 | 应对 |
|------|--------|------|------|
| Extension Host 调试发现大量交互问题 | 中 | A2 耗时超预期，挤压后续任务 | 优先记录问题而非当场修复；将非阻塞性问题移入 backlog |
| 索引持久化文件损坏导致加载失败 | 低 | B1 启动异常 | load() 内加 try/catch，损坏时自动丢弃并重建 |
| 模板 Schema 校验过于严格导致合法模板被拒 | 中 | C1 用户体验差 | Schema 采用「宽松验证」策略：仅校验必需字段类型，忽略未知字段 |
| Python 服务端口冲突 | 低 | D1 连接失败 | EngineClient 支持自定义端口；连接失败时降级到 TS 实现 |
| tsc 编译出现类型错误 | 中 | E1 阻塞 | 预留 30 分钟缓冲时间专门修编译问题 |

---

## 八、相关文档与代码入口

- **PRD 需求**: `docs/PRD.md`（§5.2 模板市场、§4.3 记忆更新）
- **架构文档**: `docs/ARCHITECTURE.md`（UI 层、存储层、数据流）
- **类型定义**: `packages/vscode-extension/src/types.ts`
- **插件入口**: `packages/vscode-extension/src/extension.ts`（注意第 52/58 行重复调用、第 697-698 行多余符号）
- **搜索索引**: `packages/vscode-extension/src/utils/searchIndex.ts`
- **模板管理器**: `packages/vscode-extension/src/template/manager.ts`
- **Python HTTP 服务**: `packages/memory-engine/src/memory_engine/server.py`
- **今日日报**: `reports/daily-2026-07-10.md`
- **今日迭代报告**: `reports/iteration-2026-07-10.md`

---

**计划版本**: v1.0  
**编制者**: 迭代计划系统  
**最后更新**: 2026-07-10 20:00

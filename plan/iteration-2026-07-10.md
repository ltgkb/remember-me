# Remember Me — 开发迭代计划

**迭代日期**: 2026-07-10（凌晨 02:00 启动）  
**计划编制时间**: 2026-07-09 20:00  
**迭代类型**: Phase 3 智能增强核心特性 + 技术债务清理  
**预估工时**: 4~5 小时（单轮迭代）  

---

## 一、当前进度总览

### 1.1 已完成模块（截至 2026-07-09 06:00）

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
| Phase 1 MVP | 插件入口（18 命令） | ✅ 完成 | `src/extension.ts` (710 行) |
| Phase 1 MVP | 记忆注入 Prompt 构建器 | ✅ 完成 | `src/utils/promptBuilder.ts` (111 行) |
| Phase 2 核心 | 手动搜索记忆 | ✅ 完成 | `extension.ts::searchInStorage()` |
| Phase 2 核心 | 多项目切换 | ✅ 完成 | `extension.ts::switchProject` |
| Phase 2 核心 | 对话历史视图 | ✅ 完成 | `src/ui/webview/conversationHistory.ts` (1,071 行) |
| Phase 2 核心 | 记忆更新确认机制 | ✅ 完成 | `src/memory/updateDetector.ts` (401 行) |
| Phase 2 核心 | 关键信息自动提取 | ✅ 完成 | `src/memory/extractor.ts` (366 行) |
| Phase 3 增强 | 模板系统（8 场景） | ✅ 完成 | `src/template/` (4 个文件) |
| Phase 3 增强 | 风格一致性检查 | ✅ 完成 | `src/utils/styleChecker.ts` (488 行) |
| 全局 | 日志系统（VS Code OutputChannel） | ✅ 完成 | `src/utils/logger.ts` (179 行) |
| 全局 | 测试套件 | ✅ 完成 | `src/test/` (205 个用例) |
| 全局 | 项目文档 | ✅ 完成 | `docs/`, `README.md` |

### 1.2 待办事项清单（按 PRD 里程碑）

#### Phase 3：智能增强（未完成项）

| 需求 | PRD 章节 | 当前状态 | 阻塞影响 |
|------|----------|----------|----------|
| **智能推荐记忆（内容感知）** | §2.2.2 | ❌ 未实现 | **高** — PRD 核心差异化卖点，Phase 3 标志性功能 |
| **记忆版本控制 UI** | §4.3 | ⚠️ 后端 `backup()` 已做，无回滚 UI | **高** — 用户无法查看/回滚历史版本 |
| 社区模板市场 | §5.2 | ❌ 未实现 | **低** — Pro 版功能，延后 |

#### 技术债务

| 问题 | 影响 | 优先级 |
|------|------|--------|
| `memory-engine` Python 包为空 | 高级功能无支撑，Phase 4 阻塞 | P1 |
| 对话搜索全量 JSON 遍历 | 大数据量性能下降 | P1 |
| 实机调试 | 需在 Extension Host 中验证 18 个命令 | P0（7月9日建议） |

---

## 二、本次迭代目标

> **目标**：实现 Phase 3 核心差异化特性「智能推荐记忆」，补齐「记忆版本控制」前端能力，启动 `memory-engine` Python 包开发，并引入搜索索引优化。所有新增代码通过编译和测试。

---

## 三、开发任务明细

### 任务组 A：Phase 3 智能增强核心（优先级 P0）

#### A1. 智能推荐记忆（内容感知）
- **优先级**: P0 🔴
- **负责模块**: `memory/recommender.ts` + `extension.ts` + `ui/statusBar.ts`
- **PRD 依据**: §2.2.2 智能推荐记忆、§2.3.1 记忆激活提示
- **任务描述**:
  1. 新建 `MemoryRecommender` 类，基于当前对话内容从历史记忆中自动推荐相关条目
  2. **推荐维度**：
     - 相关历史对话（"你上周讨论过用户角色体系，要查看吗？"）
     - 相关决策（"你之前决定用 OAuth 2.0，这个方案需要调整吗？"）
     - 相关术语（"你定义的'用户'是指企业管理员，需要确认吗？"）
  3. **匹配算法**（离线可用，零 AI 依赖）：
     - 提取当前对话关键词（基于 jieba 中文分词思路的轻量实现，或基于空格/标点切分）
     - 计算与历史记忆条目的关键词重叠度
     - 引入简单权重：近期对话 > 早期对话；同一项目 > 跨项目
  4. 在 `extension.ts::startChat` 中注入 Prompt 后，调用 `recommender.recommend()` 获取推荐列表
  5. 通过 `StatusBarManager` 显示推荐提示（`showMemoryRecommendation()`）
  6. 用户点击「查看」后打开对应记忆详情；点击「忽略」后记录到忽略列表（当前会话内不再推荐）
- **依赖文件**: `src/memory/conversation.ts`, `src/memory/project.ts`, `src/types.ts`, `src/ui/statusBar.ts`
- **预期产出**:
  - 新增 `src/memory/recommender.ts`（~250 行）
  - 修改 `src/extension.ts`（~30 行，集成推荐逻辑到 `startChat`）
  - 修改 `src/ui/statusBar.ts`（~40 行，新增 `showMemoryRecommendation` 方法）
  - 修改 `src/types.ts`（~10 行，新增 `MemoryRecommendation` 类型）
  - 新增测试 `src/test/suite/recommender.test.ts`（~15 个用例）
  - 实现 PRD §2.2.2 和 §2.3.1 的智能推荐交互

#### A2. 记忆版本控制 UI
- **优先级**: P0 🔴
- **负责模块**: `ui/webview/versionControl.ts` + `extension.ts`
- **PRD 依据**: §4.3 记忆更新 — 版本控制
- **任务描述**:
  1. 新建 `VersionControlWebview` 类，继承 `BaseWebview`
  2. **功能实现**：
     - 扫描 `~/.remember-me/` 下各目录的 `.backups/` 子目录，列出所有备份文件
     - 按文件分组显示备份历史（时间轴视图）
     - 点击备份项可查看 JSON 内容预览（只读）
     - 提供「回滚到此版本」按钮，确认后将备份覆盖原文件
     - 提供「删除此备份」按钮（仅删除备份，不影响当前文件）
  3. 在 `extension.ts` 中注册 `rememberMe.openVersionControl` 命令
  4. 在状态栏菜单和侧边栏添加入口
- **依赖文件**: `src/ui/webview/baseWebview.ts`, `src/memory/storage.ts`, `src/types.ts`
- **预期产出**:
  - 新增 `src/ui/webview/versionControl.ts`（~450 行）
  - 修改 `src/extension.ts`（~15 行，注册命令）
  - 修改 `src/ui/webview/index.ts`（+1 行，导出新 Webview）
  - 新增测试 `src/test/suite/versionControl.test.ts`（~12 个用例）
  - 用户可通过命令面板/状态栏菜单打开版本控制面板，查看备份历史并回滚

---

### 任务组 B：技术债务清理（优先级 P1）

#### B1. memory-engine Python 包启动
- **优先级**: P1 🟡
- **负责模块**: `packages/memory-engine/`
- **任务描述**:
  1. 新建 `packages/memory-engine/src/__init__.py` — 包入口，暴露核心 API
  2. 新建 `packages/memory-engine/src/cli.py` — 命令行接口，支持：
     - `remember-me-extract <conversation-file>` — 对单条对话文件执行关键信息提取
     - `remember-me-search <keyword> [--project <name>]` — 在记忆存储中搜索关键词
     - `remember-me-backup-list <file-path>` — 列出指定文件的备份历史
  3. 新建 `packages/memory-engine/src/extractor.py` — Python 版信息提取器，移植 TypeScript `InfoExtractor` 的核心正则规则
  4. 新建 `packages/memory-engine/pyproject.toml` — Python 包配置
  5. （可选）新建 `packages/memory-engine/src/server.py` — 简易 HTTP 服务，供 VS Code 插件通过 `localhost` 调用（为后续语义搜索铺垫）
- **预期产出**:
  - 新增 `packages/memory-engine/pyproject.toml`
  - 新增 `packages/memory-engine/src/__init__.py`
  - 新增 `packages/memory-engine/src/cli.py`（~150 行）
  - 新增 `packages/memory-engine/src/extractor.py`（~120 行）
  - 新增 `packages/memory-engine/src/server.py`（~80 行，可选）
  - 命令行 `remember-me-extract` / `remember-me-search` / `remember-me-backup-list` 可正常执行

#### B2. 对话搜索索引优化
- **优先级**: P1 🟡
- **负责模块**: `utils/searchIndex.ts` + `extension.ts`
- **任务描述**:
  1. 新建 `SearchIndex` 类，在内存中维护倒排索引：
     - `Map<string, Set<string>>` — 关键词 → 文件路径集合
     - 索引范围：profile.json、所有 project/context.json、所有 conversation/*.json
  2. **索引更新策略**：
     - 插件激活时全量构建一次索引
     - 每次 `storage.write()` 后增量更新索引（通过事件或轮询）
     - 提供 `rebuild()` 接口供手动重建
  3. 修改 `extension.ts::searchInStorage()`，优先使用索引搜索，未命中时回退到全量遍历
  4. 索引命中时返回结果时间从 O(N) 降到 O(1)（关键词查找）
- **预期产出**:
  - 新增 `src/utils/searchIndex.ts`（~180 行）
  - 修改 `src/extension.ts::searchInStorage()`（~20 行，接入索引）
  - 新增测试 `src/test/suite/searchIndex.test.ts`（~10 个用例）
  - 搜索响应速度提升，大数据量场景下体验改善

---

### 任务组 C：工程保障（优先级 P1）

#### C1. 编译与测试回归
- **优先级**: P1 🟡
- **负责模块**: 全局
- **任务描述**:
  1. 所有新增/修改文件通过 `tsc` 编译（`npm run compile`）
  2. 运行全部测试套件（`npm test`），新增用例全部通过
  3. 修复编译错误和测试失败
- **预期产出**:
  - `out/` 目录更新
  - 测试报告：全部通过（目标 240+ 用例）

#### C2. 迭代报告撰写
- **优先级**: P1 🟡
- **负责模块**: `reports/`
- **任务描述**:
  1. 编写 `reports/iteration-2026-07-10.md`
  2. 编写 `reports/daily-2026-07-10.md`
  3. 记录新增功能、修复问题、代码统计、测试报告
- **预期产出**:
  - `reports/iteration-2026-07-10.md`
  - `reports/daily-2026-07-10.md`

---

## 四、任务优先级矩阵

```
           紧急程度
           高 ←————————→ 低
           ┌─────────┬─────────┐
     高   │ A1  A2  │   B1    │
重        │ (P0)    │  (P1)   │
要        ├─────────┼─────────┤
性   低   │   B2    │   C2    │
          │  (P1)   │  (P1)   │
          └─────────┴─────────┘
              C1 横跨所有象限（贯穿迭代始终）
```

---

## 五、执行顺序建议

```
02:00 ─┬─ 启动开发环境，确认 git 分支干净
       │
02:10 ─┬─ 【B2】搜索索引优化（searchIndex.ts）
       │    └─ 相对独立，无 UI 依赖，可先实现和测试
       │
02:50 ─┬─ 【A1】智能推荐记忆（recommender.ts）
       │    └─ Phase 3 核心特性，依赖 B2 的索引数据
       │
04:00 ─┬─ 【A2】记忆版本控制 UI（versionControl.ts）
       │    └─ 需继承 BaseWebview，工作量较大
       │
05:30 ─┬─ 【B1】memory-engine Python 包启动
       │    └─ 与 TypeScript 主工程相对独立，可并行思考设计
       │
06:30 ─┬─ 【C1】编译与测试回归
       │    └─ tsc + npm test，修复问题
       │
07:00 ─┬─ 【C2】迭代报告撰写
       │
07:30 ── 迭代结束，提交代码
```

---

## 六、验收标准

| 检查项 | 标准 | 验证方式 |
|--------|------|----------|
| A1 智能推荐 | 在 `startChat` 注入 Prompt 后，若历史记忆中有相关内容，状态栏显示推荐提示 | 手动 F5 调试 |
| A1 推荐忽略 | 点击「忽略」后当前会话不再推荐同一内容 | 手动 F5 调试 |
| A2 版本控制 | 点击「记忆版本控制」打开 Webview，显示备份时间轴 | 手动 F5 调试 |
| A2 回滚 | 选择备份版本并回滚后，对应 JSON 文件内容恢复为备份版本 | 查看 `~/.remember-me/` |
| B1 CLI | `python -m memory_engine extract <file>` 可正常提取信息 | 命令行 |
| B2 索引 | 搜索关键词时优先走索引，大量数据下响应更快 | 单元测试 + 手动验证 |
| C1 编译 | `npm run compile` 0 错误 0 警告 | 命令行 |
| C1 测试 | `npm test` 全部通过 | 命令行 |

---

## 七、风险与应对

| 风险 | 可能性 | 影响 | 应对 |
|------|--------|------|------|
| 智能推荐匹配算法准确度不足 | 中 | A1 体验下降 | 先以关键词重叠为基础，后续迭代引入 TF-IDF 权重 |
| Webview 回滚操作误触导致数据丢失 | 中 | 用户数据风险 | 回滚前强制二次确认弹窗；回滚前自动创建新备份 |
| Python 包与主工程环境隔离 | 低 | B1 集成困难 | 独立 pyproject.toml，不耦合 npm 流程 |
| tsc 编译出现类型错误 | 中 | C1 阻塞 | 预留 30 分钟缓冲时间专门修编译问题 |

---

## 八、相关文档与代码入口

- **PRD 需求**: `docs/PRD.md`（§2.2 记忆触发、§2.3 对话内提醒、§4.3 记忆更新）
- **架构文档**: `docs/ARCHITECTURE.md`（UI 层、记忆管理、数据流）
- **类型定义**: `packages/vscode-extension/src/types.ts`
- **Webview 基类**: `packages/vscode-extension/src/ui/webview/baseWebview.ts`
- **状态栏提示**: `packages/vscode-extension/src/ui/statusBar.ts`
- **存储备份**: `packages/vscode-extension/src/memory/storage.ts`（`backup()` 方法）
- **今日日报**: `reports/daily-2026-07-09.md`
- **今日迭代报告**: `reports/iteration-2026-07-09.md`

---

**计划版本**: v1.0  
**编制者**: 迭代计划系统  
**最后更新**: 2026-07-09 20:00

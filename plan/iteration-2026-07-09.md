# Remember Me — 开发迭代计划

**迭代日期**: 2026-07-09（凌晨 02:00 启动）  
**计划编制时间**: 2026-07-08 20:00  
**迭代类型**: Phase 2 核心功能补全 + Phase 3 智能增强启动  
**预估工时**: 4~5 小时（单轮迭代）  

---

## 一、当前进度总览

### 1.1 已完成模块（Phase 1 ~ Phase 3 部分）

| 阶段 | 模块 | 状态 | 代码位置 |
|------|------|------|----------|
| Phase 1 MVP | VS Code 插件脚手架 | ✅ 完成 | `package.json`, `tsconfig.json` |
| Phase 1 MVP | 核心类型定义 | ✅ 完成 | `src/types.ts` (117 行) |
| Phase 1 MVP | JSON 存储层 | ✅ 完成 | `src/memory/storage.ts` (161 行) |
| Phase 1 MVP | 用户画像管理 | ✅ 完成 | `src/memory/profile.ts` (226 行) |
| Phase 1 MVP | 项目上下文管理 | ✅ 完成 | `src/memory/project.ts` (381 行) |
| Phase 1 MVP | 对话历史管理（后端） | ✅ 完成 | `src/memory/conversation.ts` (542 行) |
| Phase 1 MVP | AI 适配层（6 提供商） | ✅ 完成 | `src/ai/` (8 个文件) |
| Phase 1 MVP | Provider 工厂 + 单例管理 | ✅ 完成 | `src/ai/provider.ts` (234 行) |
| Phase 1 MVP | 状态栏管理 | ✅ 完成 | `src/ui/statusBar.ts` (275 行) |
| Phase 1 MVP | 侧边栏 TreeDataProvider | ✅ 完成 | `src/ui/sidebarProvider.ts` (197 行) |
| Phase 1 MVP | Webview 基础抽象 | ✅ 完成 | `src/ui/webview/baseWebview.ts` (478 行) |
| Phase 1 MVP | 首次使用向导 | ✅ 完成 | `src/ui/webview/onboarding.ts` (396 行) |
| Phase 1 MVP | 设置面板 | ✅ 完成 | `src/ui/webview/settingsPanel.ts` (679 行) |
| Phase 1 MVP | 记忆编辑器 | ✅ 完成 | `src/ui/webview/memoryEditor.ts` (470 行) |
| Phase 1 MVP | 插件入口（15 命令） | ✅ 完成 | `src/extension.ts` (580 行) |
| Phase 1 MVP | 记忆注入 Prompt 构建器 | ✅ 完成 | `src/utils/promptBuilder.ts` (111 行) |
| Phase 2 核心 | 手动搜索记忆 | ✅ 完成 | `extension.ts::searchInStorage()` |
| Phase 2 核心 | 多项目切换 | ✅ 完成 | `extension.ts::switchProject` |
| Phase 2 核心 | 6 个 AI 提供商接入 | ✅ 完成 | `src/ai/` 全部适配器 |
| Phase 3 增强 | 模板系统（8 场景） | ✅ 完成 | `src/template/` (4 个文件) |
| 全局 | 测试套件 | ✅ 完成 | `src/test/` (110 个用例) |
| 全局 | 项目文档 | ✅ 完成 | `docs/`, `README.md` |

### 1.2 待办事项清单（按 PRD 里程碑）

#### Phase 2：核心功能（未完成项）

| 需求 | PRD 章节 | 当前状态 | 阻塞影响 |
|------|----------|----------|----------|
| 对话历史自动记录 | §2.1.4 | ⚠️ 后端完成，UI 为占位符 | **高** — 用户无法查看历史 |
| 关键信息自动提取 | §2.2.2 | ❌ 未实现 | **高** — 智能推荐依赖此功能 |
| 记忆更新确认机制 | §2.3.2 | ❌ 未实现 | **高** — PRD 核心交互设计 |

#### Phase 3：智能增强（未完成项）

| 需求 | PRD 章节 | 当前状态 | 阻塞影响 |
|------|----------|----------|----------|
| 智能推荐记忆（内容感知） | §2.2.2 | ❌ 未实现 | **中** — 差异化卖点 |
| 风格一致性检查 | §2.3.3 | ❌ 未实现 | **中** — 差异化卖点 |
| 记忆版本控制 UI | §4.3 | ⚠️ 后端备份已做，无回滚 UI | **低** — 增强体验 |
| 社区模板市场 | §5.2 | ❌ 未实现 | **低** — Pro 版功能 |

#### 技术债务

| 问题 | 影响 | 优先级 |
|------|------|--------|
| 日志系统使用 `console.*` | 生产环境无法追踪 | P1 |
| `viewConversationHistory` 为占位符 | 用户无法使用此功能 | **P0** |
| 对话搜索无缓存/索引 | 大数据量性能下降 | P2 |
| `memory-engine` Python 包为空 | 高级功能无支撑 | P2 |

---

## 二、本次迭代目标

> **目标**：补齐 Phase 2 核心功能缺口，启动 Phase 3 首个智能增强特性，确保所有新增代码通过编译和测试。

---

## 三、开发任务明细

### 任务组 A：Phase 2 核心功能补全（优先级 P0）

#### A1. 对话历史视图实现
- **优先级**: P0 🔴
- **负责模块**: `ui/webview/conversationHistory.ts` + `extension.ts`
- **任务描述**:
  1. 新建 `ConversationHistoryWebview` 类，继承 `BaseWebview`
  2. 实现对话列表渲染（按项目分组，按时间倒序）
  3. 实现对话详情查看（消息流、关键决策、洞察）
  4. 实现对话筛选（按项目/标签/日期范围）
  5. 替换 `extension.ts` 中 `viewConversationHistory` 的占位符逻辑
- **依赖文件**: `src/ui/webview/baseWebview.ts`, `src/memory/conversation.ts`, `src/memory/project.ts`
- **预期产出**:
  - 新增 `src/ui/webview/conversationHistory.ts`（~400 行）
  - 修改 `src/extension.ts`（~10 行，替换占位符）
  - 新增测试 `src/test/suite/conversationHistory.test.ts`（~15 个用例）
  - 用户可通过命令面板/状态栏菜单查看完整的对话历史

#### A2. 记忆更新确认机制
- **优先级**: P0 🔴
- **负责模块**: `memory/updateDetector.ts` + `extension.ts` + `ui/statusBar.ts`
- **任务描述**:
  1. 新建 `UpdateDetector` 模块，监听用户与 AI 的对话内容
  2. 基于关键词匹配 + 简单规则检测潜在的新信息（如"我们决定用..."、"用户是..."）
  3. 当检测到新信息时，通过 `StatusBarManager.showNewInfoDetected()` 提示用户
  4. 用户选择"更新"后，自动解析并写入对应项目的 `context.json`（决策/术语/竞品）
  5. 用户选择"标记为待确认"后，写入 `decisions` 数组并设置 `status: '待确认'`
- **依赖文件**: `src/ui/statusBar.ts`, `src/memory/project.ts`, `src/memory/conversation.ts`
- **预期产出**:
  - 新增 `src/memory/updateDetector.ts`（~200 行）
  - 修改 `src/extension.ts`（~30 行，集成检测逻辑到 `startChat` 流程）
  - 新增测试 `src/test/suite/updateDetector.test.ts`（~10 个用例）
  - 实现 PRD §2.3.2 的新信息检测提示交互

#### A3. 关键信息自动提取
- **优先级**: P0 🔴
- **负责模块**: `memory/extractor.ts`
- **任务描述**:
  1. 新建 `InfoExtractor` 类，对对话内容进行结构化提取
  2. 提取维度：决策（"决定..."）、术语定义（"XXX 是指..."）、竞品提及（"竞品有..."）
  3. 使用正则规则引擎（Phase 2 先不引入 AI 提取，保证本地离线可用）
  4. 提供 `extractFromConversation(conversation: Conversation): ExtractedInfo[]` 接口
  5. 在对话保存时自动调用，将提取结果作为 `Insight` 写入对话记录
- **依赖文件**: `src/types.ts`（需新增 `ExtractedInfo` 类型）, `src/memory/conversation.ts`
- **预期产出**:
  - 新增 `src/memory/extractor.ts`（~180 行）
  - 修改 `src/types.ts`（~15 行，新增类型）
  - 新增测试 `src/test/suite/extractor.test.ts`（~12 个用例）
  - 对话保存时自动提取关键信息并生成 Insight

---

### 任务组 B：Phase 3 智能增强启动（优先级 P1）

#### B1. 风格一致性检查
- **优先级**: P1 🟡
- **负责模块**: `utils/styleChecker.ts` + `extension.ts`
- **任务描述**:
  1. 新建 `StyleChecker` 模块，根据用户画像的 `StyleInfo` 检查 AI 生成内容
  2. 检查项：
     - PRD 场景：是否包含验收标准、用户故事、竞品对比（依据 `specialHabits`）
     - 文档结构：是否符合用户偏好的结构顺序
     - 语言：是否符合用户设定的语言
     - 详细程度：内容篇幅是否符合 `detailLevel`
  3. 检测到不一致时，通过 `StatusBarManager.showStyleConsistencyWarning()` 提示
  4. 提供 `autoFixStyle` 命令的完整实现（调用 AI 补全缺失内容）
- **依赖文件**: `src/utils/promptBuilder.ts`, `src/ui/statusBar.ts`, `src/types.ts`
- **预期产出**:
  - 新增 `src/utils/styleChecker.ts`（~250 行）
  - 修改 `src/extension.ts`（~20 行，注册 `autoFixStyle` 命令）
  - 新增测试 `src/test/suite/styleChecker.test.ts`（~10 个用例）
  - 实现 PRD §2.3.3 的风格检查交互

#### B2. VS Code OutputChannel 日志系统
- **优先级**: P1 🟡
- **负责模块**: `utils/logger.ts`（全局替换）
- **任务描述**:
  1. 新建 `Logger` 封装，内部使用 `vscode.window.createOutputChannel('Remember Me')`
  2. 提供 `debug/info/warn/error` 四级日志
  3. 全局搜索替换所有 `console.log/warn/error` 为 `Logger.*`
  4. 保留开发模式下的控制台输出（通过配置开关）
- **影响文件**: 全部 `src/**/*.ts`（约 30 处 `console.*` 调用）
- **预期产出**:
  - 新增 `src/utils/logger.ts`（~80 行）
  - 修改约 15 个源文件（批量替换 `console.*`）
  - 用户在 VS Code「输出」面板可查看 Remember Me 日志

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
  - 测试报告：全部通过（目标 150+ 用例）

#### C2. 迭代报告撰写
- **优先级**: P1 🟡
- **负责模块**: `reports/`
- **任务描述**:
  1. 编写 `reports/iteration-2026-07-09.md`
  2. 记录新增功能、修复问题、代码统计、测试报告
- **预期产出**:
  - `reports/iteration-2026-07-09.md`

---

## 四、任务优先级矩阵

```
           紧急程度
           高 ←————————→ 低
           ┌─────────┬─────────┐
     高   │ A1 A2 A3│   B1    │
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
02:10 ─┬─ 【A3】关键信息自动提取（extractor.ts）
       │    └─ 无 UI 依赖，可先独立实现和测试
       │
03:00 ─┬─ 【A2】记忆更新确认机制（updateDetector.ts）
       │    └─ 依赖 A3 的 extractor 接口
       │
04:00 ─┬─ 【A1】对话历史视图（conversationHistory.ts）
       │    └─ 需继承 BaseWebview，工作量最大
       │
05:30 ─┬─ 【B2】日志系统（logger.ts + 全局替换）
       │    └─ 机械替换，可并行思考 B1 设计
       │
06:00 ─┬─ 【B1】风格一致性检查（styleChecker.ts）
       │    └─ 依赖日志系统完成后的调试
       │
07:00 ─┬─ 【C1】编译与测试回归
       │    └─ tsc + npm test，修复问题
       │
07:30 ─┬─ 【C2】迭代报告撰写
       │
08:00 ── 迭代结束，提交代码
```

---

## 六、验收标准

| 检查项 | 标准 | 验证方式 |
|--------|------|----------|
| A1 对话历史 | 点击"查看对话历史"可打开 Webview，显示按项目分组的对话列表 | 手动 F5 调试 |
| A2 记忆更新 | 在对话中输入"我们决定用 OAuth 2.0"，弹出更新提示 | 手动 F5 调试 |
| A3 信息提取 | 保存对话后，自动提取的 Insight 写入 JSON 文件 | 查看 `~/.remember-me/` |
| B1 风格检查 | AI 生成的 PRD 缺少验收标准时，弹出风格警告 | 手动 F5 调试 |
| B2 日志系统 | VS Code「输出」面板出现 "Remember Me" 通道 | 面板检查 |
| C1 编译 | `npm run compile` 0 错误 0 警告 | 命令行 |
| C1 测试 | `npm test` 全部通过 | 命令行 |

---

## 七、风险与应对

| 风险 | 可能性 | 影响 | 应对 |
|------|--------|------|------|
| Webview 开发耗时超预期 | 中 | A1 延期 | 将 A1 拆分为"列表视图"和"详情视图"两步，先保证列表可用 |
| 正则提取规则误报率高 | 中 | A3 质量下降 | 提供用户反馈入口（"这个提取对吗？"），积累规则优化数据 |
| 全局 `console.*` 替换遗漏 | 低 | 日志不统一 | 使用 `grep -r "console\." src/` 做最终检查 |
| tsc 编译出现类型错误 | 中 | C1 阻塞 | 预留 30 分钟缓冲时间专门修编译问题 |

---

## 八、相关文档与代码入口

- **PRD 需求**: `docs/PRD.md`（§2.2 记忆触发、§2.3 对话内提醒）
- **架构文档**: `docs/ARCHITECTURE.md`（UI 层、记忆管理、数据流）
- **类型定义**: `packages/vscode-extension/src/types.ts`
- **Webview 基类**: `packages/vscode-extension/src/ui/webview/baseWebview.ts`
- **状态栏提示**: `packages/vscode-extension/src/ui/statusBar.ts`（`showNewInfoDetected`, `showStyleConsistencyWarning`）
- **对话管理**: `packages/vscode-extension/src/memory/conversation.ts`
- **项目管理**: `packages/vscode-extension/src/memory/project.ts`

---

**计划版本**: v1.0  
**编制者**: 迭代计划系统  
**最后更新**: 2026-07-08 20:00

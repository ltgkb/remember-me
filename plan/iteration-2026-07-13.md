# Remember Me — 开发迭代计划

**迭代日期**: 2026-07-13（凌晨 02:00 启动）  
**计划编制时间**: 2026-07-12 20:00  
**迭代类型**: Phase 3 实机验证收尾 + 工程债务清理 + Phase 4 原型启动  
**预估工时**: 5~6 小时（单轮迭代）  

---

## 一、当前进度总览

### 1.1 已完成模块（截至 2026-07-12 20:00）

| 阶段 | 模块 | 状态 | 代码位置 |
|------|------|------|----------|
| Phase 1 MVP | VS Code 插件脚手架 | ✅ 完成 | `package.json`, `tsconfig.json` |
| Phase 1 MVP | 核心类型定义 | ✅ 完成 | `src/types.ts` (132 行) |
| Phase 1 MVP | JSON 存储层 + 自动备份 | ✅ 完成 | `src/memory/storage.ts` |
| Phase 1 MVP | 用户画像管理 | ✅ 完成 | `src/memory/profile.ts` |
| Phase 1 MVP | 项目上下文管理 | ✅ 完成 | `src/memory/project.ts` (382 行) |
| Phase 1 MVP | 对话历史管理 | ✅ 完成 | `src/memory/conversation.ts` |
| Phase 1 MVP | AI 适配层（6 提供商） | ✅ 完成 | `src/ai/` (8 个文件) |
| Phase 1 MVP | Provider 工厂 + 单例管理 | ✅ 完成 | `src/ai/provider.ts` |
| Phase 1 MVP | 状态栏管理 | ✅ 完成 | `src/ui/statusBar.ts` |
| Phase 1 MVP | 侧边栏 TreeDataProvider | ✅ 完成 | `src/ui/sidebarProvider.ts` |
| Phase 1 MVP | Webview 基础抽象 | ✅ 完成 | `src/ui/webview/baseWebview.ts` |
| Phase 1 MVP | 首次使用向导 | ✅ 完成 | `src/ui/webview/onboarding.ts` |
| Phase 1 MVP | 设置面板 | ✅ 完成 | `src/ui/webview/settingsPanel.ts` |
| Phase 1 MVP | 记忆编辑器 | ✅ 完成 | `src/ui/webview/memoryEditor.ts` |
| Phase 1 MVP | 插件入口（23 命令） | ✅ 完成 | `src/extension.ts` (751 行) |
| Phase 1 MVP | 记忆注入 Prompt 构建器 | ✅ 完成 | `src/utils/promptBuilder.ts` |
| Phase 2 核心 | 手动搜索记忆 | ✅ 完成 | `extension.ts::searchInStorage()` |
| Phase 2 核心 | 多项目切换 | ✅ 完成 | `extension.ts::switchProject` |
| Phase 2 核心 | 对话历史视图 | ✅ 完成 | `src/ui/webview/conversationHistory.ts` |
| Phase 2 核心 | 记忆更新确认机制 | ✅ 完成 | `src/memory/updateDetector.ts` |
| Phase 2 核心 | 关键信息自动提取 | ✅ 完成 | `src/memory/extractor.ts` |
| Phase 3 增强 | 模板系统（8 场景） | ✅ 完成 | `src/template/` (4 个文件 + 8 内置模板) |
| Phase 3 增强 | 风格一致性检查 | ✅ 完成 | `src/utils/styleChecker.ts` |
| Phase 3 增强 | 智能推荐记忆（内容感知） | ✅ 完成 | `src/memory/recommender.ts` (444 行) |
| Phase 3 增强 | 记忆版本控制 UI | ✅ 完成 | `src/ui/webview/versionControl.ts` |
| Phase 3 增强 | 搜索索引优化 + 持久化 | ✅ 完成 | `src/utils/searchIndex.ts` |
| Phase 3 增强 | 社区模板市场 MVP | ✅ 完成 | `src/template/manager.ts` |
| Phase 3 增强 | EngineClient 集成 | ✅ 完成 | `src/utils/engineClient.ts` (196 行) |
| Phase 3 增强 | 语义搜索技术预研 | ✅ 完成 | `docs/research/semantic-search-2026-07-12.md` |
| 全局 | 日志系统 | ✅ 完成 | `src/utils/logger.ts` |
| 全局 | 测试套件 | ✅ 完成 | 319 个用例通过，1 个已知失败 |
| 全局 | memory-engine Python 包 | ✅ 完成 | `packages/memory-engine/` (5 个文件) |
| 全局 | 项目文档 | ✅ 完成 | `docs/`, `README.md` |

### 1.2 待办事项与已知问题（按 PRD 里程碑）

#### 实机验证（07-12 迭代延后项）

| 需求 | 来源 | 当前状态 | 阻塞影响 |
|------|------|----------|----------|
| **Extension Host 端到端验证** | 07-12 任务 A1 | ❌ 未执行 | **P0** — 20+ 命令的实机交互未经验证，为 Phase 3 交付前最后一道质量关 |
| **memory-engine 端到端验证** | 07-12 任务 B2 | ❌ 未执行 | **P0** — Python HTTP 服务实机调用链路未验证，extract/search 端点待联调 |

#### 工程债务

| 问题 | 影响 | 优先级 |
|------|------|--------|
| **ProjectManager.list 排序测试失败** | `list()` 按 `updatedAt` 倒序时，相同毫秒级时间戳导致排序不稳定（`ProjectA` vs `ProjectB` 断言失败） | **P1** |
| **语义搜索未实现** | PRD §5.2 Pro 版功能，Phase 4 专属 | **P1** — 预研已完成，本次迭代启动快速原型 |
| **Phase 3 演示文档缺失** | 影响 README 更新和社交媒体宣发 | **P2** |

---

## 二、本次迭代目标

> **目标**：完成 Phase 3 全部功能的实机验证闭环，修复工程债务（排序测试 + 编译回归），启动语义搜索快速原型验证，为 Phase 3 正式交付和 Phase 4 商业化功能奠定工程基础。

---

## 三、开发任务明细

### 任务组 A：Extension Host 端到端验证（优先级 P0）

#### A1. Extension Host 实机调试（核心链路验证）
- **优先级**: P0 🔴
- **负责模块**: 全局 / `extension.ts` + 各 UI 模块
- **任务描述**:
  1. 使用 `F5` 启动 Extension Host，创建测试工作区
  2. **核心链路验证**（必须全部通过）：
     - [ ] 插件激活：状态栏正确显示「🧠 Remember Me」
     - [ ] 首次使用引导：删除 `~/.remember-me/profile.json` 后重启，自动弹出欢迎提示
     - [ ] Onboarding 向导：5 步问卷可正常填写并保存到 `profile.json`
     - [ ] 打开设置（`rememberMe.openSettings`）：Webview 设置面板三标签页正常加载
     - [ ] 开始对话（`rememberMe.startChat`）：正确注入记忆 Prompt，AI 返回流式响应，状态栏显示推荐
     - [ ] 切换项目（`rememberMe.switchProject`）：项目切换后状态栏与侧边栏同步更新
     - [ ] 搜索记忆（`rememberMe.searchMemory`）：输入关键词返回结果列表
     - [ ] 查看对话历史（`rememberMe.viewConversationHistory`）：Webview 正常打开并显示历史列表
     - [ ] 打开记忆编辑器（`rememberMe.openMemoryEditor`）：可查看/编辑记忆条目
     - [ ] 记忆版本控制（`rememberMe.openVersionControl`）：备份列表、JSON 预览、回滚按钮正常
     - [ ] 选择模板（`rememberMe.selectTemplate`）：8 个内置模板 QuickPick 可正常选择
     - [ ] 管理模板（`rememberMe.manageTemplates`）：模板数量统计正确
     - [ ] 导出模板（`rememberMe.exportTemplate`）：生成有效的 `.remember-template.json`
     - [ ] 导入模板（`rememberMe.importTemplate`）：选择文件后成功导入并刷新列表
     - [ ] 预览模板（`rememberMe.previewTemplate`）：模板结构预览正常
     - [ ] 应用模板（`rememberMe.applyTemplate`）：在文档中插入模板内容
     - [ ] 更新个人画像（`rememberMe.updateProfile`）：信息修改后持久化并刷新状态栏
     - [ ] 刷新记忆（`rememberMe.refreshMemory`）：侧边栏数据刷新
     - [ ] 显示菜单/快捷菜单（`rememberMe.showMenu` / `showQuickMenu`）：菜单正常弹出
     - [ ] 忽略推荐（`rememberMe.ignoreRecommendation`）：推荐项可正确忽略
     - [ ] 自动修复风格（`rememberMe.autoFixStyle`）：对 Markdown 文档执行风格检查并修复
  3. **边缘场景验证**：
     - [ ] 无网络时（AI 提供商不可达）的降级提示与优雅处理
     - [ ] 未设置画像时点击「开始对话」的引导流程（先跳转 Onboarding）
     - [ ] 快速连续点击命令无异常（防抖与状态一致性）
     - [ ] 关闭并重新打开 VS Code 后记忆状态正确恢复（profile + current project）
  4. 记录所有发现的 UI/交互问题到 `reports/e2e-issues-2026-07-13.md`
- **预期产出**:
  - `reports/e2e-issues-2026-07-13.md`（问题清单，含复现步骤、严重级别、截图引用）
  - 发现的阻塞性问题当场修复，非阻塞性问题记录待排期

---

### 任务组 B：memory-engine 端到端验证（优先级 P0）

#### B1. Python 服务启动与实机调用验证
- **优先级**: P0 🔴
- **负责模块**: `packages/memory-engine/` + `src/utils/engineClient.ts`
- **任务描述**:
  1. 在独立终端中启动 `python -m memory_engine.server --port 8765`
  2. 在 Extension Host 中触发 `rememberMe.startChat`，观察日志中 EngineClient 是否成功连接
  3. 手动验证各端点：
     - `GET /health` → 返回 `{"status":"ok","service":"remember-me-engine","version":"0.1.0"}`，插件日志显示「memory-engine 服务已连接」
     - `POST /extract` → 输入中文文本（如 "我们决定采用 OAuth 2.0 作为认证方案"），确认返回提取结果数组，且 `results` 包含 `type`, `raw_text`, `confidence` 字段
     - `POST /search` → 输入关键词 "OAuth"，确认返回匹配片段，字段包含 `file`, `line`, `snippet`
  4. 验证 EngineClient 超时与降级：在不启动 Python 服务时，确认插件正常启动且不报错，日志显示降级警告
  5. 验证 `src/utils/engineClient.ts` 字段映射正确性：`raw_text`→`text`, `file`→`path`, `snippet`→`content`
- **预期产出**:
  - `reports/e2e-engine-2026-07-13.md`（验证记录，含端点调用结果、响应时间、字段映射确认）
  - 确认 `engineClient.healthCheck()` 在 Python 服务可用时返回 `true`，不可用时返回 `false`

---

### 任务组 C：工程债务修复（优先级 P1）

#### C1. 修复 ProjectManager.list 排序测试失败
- **优先级**: P1 🟡
- **负责模块**: `src/memory/project.ts`
- **任务描述**:
  1. **根因分析**：`list()` 方法按 `updatedAt` 倒序排列，但 `create()` 使用 `new Date().toISOString()`，当两个项目在同一毫秒内创建时，`updatedAt` 相同，导致 `Array.sort()` 排序不稳定，测试结果不可预期
  2. **修复方案**（选择其一）：
     - 方案 A：在 `list()` 排序逻辑中增加二级排序键 —— 当 `updatedAt` 相同时，按 `createdAt` 倒序，再相同按 `name` 正序
     - 方案 B：在 `create()` 中确保时间戳唯一性（如追加微秒级随机数或递增序号）
     - **推荐方案 A**：不改变数据模型，仅在展示层增加排序稳定性
  3. 修改 `src/memory/project.ts` 第 143 行排序逻辑：
     ```typescript
     projects.sort((a, b) => {
       const timeDiff = new Date(b.context.updatedAt).getTime() - new Date(a.context.updatedAt).getTime();
       if (timeDiff !== 0) return timeDiff;
       const createdDiff = new Date(b.context.createdAt).getTime() - new Date(a.context.createdAt).getTime();
       if (createdDiff !== 0) return createdDiff;
       return a.context.name.localeCompare(b.context.name);
     });
     ```
  4. 运行 `npm test` 确认 `ProjectManager.list 应按更新时间倒序返回项目` 通过
- **预期产出**:
  - 修改 `src/memory/project.ts`（~5 行排序逻辑增强）
  - 测试回归：`npm test` 320/320 全部通过（消除当前唯一失败）

#### C2. 编译与测试回归
- **优先级**: P1 🟡
- **负责模块**: 全局
- **任务描述**:
  1. 所有新增/修改文件通过 `tsc` 编译（`npm run compile`）
  2. 运行全部测试套件（`npm test`），确保 320 个用例全部通过
  3. 修复编译错误和测试失败（含 C1 的排序修复）
- **预期产出**:
  - `out/` 目录更新
  - 测试报告：320/320 全部通过

---

### 任务组 D：语义搜索快速原型（优先级 P1）

#### D1. ChromaDB + sentence-transformers 原型验证
- **优先级**: P1 🟡
- **负责模块**: 预研 / `packages/memory-engine/` 新增原型代码
- **PRD 依据**: §5.2 Pro 版 — 语义搜索（基于向量数据库的高级搜索）
- **任务描述**:
  1. 在 `memory-engine` 中创建临时原型脚本 `scripts/semantic_search_prototype.py`
  2. 安装依赖：`pip install chromadb sentence-transformers`
  3. 使用 `all-MiniLM-L6-v2` 模型生成 100 条模拟记忆片段的嵌入向量
  4. 在 ChromaDB 内存集合中构建索引，执行以下查询并记录：
     - 中文查询："用户登录相关的讨论" → 记录 Top-5 结果与查询延迟
     - 英文查询："authentication and OAuth decisions" → 记录 Top-5 结果与查询延迟
     - 混合查询："Python 项目的认证方案" → 记录 Top-5 结果与查询延迟
  5. 验证跨语言语义匹配效果（中文查询能否召回英文记忆，反之亦然）
  6. 记录磁盘占用：100 条记忆对应的 ChromaDB 持久化目录大小
  7. 输出原型验证报告到 `docs/research/semantic-search-prototype-2026-07-13.md`
- **预期产出**:
  - `docs/research/semantic-search-prototype-2026-07-13.md`（原型验证报告，含查询延迟、Top-5 准确率、磁盘占用、跨语言效果评估）
  - 若原型验证成功，给出 `memory-engine` 正式集成方案（新增模块、API 端点、依赖清单）
  - 若原型验证发现严重问题（如跨语言效果差、延迟过高），给出替代方案建议

---

### 任务组 E：Phase 3 功能演示与文档（优先级 P2）

#### E1. Phase 3 功能演示文档与截图
- **优先级**: P2 🟢
- **负责模块**: `docs/demo/` 或 `reports/`
- **任务描述**:
  1. 在 Extension Host 中截取关键功能截图（若 A1 验证时发现问题已修复）：
     - Onboarding 向导（5 步问卷填写过程）
     - 状态栏激活提示（🧠 身份 + 项目 + 风格）
     - 开始对话后的记忆注入 Prompt（自动注入效果）
     - 智能推荐弹窗（💡 相关记忆提示）
     - 记忆编辑器（可视化编辑面板）
     - 版本控制（备份列表 + JSON 预览 + 回滚按钮）
     - 模板选择（8 个内置模板 QuickPick）
     - 模板导入/导出（`.remember-template.json` 文件示例）
  2. 编写 `docs/PHASE3_DEMO.md`：
     - Phase 3 功能总览表（6 项增强功能 + 状态）
     - 核心交互流程图（Mermaid：从安装到第一次对话的完整链路）
     - 每项功能的 1 分钟上手说明（含命令面板快捷键）
     - 已知限制与 Roadmap（Phase 4 展望）
  3. 若时间允许，整理关键交互文字描述（为后续 GIF 录制做准备）
- **预期产出**:
  - `docs/PHASE3_DEMO.md`（演示文档，含截图占位符或实际图片）
  - `docs/demo/screenshots/` 目录（8 张以上截图，按功能命名）

#### E2. README 更新准备（Phase 3 功能同步）
- **优先级**: P2 🟢
- **负责模块**: `README.md`
- **任务描述**:
  1. 将 README 中 Phase 3 路线图的状态从 `[ ]` 更新为 `[x]`（已完成功能）
  2. 在 README 中新增「Phase 3 智能增强」功能简介段落（2-3 句话概括模板系统、风格检查、智能推荐、版本控制）
  3. 更新「支持的 AI 提供商」表格，确认 6 个提供商全部列出且描述准确
- **预期产出**:
  - `README.md` 更新（路线图状态更新 + Phase 3 功能简介段落）

---

### 任务组 F：迭代报告（优先级 P1）

#### F1. 迭代报告撰写
- **优先级**: P1 🟡
- **负责模块**: `reports/`
- **任务描述**:
  1. 编写 `reports/iteration-2026-07-13.md`（迭代总结报告）
  2. 编写 `reports/daily-2026-07-13.md`（日报精简版）
  3. 记录内容：新增功能、修复问题、E2E 验证结果、代码统计、测试报告、原型验证结论
- **预期产出**:
  - `reports/iteration-2026-07-13.md`
  - `reports/daily-2026-07-13.md`
  - `reports/daily-2026-07-13-detailed.md`（详细版）

---

## 四、任务优先级矩阵

```
           紧急程度
           高 ←————————→ 低
           ┌─────────┬─────────┐
     高   │  A1  B1 │   C1    │
重        │ (P0)    │  (P1)   │
要        │         │   D1    │
性        │         │  (P1)   │
          ├─────────┼─────────┤
     低   │   C2    │   E1    │
          │  (P1)   │  (P2)   │
          │   F1    │   E2    │
          │  (P1)   │  (P2)   │
          └─────────┴─────────┘
```

---

## 五、执行顺序建议

```
02:00 ─┬─ 启动开发环境，确认 git 分支干净，回顾 07-12 日报
       │
02:10 ─┬─ 【B1】Python 服务启动与实机调用验证
       │    └─ 启动 memory-engine server，验证 health/extract/search 端点
       │    └─ 确认 EngineClient 字段映射正确，记录到 e2e-engine-*.md
       │
02:50 ─┬─ 【A1】Extension Host 实机调试（上）
       │    └─ 核心链路：激活 → Onboarding → 开始对话 → 切换项目 → 搜索记忆
       │
03:50 ─┬─ 【A1】Extension Host 实机调试（下）
       │    └─ 核心链路：对话历史 → 记忆编辑器 → 版本控制 → 模板选择/导入/导出/应用
       │    └─ 边缘场景：无网络降级、未设置画像引导、快速连点、重启恢复
       │    └─ 记录问题到 e2e-issues-*.md
       │
04:50 ─┬─ 【C1】修复 ProjectManager.list 排序测试失败
       │    └─ 增加排序稳定性（二级排序键：createdAt → name）
       │    └─ 运行 npm test 确认 320/320 通过
       │
05:10 ─┬─ 【C2】编译与测试回归
       │    └─ tsc + npm test，确保全绿
       │
05:30 ─┬─ 【D1】语义搜索快速原型
       │    └─ ChromaDB + all-MiniLM-L6-v2 安装、100 条模拟记忆、查询验证
       │    └─ 记录延迟、准确率、跨语言效果、磁盘占用
       │
06:30 ─┬─ 【E1/E2】Phase 3 演示文档与 README 更新（如时间允许）
       │    └─ 截图 + 流程图 + 使用说明 + README 状态更新
       │
07:10 ─┬─ 【F1】迭代报告撰写
       │    └─ iteration-*.md + daily-*.md + daily-*-detailed.md
       │
07:40 ── 迭代结束，提交代码，提交前最终检查（git diff + test）
```

---

## 六、验收标准

| 检查项 | 标准 | 验证方式 |
|--------|------|----------|
| A1 实机调试 | 20 个命令的核心链路交互全部通过，记录在 `e2e-issues-2026-07-13.md` | Extension Host F5 |
| B1 引擎验证 | Python 服务启动后，插件日志显示「memory-engine 服务已连接」；extract/search 返回非空数组且字段映射正确 | 手动测试 + 日志审查 |
| C1 排序修复 | `npm test` 中 `ProjectManager.list 应按更新时间倒序返回项目` 通过 | 单元测试 |
| C2 回归 | `npm run compile` 0 错误 0 警告；`npm test` 320/320 全部通过 | 命令行 |
| D1 原型 | 技术报告包含查询延迟、Top-5 准确率、磁盘占用、跨语言效果评估 | 文档审查 |
| E1 演示文档 | `PHASE3_DEMO.md` 包含功能总览、流程图、截图、上手说明 | 文档审查 |
| E2 README | Phase 3 路线图状态更新为 `[x]`，新增功能简介段落 | 文档审查 |
| F1 迭代报告 | 3 份报告完整记录迭代过程、问题、结论、后续计划 | 文档审查 |

---

## 七、风险与应对

| 风险 | 可能性 | 影响 | 应对 |
|------|--------|------|------|
| Extension Host 调试发现大量交互问题 | 中 | A1 耗时超预期，挤压后续任务 | 优先记录问题而非当场修复；将非阻塞性问题移入 backlog；P2 任务（E1/E2）可延后 |
| Python 服务端口冲突或环境缺失 | 低 | B1 验证失败 | 检查 Python 3.11+ 和 `memory-engine` 包安装；端口冲突时改用 `--port 8766`；EngineClient 已支持端口配置 |
| ChromaDB 安装失败（Windows 编译问题） | 中 | D1 原型验证受阻 | 降级方案：使用纯 Python 的 `chromadb-client` + 远程 ChromaDB；或改用纯 NumPy 的向量相似度计算作为临时原型 |
| `ProjectManager.list` 修复后引入新的排序问题 | 低 | C1/C2 阻塞 | 增加更多边界测试用例（如 3 个相同时间戳项目），确保排序稳定 |
| tsc 编译出现类型错误 | 低 | C2 阻塞 | 预留 20 分钟缓冲时间专门修编译问题；当前代码库 0 错误 0 警告，风险低 |

---

## 八、相关文档与代码入口

- **PRD 需求**: `docs/PRD.md`（§5.2 模板市场、§4.3 记忆更新、§7 里程碑规划）
- **架构文档**: `docs/ARCHITECTURE.md`（UI 层、存储层、数据流、AI 适配层）
- **类型定义**: `packages/vscode-extension/src/types.ts`
- **插件入口**: `packages/vscode-extension/src/extension.ts`（751 行，23 个命令注册）
- **EngineClient**: `packages/vscode-extension/src/utils/engineClient.ts`（196 行，已修复 API 契约）
- **Python HTTP 服务**: `packages/memory-engine/src/memory_engine/server.py`（端点定义）
- **ProjectManager**: `packages/vscode-extension/src/memory/project.ts`（382 行，待修复排序）
- **智能推荐**: `packages/vscode-extension/src/memory/recommender.ts`（444 行，已完成功能）
- **语义搜索预研**: `docs/research/semantic-search-2026-07-12.md`（ChromaDB vs FAISS 对比）
- **07-12 日报**: `reports/daily-2026-07-12.md`
- **07-12 详细报告**: `reports/daily-2026-07-12-detailed.md`
- **07-12 迭代计划**: `plan/iteration-2026-07-12.md`

---

**计划版本**: v1.0  
**编制者**: 迭代计划系统  
**最后更新**: 2026-07-12 20:00 CST

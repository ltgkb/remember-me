# Remember Me — 开发迭代计划

**迭代日期**: 2026-07-12（凌晨 02:00 启动）  
**计划编制时间**: 2026-07-11 20:00  
**迭代类型**: Phase 3 实机验证收尾 + Phase 4 预研启动  
**预估工时**: 5~6 小时（单轮迭代）  

---

## 一、当前进度总览

### 1.1 已完成模块（截至 2026-07-11 20:00）

| 阶段 | 模块 | 状态 | 代码位置 |
|------|------|------|----------|
| Phase 1 MVP | VS Code 插件脚手架 | ✅ 完成 | `package.json`, `tsconfig.json` |
| Phase 1 MVP | 核心类型定义 | ✅ 完成 | `src/types.ts` |
| Phase 1 MVP | JSON 存储层 + 自动备份 | ✅ 完成 | `src/memory/storage.ts` |
| Phase 1 MVP | 用户画像管理 | ✅ 完成 | `src/memory/profile.ts` |
| Phase 1 MVP | 项目上下文管理 | ✅ 完成 | `src/memory/project.ts` |
| Phase 1 MVP | 对话历史管理 | ✅ 完成 | `src/memory/conversation.ts` |
| Phase 1 MVP | AI 适配层（6 提供商） | ✅ 完成 | `src/ai/` (8 个文件) |
| Phase 1 MVP | Provider 工厂 + 单例管理 | ✅ 完成 | `src/ai/provider.ts` |
| Phase 1 MVP | 状态栏管理 | ✅ 完成 | `src/ui/statusBar.ts` |
| Phase 1 MVP | 侧边栏 TreeDataProvider | ✅ 完成 | `src/ui/sidebarProvider.ts` |
| Phase 1 MVP | Webview 基础抽象 | ✅ 完成 | `src/ui/webview/baseWebview.ts` |
| Phase 1 MVP | 首次使用向导 | ✅ 完成 | `src/ui/webview/onboarding.ts` |
| Phase 1 MVP | 设置面板 | ✅ 完成 | `src/ui/webview/settingsPanel.ts` |
| Phase 1 MVP | 记忆编辑器 | ✅ 完成 | `src/ui/webview/memoryEditor.ts` |
| Phase 1 MVP | 插件入口（20 命令） | ✅ 完成 | `src/extension.ts` (751 行) |
| Phase 1 MVP | 记忆注入 Prompt 构建器 | ✅ 完成 | `src/utils/promptBuilder.ts` |
| Phase 2 核心 | 手动搜索记忆 | ✅ 完成 | `extension.ts::searchInStorage()` |
| Phase 2 核心 | 多项目切换 | ✅ 完成 | `extension.ts::switchProject` |
| Phase 2 核心 | 对话历史视图 | ✅ 完成 | `src/ui/webview/conversationHistory.ts` |
| Phase 2 核心 | 记忆更新确认机制 | ✅ 完成 | `src/memory/updateDetector.ts` |
| Phase 2 核心 | 关键信息自动提取 | ✅ 完成 | `src/memory/extractor.ts` |
| Phase 3 增强 | 模板系统（8 场景） | ✅ 完成 | `src/template/` (4 个文件) |
| Phase 3 增强 | 风格一致性检查 | ✅ 完成 | `src/utils/styleChecker.ts` |
| Phase 3 增强 | 智能推荐记忆（内容感知） | ✅ 完成 | `src/memory/recommender.ts` |
| Phase 3 增强 | 记忆版本控制 UI | ✅ 完成 | `src/ui/webview/versionControl.ts` |
| Phase 3 增强 | 搜索索引优化 + 持久化 | ✅ 完成 | `src/utils/searchIndex.ts` |
| Phase 3 增强 | 社区模板市场 MVP | ✅ 完成 | `src/template/manager.ts` |
| Phase 3 增强 | EngineClient 集成 | ✅ 完成 | `src/utils/engineClient.ts` |
| 全局 | 日志系统 | ✅ 完成 | `src/utils/logger.ts` |
| 全局 | 测试套件 | ✅ 完成 | 316 个用例，全通 |
| 全局 | memory-engine Python 包 | ✅ 完成 | `packages/memory-engine/` (5 个文件) |
| 全局 | 项目文档 | ✅ 完成 | `docs/`, `README.md` |

### 1.2 待办事项清单（按 PRD 里程碑）

#### Phase 3：智能增强（剩余项）

| 需求 | PRD 章节 | 当前状态 | 阻塞影响 |
|------|----------|----------|----------|
| **语义搜索** | §5.2 Pro | ❌ 未实现 | **低** — Phase 4 功能，依赖向量数据库，本次迭代启动预研 |

#### 技术债务与已知问题（新增发现）

| 问题 | 影响 | 优先级 |
|------|------|--------|
| **EngineClient `extract()` 解析响应格式错误** | `server.py` 返回 `{ count, results, insights }` 对象，但 `engineClient.ts` 按 `ExtractedInfo[]` 数组解析，导致永远返回空数组 | **P0** |
| **EngineClient `search()` 解析响应格式错误** | `server.py` 返回 `{ keyword, matches }` 对象，但 `engineClient.ts` 按 `SearchResult[]` 数组解析；且字段名不匹配（`file` vs `path`, `snippet` vs `content`） | **P0** |
| **未在 Extension Host 中做端到端验证** | 20 个命令的实机交互未经验证 | **P0** |
| 多语言停用词缺失 | `MemoryRecommender` 仅含中文停用词，英文关键词提取精度低 | **P1** |
| 语义搜索未预研 | Phase 4 功能，需调研向量数据库方案 | **P1** |

---

## 二、本次迭代目标

> **目标**：完成 Phase 3 全部功能的实机验证与工程收尾，修复 EngineClient 与 Python 服务的 API 契约不匹配问题，启动 Phase 4 语义搜索技术预研，为后续商业化功能奠定基础。

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
     - [ ] 首次使用引导：删除 `~/.remember-me/profile.json` 后重启，3 秒后弹出欢迎提示
     - [ ] Onboarding 向导：5 步问卷可正常填写并保存
     - [ ] 打开设置（`rememberMe.openSettings`）：Webview 设置面板正常加载
     - [ ] 开始对话（`rememberMe.startChat`）：正确注入记忆 Prompt，状态栏显示推荐
     - [ ] 切换项目（`rememberMe.switchProject`）：项目切换后状态栏更新
     - [ ] 搜索记忆（`rememberMe.searchMemory`）：输入关键词返回结果
     - [ ] 查看对话历史（`rememberMe.viewConversationHistory`）：Webview 正常打开
     - [ ] 打开记忆编辑器（`rememberMe.openMemoryEditor`）：可查看/编辑记忆
     - [ ] 记忆版本控制（`rememberMe.openVersionControl`）：备份列表、JSON 预览、回滚
     - [ ] 选择模板（`rememberMe.selectTemplate`）：8 个内置模板可正常应用
     - [ ] 管理模板（`rememberMe.manageTemplates`）：模板列表可正常加载
     - [ ] 导出模板（`rememberMe.exportTemplate`）：生成有效的 `.remember-template.json`
     - [ ] 导入模板（`rememberMe.importTemplate`）：选择文件后成功导入
     - [ ] 预览模板（`rememberMe.previewTemplate`）：模板结构预览正常
     - [ ] 应用模板（`rememberMe.applyTemplate`）：在文档中插入模板内容
     - [ ] 更新个人画像（`rememberMe.updateProfile`）：信息修改后持久化
     - [ ] 刷新记忆（`rememberMe.refreshMemory`）：侧边栏数据刷新
     - [ ] 显示菜单/快捷菜单（`rememberMe.showMenu` / `showQuickMenu`）：菜单正常弹出
     - [ ] 忽略推荐（`rememberMe.ignoreRecommendation`）：推荐项可正确忽略
  3. **边缘场景验证**：
     - [ ] 无网络时（AI 提供商不可达）的降级提示
     - [ ] 未设置画像时点击「开始对话」的引导流程
     - [ ] 快速连续点击命令无异常
     - [ ] 关闭并重新打开 VS Code 后记忆状态正确恢复
  4. 记录所有发现的 UI/交互问题到 `reports/e2e-issues-2026-07-12.md`
- **预期产出**:
  - `reports/e2e-issues-2026-07-12.md`（问题清单，含复现步骤、截图、严重级别）
  - 发现的阻塞性问题当场修复，非阻塞性问题记录待排期

---

### 任务组 B：memory-engine 端到端验证与 API 契约修复（优先级 P0）

#### B1. 修复 EngineClient 与 server.py 的 API 契约不匹配
- **优先级**: P0 🔴
- **负责模块**: `src/utils/engineClient.ts` + `packages/memory-engine/src/memory_engine/server.py`
- **任务描述**:
  1. **修复 `extract()` 响应解析**：
     - 当前错误：`const result = JSON.parse(response.body) as ExtractedInfo[]` 按数组解析
     - 实际响应：`{ count: number, results: Array<{type, raw_text, suggested_title, confidence}>, insights?: Array<{...}> }`
     - 修复方案：解析为中间对象，提取 `results` 数组，并将字段 `raw_text` 映射为 `text`
  2. **修复 `search()` 响应解析**：
     - 当前错误：`const result = JSON.parse(response.body) as SearchResult[]` 按数组解析
     - 实际响应：`{ keyword, search_root, files_scanned, match_count, matches: Array<{file, line, snippet}> }`
     - 修复方案：解析为中间对象，提取 `matches` 数组，并将字段 `file` → `path`, `snippet` → `content`
  3. **更新 `ExtractedInfo` 接口**（如需）：确认 `type` / `confidence` 字段名是否与服务端一致，若不一致一并映射
  4. **更新测试**：修改 `src/test/suite/engineClient.test.ts` 中的 mock 数据，使其符合实际服务端响应格式
- **预期产出**:
  - 修改 `src/utils/engineClient.ts`（~30 行，修复响应解析与字段映射）
  - 修改 `src/test/suite/engineClient.test.ts`（~20 行，mock 数据对齐）
  - 编译通过：`npm run compile` 0 错误 0 警告

#### B2. Python 服务启动与实机调用验证
- **优先级**: P0 🔴
- **负责模块**: `packages/memory-engine/` + `src/utils/engineClient.ts`
- **任务描述**:
  1. 在独立终端中启动 `python -m memory_engine.server --port 8765`
  2. 在 Extension Host 中触发 `rememberMe.startChat`，观察日志中 EngineClient 是否成功连接
  3. 手动验证各端点：
     - `GET /health` → 返回 `{"status":"ok"}`，插件日志显示「memory-engine 服务已连接」
     - `POST /extract` → 输入中文文本，确认返回提取结果数组
     - `POST /search` → 输入关键词，确认返回匹配片段
  4. 验证 EngineClient 超时与降级：在不启动 Python 服务时，确认插件正常启动且不报错
- **预期产出**:
  - `reports/e2e-engine-2026-07-12.md`（验证记录，含端点调用结果、响应时间、问题记录）
  - 确认 `engineClient.healthCheck()` 在 Python 服务可用时返回 `true`，不可用时返回 `false`

---

### 任务组 C：多语言停用词补充（优先级 P1）

#### C1. MemoryRecommender 英文停用词扩展
- **优先级**: P1 🟡
- **负责模块**: `src/memory/recommender.ts`
- **任务描述**:
  1. 在现有 `STOP_WORDS`（中文停用词）基础上，新增 `ENGLISH_STOP_WORDS` 集合，覆盖常见英文停用词：
     - 基础冠词/代词：a, an, the, this, that, these, those, i, me, my, mine, you, your, he, him, his, she, her, it, its, we, us, our, they, them, their
     - 常用动词/助动词：am, is, are, was, were, be, been, being, have, has, had, do, does, did, will, would, shall, should, can, could, may, might, must
     - 常见介词/连词：in, on, at, to, for, of, with, by, from, up, about, into, through, during, before, after, above, below, between, and, or, but, so, if, because, until, while
     - 常见副词/限定词：not, no, nor, only, own, same, so, than, too, very, just, now, then, here, there, when, where, why, how, all, any, both, each, few, more, most, other, some, such, only
  2. 修改 `extractKeywords` 方法：在英文/数字分支中，同时检查 `ENGLISH_STOP_WORDS`
  3. 新增单元测试：验证英文文本的关键词提取不再包含停用词
  4. 验证混合中英文场景（如 "我们使用 Python 进行开发"）的关键词提取正确性
- **预期产出**:
  - 修改 `src/memory/recommender.ts`（~40 行新增英文停用词 + 3 行逻辑修改）
  - 新增/修改 `src/test/suite/recommender.test.ts`（~6 个用例：英文停用词过滤、混合中英文、纯英文场景）
  - 编译与测试通过

---

### 任务组 D：语义搜索预研（优先级 P1）

#### D1. 向量数据库集成可行性调研
- **优先级**: P1 🟡
- **负责模块**: 预研 / 技术选型报告
- **PRD 依据**: §5.2 Pro 版 — 语义搜索（基于向量数据库的高级搜索）
- **任务描述**:
  1. **调研候选方案**（至少对比 2 个）：
     - **ChromaDB**：轻量、嵌入友好、Python/JS 双端 SDK、支持持久化
     - **FAISS (Facebook)**：纯 C++ 核心 + Python 绑定、高性能、无外部依赖、仅内存索引（可序列化）
  2. **评估维度**：
     | 维度 | 权重 | 评估标准 |
     |------|------|----------|
     | 安装复杂度 | 高 | 是否需额外编译 / Docker / 外部服务 |
     | 存储体积 | 高 | 嵌入向量 + 元数据对本地磁盘占用 |
     | 查询性能 | 中 | 1,000 / 10,000 / 100,000 条记忆时的延迟 |
     | 跨语言支持 | 高 | 中文、英文、混合文本的语义相似度效果 |
     | VS Code 插件集成 | 高 | 能否通过 Node.js 直接调用，或需子进程 / HTTP 封装 |
     | 许可协议 | 中 | 开源协议是否兼容 MIT |
  3. **快速原型验证**（可选，若时间允许）：
     - 使用 `sentence-transformers` 或 `all-MiniLM-L6-v2` 生成 100 条模拟记忆的嵌入向量
     - 在 ChromaDB 或 FAISS 中构建索引并执行语义搜索
     - 记录查询延迟与 Top-5 准确率
  4. 输出技术选型报告：`docs/research/semantic-search-2026-07-12.md`
- **预期产出**:
  - `docs/research/semantic-search-2026-07-12.md`（技术选型报告，含对比矩阵、推荐方案、集成路线图）
  - 若完成原型验证，附带 `docs/research/semantic-search-prototype/` 目录（脚本 + 结果）

---

### 任务组 E：Phase 3 功能演示文档（优先级 P2）

#### E1. 演示文档与截图准备
- **优先级**: P2 🟢
- **负责模块**: `docs/demo/` 或 `reports/`
- **任务描述**:
  1. 在 Extension Host 中截取关键功能截图：
     - Onboarding 向导（5 步问卷填写过程）
     - 状态栏激活提示（🧠 身份 + 项目 + 风格）
     - 开始对话后的记忆注入 Prompt（自动注入效果）
     - 智能推荐弹窗（💡 相关记忆提示）
     - 记忆编辑器（可视化编辑面板）
     - 版本控制（备份列表 + JSON 预览 + 回滚按钮）
     - 模板选择（8 个内置模板 QuickPick）
     - 模板导入/导出（`.remember-template.json` 文件示例）
  2. 编写 `docs/PHASE3_DEMO.md`：
     - 功能总览表（Phase 3 全部 6 项增强功能）
     - 核心交互流程图（PlantUML 或 Mermaid）
     - 每项功能的 1 分钟上手说明
  3. 若时间允许，录制 GIF 动图（关键交互：模板应用、记忆更新确认、风格检查）
- **预期产出**:
  - `docs/PHASE3_DEMO.md`（演示文档，含截图占位符或实际图片）
  - `docs/demo/screenshots/` 目录（8 张以上截图）
  - 为后续 GitHub README 更新和社交媒体宣发准备素材

---

### 任务组 F：工程保障（优先级 P1）

#### F1. 编译与测试回归
- **优先级**: P1 🟡
- **负责模块**: 全局
- **任务描述**:
  1. 所有新增/修改文件通过 `tsc` 编译（`npm run compile`）
  2. 运行全部测试套件（`npm test`），新增用例全部通过
  3. 修复编译错误和测试失败
- **预期产出**:
  - `out/` 目录更新
  - 测试报告：全部通过（目标 322+ 用例）

#### F2. 迭代报告撰写
- **优先级**: P1 🟡
- **负责模块**: `reports/`
- **任务描述**:
  1. 编写 `reports/iteration-2026-07-12.md`
  2. 编写 `reports/daily-2026-07-12.md`
  3. 记录新增功能、修复问题、E2E 验证结果、代码统计、测试报告
- **预期产出**:
  - `reports/iteration-2026-07-12.md`
  - `reports/daily-2026-07-12.md`
  - `reports/e2e-issues-2026-07-12.md`（如 A1 发现问题）
  - `reports/e2e-engine-2026-07-12.md`（如 B2 验证记录）

---

## 四、任务优先级矩阵

```
           紧急程度
           高 ←————————→ 低
           ┌─────────┬─────────┐
     高   │ A1  A2  │   B1    │
重        │ (P0)    │  (P0)   │
要        │   B2    │         │
性        │  (P0)   │         │
          ├─────────┼─────────┤
     低   │   C1    │   D1    │
          │  (P1)   │  (P1)   │
          │   E1    │         │
          │  (P2)   │         │
          └─────────┴─────────┘
              F1 横跨所有象限（贯穿迭代始终）
              F2 在迭代末尾执行
```

---

## 五、执行顺序建议

```
02:00 ─┬─ 启动开发环境，确认 git 分支干净
       │
02:10 ─┬─ 【B1】修复 EngineClient API 契约不匹配
       │    └─ 修改 extract/search 响应解析与字段映射，编译验证
       │
02:40 ─┬─ 【B2】Python 服务启动与实机调用验证
       │    └─ 启动 memory-engine server，验证 health/extract/search 端点
       │
03:10 ─┬─ 【A1】Extension Host 实机调试（上）
       │    └─ 核心链路验证：激活 → Onboarding → 开始对话 → 切换项目 → 搜索记忆
       │
04:10 ─┬─ 【A1】Extension Host 实机调试（下）
       │    └─ 核心链路验证：对话历史 → 记忆编辑器 → 版本控制 → 模板选择/导入/导出
       │
05:10 ─┬─ 【C1】多语言停用词补充
       │    └─ 扩展英文停用词，更新测试用例
       │
05:40 ─┬─ 【D1】语义搜索预研
       │    └─ ChromaDB vs FAISS 对比，输出技术选型报告
       │
06:40 ─┬─ 【E1】Phase 3 功能演示文档（如时间允许，可延后至下次迭代）
       │    └─ 截图 + 流程图 + 上手说明
       │
07:10 ─┬─ 【F1】编译与测试回归
       │    └─ tsc + npm test，修复问题
       │
07:40 ─┬─ 【F2】迭代报告撰写
       │
08:00 ── 迭代结束，提交代码
```

---

## 六、验收标准

| 检查项 | 标准 | 验证方式 |
|--------|------|----------|
| A1 实机调试 | 20 个命令的核心链路交互全部通过，记录在 `e2e-issues-*.md` | Extension Host F5 |
| B1 API 修复 | `engineClient.extract()` 正确解析 `results` 数组并映射 `raw_text`→`text` | 单元测试 + 实机调用 |
| B1 API 修复 | `engineClient.search()` 正确解析 `matches` 数组并映射 `file`→`path`, `snippet`→`content` | 单元测试 + 实机调用 |
| B2 服务验证 | Python 服务启动后，插件日志显示「memory-engine 服务已连接」；extract/search 返回非空数组 | 手动测试 + 日志审查 |
| C1 停用词 | 英文文本（如 "This is a test document about user login"）提取的关键词不含 "this", "is", "a", "about" | 单元测试 |
| C1 混合场景 | 中英文混合文本提取结果准确，无跨语言污染 | 单元测试 |
| D1 预研 | 技术选型报告包含至少 2 种方案对比、推荐结论、集成路线图 | 文档审查 |
| E1 演示文档 | `PHASE3_DEMO.md` 包含功能总览、流程图、截图、上手说明 | 文档审查 |
| F1 编译 | `npm run compile` 0 错误 0 警告 | 命令行 |
| F1 测试 | `npm test` 全部通过 | 命令行 |

---

## 七、风险与应对

| 风险 | 可能性 | 影响 | 应对 |
|------|--------|------|------|
| Extension Host 调试发现大量交互问题 | 中 | A1 耗时超预期，挤压后续任务 | 优先记录问题而非当场修复；将非阻塞性问题移入 backlog；P2 任务（E1）可延后 |
| EngineClient 字段映射修复后仍有服务端兼容性问题 | 低 | B1/B2 阻塞 | 预留 30 分钟缓冲时间；若发现问题，同步修改 `server.py` 或 `engineClient.ts` 的契约定义 |
| Python 服务端口冲突或环境缺失 | 低 | B2 验证失败 | 检查 Python 3.11+ 和 `memory-engine` 包安装；端口冲突时改用 `--port 8766` |
| 语义搜索预调研耗时超预期 | 中 | D1 挤压 E1 时间 | E1 为 P2 任务，可延后至下次迭代；D1 至少完成书面对比报告即可 |
| tsc 编译出现类型错误 | 中 | F1 阻塞 | 预留 30 分钟缓冲时间专门修编译问题 |

---

## 八、相关文档与代码入口

- **PRD 需求**: `docs/PRD.md`（§5.2 模板市场、§4.3 记忆更新、§7 里程碑规划）
- **架构文档**: `docs/ARCHITECTURE.md`（UI 层、存储层、数据流）
- **类型定义**: `packages/vscode-extension/src/types.ts`
- **插件入口**: `packages/vscode-extension/src/extension.ts`（751 行，23 个命令注册）
- **EngineClient**: `packages/vscode-extension/src/utils/engineClient.ts`（需修复响应解析）
- **Python HTTP 服务**: `packages/memory-engine/src/memory_engine/server.py`（端点定义）
- **智能推荐**: `packages/vscode-extension/src/memory/recommender.ts`（需补充英文停用词）
- **昨日日报**: `reports/daily-2026-07-11.md`
- **昨日迭代报告**: `reports/iteration-2026-07-11.md`
- **昨日详细报告**: `reports/daily-2026-07-11-detailed.md`

---

**计划版本**: v1.0  
**编制者**: 迭代计划系统  
**最后更新**: 2026-07-11 20:00

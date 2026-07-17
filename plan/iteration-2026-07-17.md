# Remember Me — 开发迭代计划

**迭代日期**: 2026-07-17（凌晨 02:00 启动）  
**计划编制时间**: 2026-07-16 20:00  
**迭代类型**: Phase 4.1 闭环验证 + v0.3.0 产品发布  
**预估工时**: 6~7 小时（单轮迭代）  

---

## 一、当前进度总览（截至 2026-07-16 20:00）

### 1.1 已完成模块

| 阶段 | 模块 | 状态 | 关键交付物 |
|------|------|------|------------|
| Phase 1 MVP | 插件脚手架、JSON 存储、画像/项目/对话管理、6×AI 提供商、23 命令、首次使用向导 | ✅ 完成 | E2E 验证 20/20 通过 |
| Phase 2 核心 | 手动搜索、多项目切换、对话历史视图、记忆更新确认、关键信息提取 | ✅ 完成 | E2E 验证 20/20 通过 |
| Phase 3 增强 | 模板系统（8 场景）、风格一致性检查、智能推荐、版本控制 UI、搜索索引优化、社区模板市场、EngineClient 集成 | ✅ 完成 | E2E 验证 + 4 边缘场景通过 |
| Phase 4.1 语义搜索 | `vector_index.py`、语义搜索端点、混合搜索端点、模型预加载机制（代码层面）、EngineClient 语义方法、VS Code 搜索 UI 三模式切换、状态栏搜索模式显示 | 🟡 代码就绪，待验证 | `server.py` / `engineClient.ts` / `extension.ts` 已含实现 |
| 预研 | bge-m3 模型选型对比 | ✅ 完成 | `docs/research/model-benchmark-2026-07-16.md` |
| 预研 | 云端同步架构设计 | ✅ 完成 | `docs/design/cloud-sync-architecture-2026-07-16.md` |
| 工程配置 | `.github/workflows/ci.yml` 双环境矩阵 | 🟡 已创建，未触发 | 待首次运行验证 |
| 文档 | CHANGELOG v0.3.0、PHASE3_DEMO.md、README 更新、社交媒体宣发素材 | ✅ 完成 | `docs/demo/social-media-2026-07-15.md` |

### 1.2 待办事项与已知问题

| 需求 | 来源 | 当前状态 | 阻塞影响 |
|------|------|----------|----------|
| **CI 首次运行验证** | 工程最佳实践 | ⏳ 待触发 | **P0** — CI 已配置但从未实际运行，可能隐藏 Windows + chromadb 兼容性问题 |
| **模型预加载端到端验证** | A2 代码已写 | ⏳ 待验证 | **P0** — `server.py` 已含后台线程预加载逻辑，`extension.ts` 已含轮询逻辑，但首次查询延迟 <200ms 尚未实测确认 |
| **混合搜索端到端验证** | B2 代码已写 | ⏳ 待验证 | **P1** — `/hybrid-search` 端点、RRF 融合算法、`engineClient.ts` 方法均已实现，但 RRF 排序合理性与退化路径尚未实测确认 |
| **代码债务：混合搜索内联重复** | 代码审查 | ⏳ 待重构 | **P1** — `_handle_hybrid_search` 中内联了完整的关键词搜索逻辑（~50 行），与 `_handle_search` 重复，应提取为共享方法 |
| **社交媒体宣发执行** | 运营计划 | ⏳ 待执行 | **P2** — 素材已准备，需在 v0.3.0 发布窗口期内完成 |
| **GitHub Release v0.3.0** | 产品发布 | ⏳ 待创建 | **P2** — 需打 tag、写 release notes、开启反馈讨论区 |
| **npm test 全量回归** | 质量保证 | ⏳ 待执行 | **P0** — 新增 hybrid 相关代码后，333 项测试是否仍全绿未知 |

---

## 二、本次迭代目标

> **目标**：验证并闭环 Phase 4.1 已开发代码（模型预加载 + 混合搜索），消除工程债务，触发 CI 并修复环境矩阵问题，完成 v0.3.0 产品发布（社交媒体宣发 + GitHub Release）。将 Phase 4.1 从"代码就绪"推进到"发布就绪"。

---

## 三、开发任务明细

### 任务组 A：验证与闭环已有代码（优先级 P0）

#### A1. 语义搜索模型预加载端到端验证与调优
- **优先级**: P0 🔴
- **负责模块**: `packages/memory-engine/src/memory_engine/server.py` + `vector_index.py` + VS Code 扩展启动流程
- **任务描述**:
  1. 本地启动 `python -m memory_engine.server --port 8765`，观察 stderr 日志确认后台预加载线程启动（应有 `[preload]` 或模型加载耗时日志）
  2. 服务启动后立即 `GET /health`，确认 `semantic_ready: false`
  3. 等待 5~10 秒后再次 `GET /health`，确认 `semantic_ready: true` 且 `model_loaded` 非 "unknown"
  4. 在 `semantic_ready=true` 后首次执行 `POST /semantic-search`，记录 latency_ms，目标 **< 200ms**
  5. 若延迟仍 > 200ms，排查原因：
     - 若后台线程未实际触发加载 → 检查 `time.sleep(2)` 延迟 + `get_vector_index(force=True)` 调用链
     - 若模型已加载但查询仍慢 → 检查 ChromaDB collection 查询耗时，考虑增加 `collection.query` 的 `n_results` 上限或 HNSW 参数调优
  6. 在 VS Code 扩展中测试启动流程：观察状态栏是否从 "🧠 语义模型预热中…" 过渡到正常显示
  7. 若 VS Code 端轮询逻辑有 bug（如 interval 未清除导致内存泄漏），修复
- **预期产出**:
  - 实测首次语义查询延迟数据（目标 < 200ms）
  - `server.py` / `vector_index.py` 调优补丁（如有）
  - `extension.ts` 轮询逻辑 bug 修复（如有）

#### A2. 混合搜索端到端验证与代码重构
- **优先级**: P0 🔴
- **负责模块**: `packages/memory-engine/src/memory_engine/server.py` + `engineClient.ts` + `test_endpoints.py`
- **任务描述**:
  1. 本地启动服务，执行 `python scripts/test_endpoints.py`，确认 `test_hybrid_search()` 和 `test_hybrid_search_degrades_to_semantic()` 通过
  2. 若测试失败，根据日志定位：RRF 排序异常、字段缺失、或 503 降级路径错误
  3. **代码债务重构**：`_handle_hybrid_search` 中内联的关键词搜索逻辑（~50 行）与 `_handle_search` 高度重复，应提取为 `_run_keyword_search(project, keyword, max_results)` 私有方法，供 `_handle_search` 和 `_handle_hybrid_search` 共同调用
  4. 重构后重新运行 `test_endpoints.py` 全量测试，确认无回归
  5. 在 VS Code 扩展中手动测试混合搜索：触发 `rememberMe.searchMemory` → 输入查询 → 确认结果展示 `🔍🧠` 前缀与 hybrid_scores 详情
- **预期产出**:
  - `server.py` 重构：提取 `_run_keyword_search` 共享方法（消除 ~45 行重复代码）
  - `test_endpoints.py` 全量通过确认（含 2 个 hybrid 测试用例）
  - VS Code 混合搜索手动验证记录

#### A3. npm test 全量回归 + tsc 零错误检查
- **优先级**: P0 🔴
- **负责模块**: `packages/vscode-extension/`
- **任务描述**:
  1. 执行 `npm run compile`（即 `tsc -p ./`），确认 0 错误、0 警告
  2. 执行 `npm test`，确认 333/333 测试通过
  3. 若有新增测试失败（与 hybrid / semantic 相关），定位修复
  4. 若 TypeScript 编译出现与 `SearchMode` 扩展（新增 `'hybrid'`）相关的类型错误，修复
- **预期产出**:
  - `tsc` 零错误截图/日志
  - `npm test` 全绿确认

---

### 任务组 B：工程基础设施与 CI（优先级 P0）

#### B1. GitHub Actions CI 首次运行触发与修复
- **优先级**: P0 🔴
- **负责模块**: `.github/workflows/ci.yml` + 双包工程配置
- **任务描述**:
  1. 确认当前 `git status` 工作区干净，将 07-16 以来的所有变更（含本轮 A1/A2/A3 的修复）提交并推送到 `main` 分支
  2. 观察 GitHub Actions 首次运行结果，重点检查以下潜在故障点：
     - **Node.js 侧**：`npm ci` 在 `windows-latest` 下的路径兼容性、`npm test` 是否因文件句柄未释放而 flaky
     - **Python 侧**：`chromadb` 在 `windows-latest` + Python 3.11/3.12 下是否可从 wheel 安装；若编译失败，需改为 `--only-binary :all:` 或条件跳过语义搜索测试
     - **服务启动**：`python -m memory_engine.server --port 8765 &` 在 Windows `bash` shell 中的后台进程是否成功启动；`sleep 3` 是否足够覆盖模型冷启动（当前已改为后台线程预加载，`sleep 3` 可能不够，需调整为 `sleep 8`）
  3. 若 CI 失败，根据日志定位问题并修复：
     - Node 失败 → 检查 `package-lock.json` 同步状态
     - Python 依赖失败 → 在 `pyproject.toml` 中增加 `optional = ["semantic"]` 分组，CI 中改为 `pip install -e .[minimal]` + 条件安装 `chromadb`
     - 端口占用/服务未就绪 → 改为 `python -m memory_engine.server --port 8766` 随机端口或增加 `sleep 10`
  4. 持续迭代直到 CI 矩阵至少 Node.js 侧全绿；Python 侧若因 chromadb 编译问题失败，提供条件跳过补丁并记录为已知问题
- **预期产出**:
  - `.github/workflows/ci.yml` 修复补丁（如有）
  - GitHub Actions 运行日志截图（绿钩或问题记录）
  - 迭代报告中 CI 验证结论

---

### 任务组 C：产品发布与运营（优先级 P1）

#### C1. GitHub Release v0.3.0 创建
- **优先级**: P1 🔴
- **负责模块**: GitHub / 版本管理
- **任务描述**:
  1. 确认 `main` 分支处于可发布状态（CI 绿钩或已知问题已记录）
  2. 创建 Git tag `v0.3.0`：`git tag -a v0.3.0 -m "Release v0.3.0 - Phase 3 智能增强 + Phase 4.1 语义搜索 Beta"`
  3. 推送 tag：`git push origin v0.3.0`
  4. 在 GitHub 上基于该 tag 创建 Release：
     - Release Title: `v0.3.0 — 智能增强 + 语义搜索 Beta`
     - Release Notes 内容来源：`CHANGELOG.md` v0.3.0 章节，补充 highlights：
       - 🧠 语义搜索 Beta（基于 all-MiniLM-L6-v2）
       - 🔍🧠 混合搜索（关键词 + 语义 RRF 融合）
       - 📝 8 场景文档模板系统
       - 🎨 风格一致性自动检查
       - 🔄 记忆版本控制与回滚
       - 📦 社区模板市场（导入/导出）
     - 附加 `.vsix` 构建指引（供手动安装用户）
  5. 在 Release 讨论区开启反馈帖，引导用户试用语义搜索 Beta 并反馈体验
- **预期产出**:
  - GitHub tag `v0.3.0`
  - GitHub Release 页面（含 release notes）
  - Release 讨论区反馈帖链接

#### C2. 社交媒体宣发执行
- **优先级**: P1 🔴
- **负责模块**: 运营 / 文档
- **任务描述**:
  1. 使用已准备好的素材（`docs/demo/social-media-2026-07-15.md`），选择适合的平台发布：
     - **Twitter/X 中文**：推文三（极简版，≤ 280 字）+ 配图（插件截图）
     - **即刻**：推文一（功能亮点版，≤ 500 字）+ 链接到 GitHub Release
     - **小红书**：推文二（场景痛点版，800-1000 字）+ 使用场景截图
     - **Twitter/X 英文**：Single Tweet Version + Thread（5 条推）+ 链接到 Release
     - **Hacker News**：HN Style Launch Post（Show HN: Remember Me — AI Memory Manager for VS Code）
  2. 替换素材中的占位符链接为实际链接（GitHub Release、README 文档）
  3. 记录各平台发布链接到 `docs/demo/social-media-2026-07-15.md` 末尾的"发布记录"段落
  4. 在即刻和 Twitter 的发布中附带 `#RememberMe` `#VSCode` `#AI` 等标签
- **预期产出**:
  - 至少 3 个平台实际发布（Twitter/X、即刻、小红书 或 HN）
  - `docs/demo/social-media-2026-07-15.md` 更新发布记录
  - 各平台发布链接汇总

---

### 任务组 D：迭代收尾与文档（优先级 P2）

#### D1. 迭代报告撰写
- **优先级**: P2 🟡
- **负责模块**: `reports/`
- **任务描述**:
  1. 编写 `reports/iteration-2026-07-17.md`（迭代总结报告）：
     - 任务完成情况对照表（A1~A3 / B1 / C1~C2）
     - CI 验证结果、模型预加载前后延迟对比（实测数据）
     - 混合搜索 RRF 验证结论
     - 代码统计（新增文件数、修改行数、测试增量、重复代码消除行数）
  2. 编写 `reports/daily-2026-07-17.md`（日报精简版）
  3. 编写 `reports/daily-2026-07-17-detailed.md`（详细版，含决策记录、问题日志、下一步行动）
- **预期产出**:
  - `reports/iteration-2026-07-17.md`
  - `reports/daily-2026-07-17.md`
  - `reports/daily-2026-07-17-detailed.md`

#### D2. Phase 4.2 云端同步开发计划草案
- **优先级**: P2 🟡
- **负责模块**: `docs/design/`
- **任务描述**:
  1. 基于 `cloud-sync-architecture-2026-07-16.md` 架构设计，编写 Phase 4.2 开发计划草案：
     - 技术选型确认：加密库（`cryptography` vs `pycryptodome`）、HTTP 客户端（`httpx` vs `aiohttp`）
     - 里程碑拆分：4.2.1 本地加密层 → 4.2.2 同步协议客户端 → 4.2.3 云端存储适配器 → 4.2.4 用户设置面板
     - 与当前代码的集成点：`storage.ts` 中新增 `SyncStorage` 包装层、`extension.ts` 中新增同步状态栏指示器
  2. 输出文件：`docs/design/cloud-sync-roadmap-2026-07-17.md`
- **预期产出**:
  - `docs/design/cloud-sync-roadmap-2026-07-17.md`（~2000 字，含里程碑甘特图 Mermaid、依赖关系）

---

## 四、任务优先级矩阵

```
           紧急程度
           高 ←————————→ 低
           ┌─────────┬─────────┐
     高   │ A1 A2   │   C1    │
     重   │ A3 B1   │   C2    │
     要   │ (P0)    │  (P1)   │
     性   │         │         │
           │         │         │
           ├─────────┼─────────┤
     低   │   D1    │   D2    │
           │  (P2)   │  (P2)   │
           │         │         │
           └─────────┴─────────┘
```

---

## 五、执行顺序建议（时间线）

```
02:00 ─┬─ 启动开发环境，确认 git 分支干净，回顾 07-16 日报与代码变更
       │
02:10 ─┬─ 【A3】npm test 全量回归 + tsc 零错误检查
       │    └─ 这是最快发现问题的环节，优先执行
       │
02:30 ─┬─ 【A1】语义搜索模型预加载端到端验证与调优
       │    └─ 启动 Python 服务，观察日志，测试 /health 状态流转
       │    └─ 实测首次语义查询延迟，目标 < 200ms
       │    └─ VS Code 扩展启动流程手动验证
       │
03:30 ─┬─ 【A2】混合搜索端到端验证与代码重构
       │    └─ 运行 test_endpoints.py 全量测试
       │    └─ 提取 _run_keyword_search 共享方法，消除重复代码
       │    └─ 重构后全量回归测试
       │    └─ VS Code 混合搜索手动验证
       │
04:30 ─┬─ 【B1】GitHub Actions CI 首次运行触发与修复
       │    └─ 提交并推送 main 分支，观察 Actions 日志
       │    └─ 若失败，立即定位并修复（预计最多 2 轮）
       │
05:30 ─┬─ 【C1】GitHub Release v0.3.0 创建
       │    └─ 打 tag、写 release notes、开启讨论区反馈帖
       │
06:00 ─┬─ 【C2】社交媒体宣发执行
       │    └─ Twitter/X、即刻、小红书 / HN 发布
       │    └─ 记录各平台链接到社交素材文档
       │
06:30 ─┬─ 【D1】迭代报告撰写
       │    └─ iteration-2026-07-17.md + daily 报告 2 份
       │
07:00 ─┬─ 【D2】Phase 4.2 云端同步开发计划草案（如时间允许）
       │    └─ 技术选型确认、里程碑拆分、集成点设计
       │
07:30 ── 迭代结束，最终检查（git diff + 全量测试通过确认）
```

---

## 六、验收标准

| 检查项 | 标准 | 验证方式 |
|--------|------|----------|
| A1 模型预加载 | 服务启动后 /health 返回 `semantic_ready: true`（≤15s）；首次语义查询 latency_ms < 200ms | `test_endpoints.py` + 手动计时 |
| A2 混合搜索 | `test_endpoints.py` 中 2 个 hybrid 测试通过；`_handle_hybrid_search` 内联重复代码消除 | 测试运行 + `git diff --stat` |
| A3 TypeScript 编译 | `tsc -p ./` 0 错误 0 警告；`npm test` 全部通过 | 命令行 |
| B1 CI 验证 | GitHub Actions Node.js 矩阵（ubuntu + windows × 18 + 20）全绿通过；Python 矩阵至少非语义测试通过 | GitHub Actions 页面 |
| C1 Release | GitHub 上存在 `v0.3.0` tag 与 Release 页面；release notes 覆盖 Phase 3 + 4.1 highlights | GitHub 页面 |
| C2 宣发 | 至少 3 个平台实际发布，链接记录于 `docs/demo/social-media-2026-07-15.md` | 平台链接截图 |
| D1 报告 | 3 份报告文件完整，含代码统计、决策记录、问题日志 | 文档审查 |
| D2 路线图 | 文档覆盖加密库选型、同步协议客户端设计、里程碑甘特图 | 文档审查 |
| 全局回归 | `test_endpoints.py` 全量通过（6/6 测试）；Python 端点测试 0 失败 | 命令行 |

---

## 七、风险与应对

| 风险 | 可能性 | 影响 | 应对 |
|------|--------|------|------|
| CI 中 Windows + chromadb 安装持续失败 | 中 | B1 阻塞 | 将 chromadb 移入 `optional-dependencies`，CI Python 侧仅跑非语义测试；语义测试在独立 job 中条件执行 |
| 模型预加载实测延迟仍 > 200ms | 低 | A1 需深度调优 | 检查 ChromaDB HNSW 索引参数；若硬件瓶颈，放宽目标到 <500ms 并记录为已知限制 |
| 混合搜索 RRF 融合效果不如预期 | 低 | A2 需调整融合策略 | 预留备选：线性加权分数替代 RRF；但当前代码已含 RRF，先验证再决策 |
| npm test 因新增 hybrid 代码出现回归失败 | 中 | A3 阻塞 | 重点检查 `searchSettings.ts` 中 `SearchMode` 扩展为 `'hybrid'` 后，旧测试是否硬编码了 `'semantic'` 模式预期 |
| 单轮迭代 7h 超出预期 | 中 | 任务挤压 | 若 06:00 时 C1 未完成，优先保证 B1（CI）和 C1（Release），C2/D2 延后至下轮迭代 |

---

## 八、相关文档与代码入口

- **PRD 需求**: `docs/PRD.md`（§4.1 语义搜索、§4.2 云端同步、§7 Phase 4 里程碑）
- **架构文档**: `docs/ARCHITECTURE.md`
- **Phase 3 演示文档**: `docs/PHASE3_DEMO.md`
- **语义搜索原型报告**: `docs/research/semantic-search-prototype-2026-07-13.md`
- **模型选型报告**: `docs/research/model-benchmark-2026-07-16.md`
- **云端同步架构**: `docs/design/cloud-sync-architecture-2026-07-16.md`
- **社交媒体素材**: `docs/demo/social-media-2026-07-15.md`
- **CI 配置**: `.github/workflows/ci.yml`
- **插件入口**: `packages/vscode-extension/src/extension.ts`
- **EngineClient**: `packages/vscode-extension/src/utils/engineClient.ts`
- **搜索设置**: `packages/vscode-extension/src/utils/searchSettings.ts`
- **状态栏**: `packages/vscode-extension/src/ui/statusBar.ts`
- **Python HTTP 服务**: `packages/memory-engine/src/memory_engine/server.py`
- **向量索引**: `packages/memory-engine/src/memory_engine/vector_index.py`
- **端点测试**: `packages/memory-engine/scripts/test_endpoints.py`
- **07-16 日报**: `reports/daily-2026-07-16.md`
- **07-16 迭代报告**: `reports/iteration-2026-07-16.md`
- **07-16 计划**: `plan/iteration-2026-07-16.md`

---

**计划版本**: v1.0  
**编制者**: 迭代计划系统  
**最后更新**: 2026-07-16 20:00 CST

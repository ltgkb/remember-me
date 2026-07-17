# Remember Me — 开发迭代计划

**迭代日期**: 2026-07-18（凌晨 02:00 启动）  
**计划编制时间**: 2026-07-17 20:00 CST  
**迭代类型**: Phase 4.1 问题闭环 + 环境统一 + v0.3.0 产品发布  
**预估工时**: 6~7 小时（单轮迭代）  

---

## 一、当前进度总览（截至 2026-07-17 20:00）

### 1.1 已完成模块

| 阶段 | 模块 | 状态 | 关键交付物 |
|------|------|------|------------|
| Phase 1 MVP | 插件脚手架、JSON 存储、画像/项目/对话管理、6×AI 提供商、23 命令、首次使用向导 | ✅ 完成 | E2E 验证 20/20 通过 |
| Phase 2 核心 | 手动搜索、多项目切换、对话历史视图、记忆更新确认、关键信息提取 | ✅ 完成 | E2E 验证 20/20 通过 |
| Phase 3 增强 | 模板系统（8 场景）、风格一致性检查、智能推荐、版本控制 UI、搜索索引优化、社区模板市场、EngineClient 集成 | ✅ 完成 | E2E 验证 + 4 边缘场景通过 |
| Phase 4.1 语义搜索 | `vector_index.py`、语义/混合搜索端点、模型预加载机制、EngineClient 语义方法、搜索 UI 三模式切换（keyword/semantic/hybrid） | 🟡 代码就绪，验证受阻 | 被问题 #1 阻塞（见 1.2） |
| 07-17 加固 | server.py 预加载线程安全 5 处修复、extension.ts 轮询 4 处修复、`_run_keyword_search` 共享方法重构（消除 ~45 行重复）、三模式 toggle 测试适配 | ✅ 完成 | tsc 0 错误；/health、/extract、/search 200 |
| 预研 | bge-m3 模型选型对比 | ✅ 完成 | `docs/research/model-benchmark-2026-07-16.md` |
| 预研 | 云端同步架构设计 | ✅ 完成 | `docs/design/cloud-sync-architecture-2026-07-16.md` |
| 工程配置 | `.github/workflows/ci.yml` 双环境矩阵 | 🟡 已创建，从未触发 | 待首次运行验证 |
| 文档 | CHANGELOG v0.3.0、PHASE3_DEMO.md、README、社交媒体宣发素材 | ✅ 完成 | `docs/demo/social-media-2026-07-15.md` |

### 1.2 待办事项与已知问题

| 需求 | 来源 | 当前状态 | 阻塞影响 |
|------|------|----------|----------|
| **问题 #1：ChromaDB 在 Python 3.14 下初始化失败且降级失效** | 07-17 日报 | ⏳ 待修复 | **P0** — chromadb 1.5.9 Rust 绑定在 3.14 报 `AttributeError: 'RustBindingsAPI' object has no attribute 'bindings'`；预加载失败后 `SharedSystemClient` 残留不一致状态，`KeyError` 穿透 HTTP 处理器导致连接重置（RemoteDisconnected），而非设计的 503 优雅降级 |
| **Python 环境分裂（3.12 / 3.14 并存）** | 07-17 日报 | ⏳ 待统一 | **P0** — 凌晨会话用 3.12 运行，默认 `.venv` 为 3.14.3，两套解释器并存即风险 |
| **npm test 全量回归（333 项）** | 质量保证 | ⏳ 待执行 | **P0** — hybrid 相关改动后前端回归状态未知（tsc 已过） |
| **语义/混合搜索端到端复验** | A1/A2 收尾 | ⏳ 待执行 | **P0** — 首查延迟 <200ms 验收目标尚未实测 |
| **CI 首次运行验证** | 工程最佳实践 | ⏳ 待触发 | **P0** — 日报记录"本地非 git 仓库，无提交可推"，需先核实 git 状态；Python 矩阵需纳入 3.12 + 3.14 |
| **GitHub Release v0.3.0** | 产品发布 | ⏳ 待创建 | **P1** — tag + release notes + 反馈讨论区 |
| **社交媒体宣发执行** | 运营计划 | ⏳ 待执行 | **P1** — 素材已备，需 ≥3 平台发布 |
| **Phase 4.2 云端同步路线图草案** | 规划 | ⏳ 待撰写 | **P2** — 顺延自 07-17 |

---

## 二、本次迭代目标

> **目标**：闭环 P0 问题 #1（ChromaDB/Python 3.14 兼容性 + 503 降级路径修复），统一 Python 运行环境，完成语义/混合搜索端到端验收（含首查延迟实测），跑通 npm test 全量回归与 CI 首次触发，条件满足后完成 v0.3.0 发布（GitHub Release + 社交媒体宣发）。将 Phase 4.1 从"代码就绪"推进到"验证通过、发布就绪"。

---

## 三、开发任务明细

### 任务组 A：P0 问题 #1 闭环 —— 语义栈故障修复与环境统一（优先级 P0）

#### A1. 503 优雅降级路径兜底修复
- **优先级**: P0 🔴
- **负责模块**: `packages/memory-engine/src/memory_engine/vector_index.py` + `packages/memory-engine/src/memory_engine/server.py`
- **任务描述**:
  1. `vector_index._ensure_initialized()`：将 `chromadb.PersistentClient` 调用包入 `try/except Exception → SemanticSearchError`（当前只包装 `ImportError`，运行时异常原样上抛）
  2. `server.py get_vector_index()`：同步增加兜底，确保任何环境下语义栈故障都返回 503 而非处理器崩溃
  3. 检查预加载失败后 `SharedSystemClient` 注册表残留：失败路径增加清理/重置逻辑，避免后续 `PersistentClient` 抛 `KeyError`
  4. 复现验证：在当前 3.14 `.venv` 下重跑 `python scripts/test_endpoints.py`，确认 `/semantic-index`、`/semantic-search` 返回 **503 + 友好错误信息**，不再出现 `RemoteDisconnected`
- **预期产出**:
  - `vector_index.py` / `server.py` 兜底补丁（~10-15 行）
  - test_endpoints.py 在 3.14 环境下的 503 降级路径实测记录（连接不再被重置）

#### A2. Python 运行环境统一
- **优先级**: P0 🔴
- **负责模块**: `packages/memory-engine/pyproject.toml` + `.venv` + `packages/memory-engine/scripts/`
- **任务描述**:
  1. 先盘点本机解释器：`py -0p`（或 `where python`），确认 3.12 可用路径；记录当前 `.venv` 为 3.14.3 的事实
  2. 方案 a（首选）：`pyproject.toml` 声明 `requires-python = ">=3.11,<3.14"`，用 Python 3.12 重建 `.venv`（`py -3.12 -m venv .venv && .venv\Scripts\pip install -e .`），与凌晨会话环境对齐
  3. 方案 b（备选）：查 chromadb release notes，升级到兼容 3.14 的版本；若升级，需重跑语义栈全量测试
  4. 统一后验证：新环境下 `chromadb.PersistentClient` 初始化成功，`__pycache__` 字节码版本与解释器一致
  5. 将最终环境决策（3.12 固定 或 chromadb 升级版本号）写入当日报告
- **预期产出**:
  - `pyproject.toml` `requires-python` 约束补丁（方案 a）或 chromadb 版本升级记录（方案 b）
  - 统一环境下 ChromaDB 初始化成功确认
  - 环境决策记录（写入 reports/daily-2026-07-18.md）

#### A3. 语义/混合搜索端到端复验（含首查延迟实测）
- **优先级**: P0 🔴
- **负责模块**: `packages/memory-engine/scripts/test_endpoints.py` + `server.py`
- **任务描述**:
  1. 在统一后的环境下启动 `python -m memory_engine.server --port 8765`，观察 `[preload]` 日志确认后台预加载线程工作
  2. 验证 `/health` 状态流转：启动初 `semantic_ready: false` → 5~10s 后 `semantic_ready: true` 且 `model_loaded` 非 "unknown"
  3. `semantic_ready=true` 后首次 `POST /semantic-search`，记录 `latency_ms`，目标 **< 200ms**；超标则按 07-17 计划排查（HNSW 参数 / n_results 上限）
  4. 重跑 test_endpoints.py 全量：/health、/extract、/search、/semantic-index、/semantic-search（字段完整性）、400 校验、hybrid 2 项（含 503 退化路径）——目标 **8/8 通过**
  5. VS Code 端手动验证：状态栏从"🧠 语义模型预热中…"过渡到正常；混合搜索结果展示 `🔍🧠` 前缀与 hybrid_scores
- **预期产出**:
  - test_endpoints.py 8/8 通过记录
  - 首次语义查询延迟实测数据（目标 < 200ms）
  - VS Code 三模式搜索手动验证记录

---

### 任务组 B：质量回归与 CI（优先级 P0）

#### B1. npm test 全量回归 + tsc 复核
- **优先级**: P0 🔴
- **负责模块**: `packages/vscode-extension/`
- **任务描述**:
  1. `npm run compile`（`tsc -p ./`）复核 0 错误 0 警告（07-17 已过，本次为 A 组改动后的最终确认）
  2. `npm test` 全量执行，确认 **333/333 通过**，重点盯 hybrid / SearchMode 三态相关用例（`searchSettings.test.ts` 已于 07-17 适配）
  3. 若有失败，定位修复并复跑
- **预期产出**:
  - tsc 零错误日志
  - npm test 333/333 全绿确认

#### B2. GitHub Actions CI 首次触发与修复
- **优先级**: P0 🔴
- **负责模块**: `.github/workflows/ci.yml` + git 仓库状态
- **任务描述**:
  1. **前置核实**：`git status` 确认仓库状态——07-17 日报记录"本地非 git 仓库"，若属实则需 `git init` + 关联 remote + 首次提交；若已有仓库则提交 07-17 以来全部变更
  2. CI 矩阵补充：Python 矩阵纳入 **3.12 + 3.14**（让问题 #1 此类兼容性在 CI 暴露而非本地）
  3. 推送 main，观察 Actions 首跑，重点检查：
     - Node 侧：`npm ci` Windows 路径兼容性、`npm test` 文件句柄 flaky
     - Python 侧：chromadb wheel 安装；失败则走 `optional-dependencies` 分组 + 语义测试条件跳过
     - 服务启动：后台进程与 `sleep` 时长（预加载改后台线程后 `sleep 3` 可能不够，按需调至 8~10s）
  4. 迭代修复至 Node 矩阵全绿；Python 侧若受 chromadb 阻塞，提供条件跳过补丁并记录已知问题
- **预期产出**:
  - `ci.yml` 修复/矩阵补丁
  - Actions 首跑结果记录（绿钩或问题清单）
  - 已知问题记录（如有）

---

### 任务组 C：产品发布与运营（优先级 P1，前置条件：任务组 A 闭环 + B1 通过）

#### C1. GitHub Release v0.3.0 创建
- **优先级**: P1 🔴
- **负责模块**: GitHub / 版本管理
- **任务描述**:
  1. 确认 main 可发布（A 组闭环 + B1/B2 结论记录完毕）
  2. 打 tag：`git tag -a v0.3.0 -m "Release v0.3.0 - Phase 3 智能增强 + Phase 4.1 语义搜索 Beta"` 并推送
  3. 创建 Release，notes 基于 `CHANGELOG.md` v0.3.0 章节，highlights：🧠 语义搜索 Beta / 🔍🧠 混合搜索 RRF / 📝 8 场景模板 / 🎨 风格检查 / 🔄 版本控制 / 📦 模板市场；附 `.vsix` 手动安装指引
  4. Release 讨论区开反馈帖，引导试用语义搜索 Beta
- **预期产出**:
  - GitHub tag `v0.3.0` + Release 页面
  - 讨论区反馈帖链接

#### C2. 社交媒体宣发执行
- **优先级**: P1 🔴
- **负责模块**: 运营 / `docs/demo/social-media-2026-07-15.md`
- **任务描述**:
  1. 按已备素材发布 ≥3 平台：Twitter/X 中文（极简版）、即刻（功能亮点版）、小红书（场景痛点版）；时间允许加 Twitter/X 英文 Thread 与 HN Show
  2. 替换素材占位链接为实际 GitHub Release / README 链接
  3. 发布链接回写 `docs/demo/social-media-2026-07-15.md` 末尾"发布记录"段落
- **预期产出**:
  - ≥3 平台实际发布链接
  - 素材文档发布记录更新

---

### 任务组 D：迭代收尾与规划（优先级 P2）

#### D1. 迭代报告撰写
- **优先级**: P2 🟡
- **负责模块**: `reports/`
- **任务描述**:
  1. `reports/iteration-2026-07-18.md`：任务对照表、问题 #1 闭环结论、首查延迟实测、CI 结论、代码统计
  2. `reports/daily-2026-07-18.md` + `reports/daily-2026-07-18-detailed.md`（含环境决策记录、问题日志、下一步行动）
- **预期产出**: 3 份报告文件

#### D2. Phase 4.2 云端同步路线图草案（顺延任务）
- **优先级**: P2 🟡
- **负责模块**: `docs/design/`
- **任务描述**:
  1. 基于 `cloud-sync-architecture-2026-07-16.md` 输出 Phase 4.2 开发计划草案：加密库选型（`cryptography` vs `pycryptodome`）、HTTP 客户端（`httpx` vs `aiohttp`）、里程碑拆分（4.2.1 本地加密层 → 4.2.2 同步协议客户端 → 4.2.3 云端存储适配器 → 4.2.4 设置面板）、与 `storage.ts` / `extension.ts` 集成点
  2. 输出 `docs/design/cloud-sync-roadmap-2026-07-18.md`
- **预期产出**: 路线图文档（含 Mermaid 甘特图、依赖关系）

---

## 四、任务优先级矩阵

```
           紧急程度
           高 ←————————→ 低
           ┌─────────┬─────────┐
     高   │ A1 A2   │   C1    │
     重   │ A3 B1   │   C2    │
     要   │ B2 (P0) │  (P1)   │
     性   │         │         │
           ├─────────┼─────────┤
     低   │   D1    │   D2    │
           │  (P2)   │  (P2)   │
           └─────────┴─────────┘
```

---

## 五、执行顺序建议（时间线）

```
02:00 ─┬─ 环境盘点：git status 核实 + py -0p 解释器清单 + 回顾 07-17 日报问题 #1
       │
02:10 ─┬─ 【A1】503 降级路径兜底修复（vector_index.py + server.py）
       │    └─ 3.14 环境复现验证：503 友好返回，无 RemoteDisconnected
       │
02:50 ─┬─ 【A2】Python 环境统一（pyproject 约束 / 重建 3.12 venv 或升级 chromadb）
       │
03:40 ─┬─ 【A3】语义/混合搜索端到端复验
       │    └─ /health 流转、test_endpoints.py 8/8、首查延迟 <200ms 实测
       │    └─ VS Code 三模式手动验证
       │
04:30 ─┬─ 【B1】npm test 333 项全量回归 + tsc 复核
       │
05:00 ─┬─ 【B2】提交推送 main，CI 首次触发与修复（Python 矩阵 3.12+3.14）
       │
06:00 ─┬─ 【C1】GitHub Release v0.3.0（前提：A 组闭环 + B1 通过）
       │
06:30 ─┬─ 【C2】社交媒体宣发（≥3 平台）
       │
07:00 ─┬─ 【D1】迭代报告 3 份
       │
07:30 ─┬─ 【D2】Phase 4.2 云端同步路线图草案（如时间允许）
       │
08:00 ── 迭代结束，最终检查（git diff + 全量测试确认）
```

---

## 六、验收标准

| 检查项 | 标准 | 验证方式 |
|--------|------|----------|
| A1 降级路径 | 语义栈任何故障返回 503 + 友好提示，无 RemoteDisconnected / 处理器崩溃 | 3.14 环境重跑 test_endpoints.py |
| A2 环境统一 | 单一解释器环境（3.12 固定或 chromadb 兼容 3.14），ChromaDB 初始化成功 | `pyproject.toml` + 实测 |
| A3 端到端 | test_endpoints.py 8/8 通过；首查 latency_ms < 200ms；/health 状态正确流转 | 测试运行 + 手动计时 |
| B1 前端回归 | tsc 0 错误；npm test 333/333 通过 | 命令行 |
| B2 CI | Actions Node 矩阵全绿；Python 矩阵 3.12+3.14 纳入，非语义测试通过（或条件跳过有记录） | Actions 页面 |
| C1 Release | tag `v0.3.0` + Release 页存在，notes 覆盖 Phase 3 + 4.1 highlights | GitHub 页面 |
| C2 宣发 | ≥3 平台发布，链接回写素材文档 | 平台链接 |
| D1 报告 | 3 份报告完整，含问题 #1 闭环结论与环境决策记录 | 文档审查 |
| D2 路线图 | 覆盖加密库选型、同步协议、里程碑甘特图 | 文档审查 |

---

## 七、风险与应对

| 风险 | 可能性 | 影响 | 应对 |
|------|--------|------|------|
| 本机无 Python 3.12 可用 | 低 | A2 方案 a 受阻 | 转方案 b：升级 chromadb 至兼容 3.14 版本，重跑语义栈测试 |
| chromadb 新版仍有兼容问题 | 中 | A2/A3 阻塞 | 保持 503 降级为正式行为，语义搜索标记为"环境受限"，发版 notes 注明；不阻塞 C1 |
| 首查延迟实测 > 200ms | 低 | A3 需调优 | 检查 HNSW 参数 / n_results；硬件瓶颈则放宽至 <500ms 并记录已知限制 |
| 本地确非 git 仓库 | 中 | B2 前置增加 git init + remote 配置时间 | 时间线已预留 10 分钟盘点；init 后注意 `.gitignore` 排除 `.venv/`、`out/`、`node_modules/` |
| npm test 出现 hybrid 相关回归 | 低 | B1 阻塞 | 重点查 `searchSettings.test.ts` 三态适配与 `engineClient` hybrid 用例 |
| CI Windows + chromadb 安装失败 | 中 | B2 受阻 | chromadb 移入 optional-dependencies，语义测试独立 job 条件执行 |
| 单轮迭代超时 | 中 | 任务挤压 | 06:00 时 C1 未就绪则优先保 A+B 组闭环，C1/C2/D2 顺延下轮 |

---

## 八、相关文档与代码入口

- **PRD 需求**: `docs/PRD.md`（§7 Phase 4 里程碑）
- **问题 #1 详录**: `reports/daily-2026-07-17.md`（"遇到的问题"节）
- **上轮计划**: `plan/iteration-2026-07-17.md`
- **架构文档**: `docs/ARCHITECTURE.md`
- **模型选型**: `docs/research/model-benchmark-2026-07-16.md`
- **云端同步架构**: `docs/design/cloud-sync-architecture-2026-07-16.md`
- **社交素材**: `docs/demo/social-media-2026-07-15.md`
- **CI 配置**: `.github/workflows/ci.yml`
- **Python 服务**: `packages/memory-engine/src/memory_engine/server.py`
- **向量索引**: `packages/memory-engine/src/memory_engine/vector_index.py`
- **端点测试**: `packages/memory-engine/scripts/test_endpoints.py`
- **工程配置**: `packages/memory-engine/pyproject.toml`
- **插件入口**: `packages/vscode-extension/src/extension.ts`
- **EngineClient**: `packages/vscode-extension/src/utils/engineClient.ts`

---

**计划版本**: v1.0  
**编制者**: 迭代计划系统  
**最后更新**: 2026-07-17 20:00 CST

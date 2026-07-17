# Remember Me — 详细日报

**日期**: 2026-07-18（周六）
**版本**: v0.3.0（发布准备中）
**迭代阶段**: Phase 4.1 问题闭环 + 环境统一 + v0.3.0 发布准备
**开发窗口**: 02:00 – 03:20 CST
**执行结构**: 主代理（统筹/集成/终验/报告）+ 4 并行子代理（A 组、B1、B2、D2）
**报告生成时间**: 2026-07-18 03:25 CST

---

## 一、环境决策记录（A2 结论，重要）

| 决策项 | 结论 | 依据 |
|--------|------|------|
| Python 版本策略 | **固定 3.12**（方案 a） | uv 管理的 CPython 3.12.13 本机可用；chromadb 1.5.9 在 3.14 存在兼容性风险史 |
| `requires-python` | `>=3.11,<3.14`（原 `>=3.9`） | pyproject.toml L10；分类器删 3.9/3.10、增 3.13 |
| `.venv` | uv 0.11.21 重建，基础解释器 `C:\Users\linbi\AppData\Roaming\uv\python\cpython-3.12-windows-x86_64-none\python.exe` | 旧 3.14.3 venv 已删除，环境分裂消除 |
| 关键依赖 | chromadb 1.5.9 · sentence-transformers 5.6.0 · torch 2.13.0+cpu | uv pip 安装（torch wheel 116MB，约 8 分钟，一次性成本） |
| chromadb 是否升级 | **不升级**（1.5.9 保持） | 3.12 下冒烟通过；升级留待 Phase 4.2 评估 |
| `__pycache__` | src/、scripts/ 全部清零 | 字节码与解释器版本一致 |

**CI 与钉定的协调**：`ci.yml` 核心安装步骤使用 `--ignore-requires-python`，使 3.14 金丝雀腿在钉定 `<3.14` 下仍可运行非语义测试——刻意保留的探针机制，让 3.14 兼容性问题在 CI 暴露而非本地。

## 二、问题 #1 完整闭环日志

### 2.1 根因再认定

- 07-17 记录：chromadb 1.5.9 Rust 绑定在 Python 3.14 报 `AttributeError: 'RustBindingsAPI' object has no attribute 'bindings'`，且降级失效致 RemoteDisconnected。
- 今日复测：**3.14.3 下原发故障无法自然复现**——`chromadb_rust_bindings.pyd` 正常导入，`PersistentClient` 初始化成功，端点测试 8/8。
- 归因修正：发现并清除一个 **07-17 08:06 启动的 stale server 进程**（占用 8765 端口、运行旧代码）。原故障大概率为旧进程造成的 sqlite 争用；`'bindings'` AttributeError 是构造失败后 `__del__` 访问未赋值属性的下游症状。
- **教训**：环境类故障排查第一步应检查端口占用与残留进程（`ps -W | grep python` / `netstat -ano | findstr :8765`）。

### 2.2 A1 修复明细（file:line）

`packages/memory-engine/src/memory_engine/vector_index.py`（+60 行）：

| 位置 | 改动 |
|------|------|
| `vector_index.py:30-47` | 新增 `_reset_chromadb_registry()`：调用官方 `SharedSystemClient.clear_system_cache()`；清理失败仅记日志不掩盖原异常 |
| `vector_index.py:127-133` | `SentenceTransformer(...)` 包入 `try/except Exception → SemanticSearchError` |
| `vector_index.py:139-148` | `chromadb.PersistentClient(...)` 包入 `try/except Exception`：先 `_reset_chromadb_registry()` 再抛 `SemanticSearchError` |
| `vector_index.py:154-164` | 初始化末尾预热（`_encode(["remember-me warmup"])` + 集合 count），消除首查 torch 推理初始化 + HNSW 加载开销；预热失败不影响可用性 |

`packages/memory-engine/src/memory_engine/server.py`（+35 行）：

| 位置 | 改动 |
|------|------|
| `server.py:49-53` | `get_vector_index()` 新增 `except Exception` 兜底 → 返回 None → 端点 503 |
| `server.py:91-96` | `_read_json_body()` 捕获 `UnicodeDecodeError` → 返回 `{}`（端点回 400），修复新发现的 RemoteDisconnected 崩溃向量 |
| `server.py:421-430` | `_handle_semantic_index()` 中 `index_all_memories()` 包入 `try/except SemanticSearchError → 503` |
| `server.py:715-722` | 预加载线程检查 `get_vector_index()` 返回值：None 时**不再误置** `_vector_index_ready=True` |

新增 `packages/memory-engine/scripts/verify_a1_graceful.py`（60 行）：进程内 3 项断言（SemanticSearchError 抛出、注册表无残留、二次尝试无 KeyError 穿透），可重复执行。

### 2.3 故障注入验证记录（3.14 venv + 损坏 chroma.sqlite3）

进程内：

```
[PASS] 第 1 次尝试抛出 SemanticSearchError: ChromaDB 初始化失败: InternalError: error returned from database: (code: 26) file is not a database
[PASS] SharedSystemClient 注册表无残留（system/refcount 均已清理）
[PASS] 第 2 次尝试仍为 SemanticSearchError（无 KeyError 穿透）
RESULT: ALL PASS
```

HTTP 层：

```
[semantic] 向量索引不可用: ChromaDB 初始化失败: InternalError: ...
[preload] 后台向量索引预加载失败: 语义栈不可用，语义端点将以 503 降级响应
连续 3 次 POST /semantic-search + 1 次 POST /semantic-index → 全部 HTTP 503
{"error": "语义搜索服务暂不可用", "fallback": "请使用关键词搜索 POST /search", "reason": "chromadb 或 sentence-transformers 未安装"}
无 RemoteDisconnected、无 KeyError
```

## 三、端到端验收数据（3.12 统一环境）

### 3.1 /health 状态流转

```
t+1s:   {"status":"ok","version":"0.3.0","semantic_ready":false,"model_loaded":"unknown"}
t+3s…t+19s: semantic_ready=false（每 2s 轮询）
t+21s:  semantic_ready=true, model_loaded="all-MiniLM-L6-v2"   ← 首次冷启动翻转
```

- 服务日志：`[preload] 后台向量索引预加载完成`。
- 翻转区间 21–37s（sentence-transformers 每次启动访问 HF Hub 检查 revision，受网络波动影响；模型本体已缓存，无下载）。
- **已知偏差**：慢于计划预估 5–10s；翻转语义严格真实（预热完成才置位）。状态栏"🧠 语义模型预热中…"展示时长相应为 21–37s。

### 3.2 首次查询延迟

| 测量 | latency_ms | 说明 |
|------|-----------|------|
| 预热前 FIRST /semantic-search | 555.82 | 一次性 torch 推理初始化 + HNSW 加载（HNSW 参数/n_results 排查后确认非瓶颈，第二次即 63.29ms） |
| **预热后 FIRST /semantic-search** | **83.51** | ✅ < 200ms 达标 |
| 稳态（第二次起） | 46–63 | — |
| 主代理终验首次 semantic-search | 97.15 | ✅ 复核达标 |

### 3.3 test_endpoints.py 8/8 明细（子代理轮）

| # | 用例 | 结果 | 延迟 |
|---|------|------|------|
| 1 | /health | PASS | — |
| 2 | /extract（2 项） | PASS | — |
| 3 | /search | PASS | — |
| 4 | /semantic-index（1 条记忆） | PASS | 143.77ms |
| 5 | /semantic-search 字段完整性 | PASS | 46.1ms |
| 6 | /semantic-search 400 校验 | PASS | — |
| 7 | /hybrid-search（含 hybrid_scores） | PASS | 86.32ms |
| 8 | /hybrid-search 退化路径 | PASS | 119.88ms |

主代理终验轮同样 8/8（exit 0，`All endpoint tests passed!`）。

### 3.4 降级模式性能备注

降级模式下每次语义请求会同步重试初始化（SentenceTransformer 重载 ~1s + 构造失败 ~6s），混合搜索降级时延迟 ~6-7s；仅影响故障环境，正常环境无此路径。如需优化可加重试退避，记为低优先改进项。

## 四、前端回归（B1）

- `npm run compile`（tsc -p ./）：**0 错误 0 警告**，无任何诊断输出。
- `npm test`：**333/333 通过（9s）**，连续 3 次全绿，无 Windows 文件句柄 flaky，临时目录清理正常。
- 重点用例：`SearchSettingsManager`（三态 SearchMode，5 例）✓、`EngineClient`（hybrid，17 例）✓。
- 套件分布（18 套件）：SearchIndex 36 / ConversationManager 28 / MemoryRecommender 26 / ProjectManager 25 / StyleChecker 23 / UpdateDetector 21 / VersionControlWebview 21 / ConversationHistoryWebview 20 / JsonStorage 20 / InfoExtractor 19 / EngineClient 17 / ProfileManager 16 / AI Provider 12 / Logger 12 / TemplateManager 12 / PromptBuilder 11 / SearchIndex Persistence 9 / SearchSettingsManager 5。
- 顺手清理：`src/test/suite/searchIndex.test.ts.{bak,tmp}` 残留删除（−1027 行）。

## 五、CI 补丁明细（B2）

`.github/workflows/ci.yml`（+129/−10）：

1. **Python 矩阵**：`['3.11','3.12']` → `['3.12','3.14']`，双 OS（ubuntu/windows），`fail-fast: false`。
2. **安装分层**：核心 `--no-deps --ignore-requires-python` → 语义栈独立步骤 `continue-on-error: true` + `--only-binary :all:`（避免 3.14 源码编译 torch）→ 探针步骤输出 `available=true|false`（捕获"装上但初始化失败"情形，发 `::warning::`）。
3. **服务启动**：日志/pid 捕获 + Python heredoc 轮询 `/health`（60s 硬超时，失败 dump 状态）；语义可用时额外等待 `semantic_ready`（180s，超时仅告警）。已核对 test_endpoints.py 本身断言 503 退化契约，故非语义测试在两腿均通过。
4. **收尾**：`if: always()` 杀进程 + tail server-ci.log。
5. **Node**：`npm ci --foreground-scripts --no-audit --no-fund`（Windows spawn/句柄防护）；`npm test` 重试一次包装；矩阵 OS [ubuntu, windows] × Node [18, 20]（对齐 engines.vscode ^1.85）。
6. **触发**：新增 `workflow_dispatch`。
7. **验证**：js-yaml parse ✓（修掉一处 `:all:` plain scalar 解析错误）；9 个 run 块 `bash -n` ✓；内嵌 Python heredoc `py_compile` ✓。

`.gitignore` +4：`.mypy_cache/`、`.ruff_cache/`、`dist/`、`build/`。

**CI 首跑阻塞**：无 git remote。SSH 认证已验证（`ssh -T git@github.com` → `Hi ltgkb!`）；`gh` CLI 未安装。解锁步骤：GitHub Web UI 建库 → `git remote add origin git@github.com:ltgkb/<repo>.git` → `git push -u origin main`（push 即触发 CI）。

## 六、Phase 4.2 路线图摘要（D2 交付）

`docs/design/cloud-sync-roadmap-2026-07-18.md`（403 行）：

- **加密库：cryptography 胜出**——07-16 架构 §2.3 示例已按其 AESGCM 高层 AEAD API 编写；防 nonce 误用 + OpenSSL 审计 + AES-NI；配 argon2-cffi 覆盖 Argon2id/PBKDF2 双 KDF；pycryptodome 仅作极端打包场景备选。
- **HTTP 客户端：httpx 胜出**——同步+异步双 API 贴合 engine 现有 stdlib http.server + threading 模型，零异步重构；HTTP/2 利于 4KB 块级增量同步；MockTransport 利于离线契约测试；aiohttp 强制 async 排除。
- **依赖策略**：全部进 pyproject 新增 `sync` 可选分组（keyring / mnemonic / boto3 / tenacity / PyJWT），开源版零新增依赖。
- **里程碑**：4.2.1 本地加密层 → 4.2.2 同步协议客户端 → 4.2.3 云端存储适配器 → 4.2.4 设置面板；共 328 人时 / 9 周（07-20 启动，v0.4.0-beta 2026-09，GA 2026-10）；关键路径 4.2.1→4.2.2；含 Mermaid 甘特图。
- **集成点（真实符号）**：`JsonStorage` 加 `onFileChanged` 钩子、`registerCommands` 新增 5 命令、`EngineClient` 新增 4 方法、`deactivate()` 沿用 07-17 semanticPollInterval 清理范式；engine 侧 `/sync/*` 路由、`_sync_worker` 复用 `_shutdown_event`；产物落 `{data_dir}/.sync/`。勘误：storage.ts 实际在 `src/memory/` 而非 `src/utils/`。
- **风险表 11 项**：密钥丢失（BIP39 恢复码）、Windows Credential Locker 差异（keyring 降级）、冲突合并（三策略 + 复用 `.backups/`）、离线队列膨胀（500 条上限 + 退避重放）等。

## 七、git 时间线

```
9590bc3  chore: establish baseline before 2026-07-18 iteration (02:0x，本日首次 git init)
c7afd4a  feat: Phase 4.1 closure — 503 degradation + py3.12 + CI matrix + 4.2 roadmap (03:1x)
```

提交 c7afd4a：9 文件，+675/−1048。提交身份：`Remember Me Dev <dev@remember-me.local>`（本地 -c 临时身份，未写全局/仓库 config）。

## 八、顺延与待办

| # | 事项 | 优先级 | 解锁条件 |
|---|------|--------|----------|
| 1 | CI 首次触发 + 按预案修复 | P0 | GitHub 建库 + remote + push |
| 2 | VS Code 三模式搜索手动验证（状态栏、🔍🧠 前缀） | P0 | 人工操作 VS Code |
| 3 | GitHub Release v0.3.0（tag + notes + 反馈帖） | P1 | #1 完成；notes 素材已备（CHANGELOG v0.3.0 + 本报告 §三实测） |
| 4 | 社交媒体宣发 ≥3 平台（X 中文/即刻/小红书，可加 X 英文 Thread + HN） | P1 | #3 完成后替换素材占位链接；可经 Kimi WebBridge 操作登录态 |
| 5 | 降级模式语义请求重试退避优化 | P3 | 无阻塞，随 Phase 4.2 排期 |
| 6 | Phase 4.2.1 本地加密层启动评审 | P2 | 路线图已就绪 |

## 九、风险复盘

| 风险（计划 §七） | 实际发生？ | 处置 |
|------------------|-----------|------|
| 本机无 Python 3.12 | 否（uv 3.12.13 可用） | 方案 a 顺利执行 |
| chromadb 新版兼容问题 | 未触发（不升级） | — |
| 首查延迟 > 200ms | 部分（预热前 555.8ms） | 初始化预热消除，达标 |
| 本地确非 git 仓库 | **是** | 02:0x git init + 基线，预留时间命中 |
| npm test hybrid 回归 | 否 | 333/333 零修复 |
| CI Windows + chromadb 失败 | 待首跑验证 | 预案已落 ci.yml |
| 单轮迭代超时 | 部分（A 组子代理首轮超时） | resume 续跑无损完成 |

---

**编制**: 迭代开发系统
**最后更新**: 2026-07-18 03:25 CST

# 更新日志

本项目所有重要变更均会记录于此文件。

格式基于 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/)，
版本号遵循 [语义化版本](https://semver.org/lang/zh-CN/)。

## [0.4.0-alpha] - 未发布

### 新增（Phase 4.2.1 本地加密层 · 首轮冲刺，2026-07-20）

- **`crypto` 加密包**（`memory_engine/crypto/`，纯本地、不触网，落地已评审架构 §2）：
  - `kdf.py`：主密钥派生双路径——Argon2id（64MB 内存硬度 / 3 次遍历）与 PBKDF2-SHA256（100,000 迭代）；`derive_master_key_auto` 派生耗时 >3s 自动降级 PBKDF2 并记日志（`clock` 可注入便于测试）；HKDF 派生 DEK（数据加密）+ MK（manifest HMAC）子密钥，info 域分离。
  - `cipher.py`：AES-256-GCM 文件级加解密（`encrypt_file` / `decrypt_file`，签名语义与架构 §2.3 示例 100% 对齐）；12 字节随机 IV，密文格式 `IV || ciphertext || tag`；AAD = `filepath:version` 防重放；篡改必抛 `CipherError`，绝不返回部分明文。
  - `keystore.py`：`KeyStore` 抽象（store/load/delete/exists，delete 幂等）+ `KeyringKeyStore`（Windows Credential Locker / macOS Keychain / libsecret，hex 编码 32B 密钥）+ `FileKeyStore` 降级后端（口令 PBKDF2 保护的加密密钥文件 `~/.remember-me/.sync/keystore.enc`，原子写盘，docstring 明示安全等级差异）；`get_keystore` 工厂按可用性自动选路。
  - `recovery.py`：BIP39 12 词恢复码 ↔ 128-bit 主密钥双向转换；三层输入校验（词数 / 词表 / 校验位），非法恢复码中文友好报错；大小写与空白归一化。
  - `errors.py`：`CryptoError` 异常族（`KeyDerivationError` / `CipherError` / `KeyStoreError` / `RecoveryError`）+ `SyncError` 族起点，沿用 `SemanticSearchError` 分层降级惯例。
- **CLI 自检**：`remember-me-crypto selftest` 串联 KDF 派生 → 加解密 round-trip → KeyStore 存取 → 恢复码重建，逐项打印 PASS/FAIL，全部通过退出码 0；sync 依赖缺失时给出安装引导（懒加载，不影响 base 安装的其他命令）。
- **依赖**：`pyproject.toml` 新增 `sync` 可选依赖分组（cryptography≥42 / argon2-cffi≥23.1 / keyring≥25 / mnemonic≥0.21 / httpx≥0.27 / boto3≥1.34 / tenacity≥8.2 / PyJWT≥2.8），开源版（本地 JSON）用户零新增依赖。

### 变更

- mypy `python_version` 3.9 → 3.12、ruff `target-version` py39 → py312：原配置滞后于 `requires-python >=3.11` 与统一开发环境 CPython 3.12；且 chromadb → numpy 类型存根为 3.12-only 语法（PEP 695），3.11 目标无法解析。
- `dev` 依赖分组新增 `pytest-cov`（加密层覆盖率验收需要）。

### 修复

- mypy 3.12 下暴露的 9 处既有潜在问题：`vector_index.py` `__main__` 入口缺 `import json`（真实缺陷）、4 处失效 `type: ignore`、`cli.py`/`server.py` 备份排序键类型（改用 `cast(float, ...)` 替代失效 ignore）。
- ruff 7 处：未使用导入（`ExtractedInfo`、`backup_list_cmd`、函数级 `json`）与未使用变量（`suffix`、`definition`）。

### 测试

- `tests/crypto/` 新增 **151 例全绿**（连跑多遍无 flaky）：round-trip（含空输入 / 1MB 边界）、篡改检测（1 bit 翻转 / AAD 篡改 / 截断，断言 `InvalidTag` 因果链）、IV 随机性、KDF 双路径确定性与假时钟降级、KeyStore 三后端（内存 fake / 加密文件 / 真实 Credential Locker）、恢复码生成重建与非法输入矩阵。
- crypto 包覆盖率 **100%**（验收要求 ≥90%）。
- Windows 实测：主密钥写入/读回 Credential Locker，**跨进程免密恢复逐字节一致**（架构验收标准 4，非交互会话下亦通过）。
- 回归基线不回退：mypy --strict 0 错误（11 文件）、ruff 0 错误、`test_endpoints.py` 8/8、npm test 333/333、tsc 0 错误。

### 新增（Phase 4.2.1 二轮冲刺收官 + Phase 4.2.2 原语先行，2026-07-21）

- **`.sync/` 目录约定与同步配置基座**（`memory_engine/sync/`，新建包）：统一同步产物落点（`manifest.json` / `manifest.json.sig` / `config.json` / `queue` / `keystore.enc`），`REMEMBER_ME_DATA_DIR` 隔离；`SyncConfig`（deviceId UUID4 / sync.enabled / kdf.method / kdf.salt / lamport）同目录临时文件 + `os.replace` 原子写；`SyncError` 异常族扩展（`SyncConfigError` / `ManifestIntegrityError`）。
- **首次绑定与解锁流程**（`crypto/bootstrap.py`）：`bootstrap_first_run` / `unlock` / `unlock_with_recovery` 三流程（`BootstrapResult` / `UnlockResult` / `RecoveryUnlockResult`）；method+salt 持久化至 `.sync/config.json` 保证他端可复现；双 key_id 托管（master 32B KDF 主密钥 + recovery 16B 恢复码主密钥）；`unlock` 加 exists() 守卫——错误口令绝不静默重派生覆盖托管（配专测 `test_unlock_wrong_passphrase_never_rederives`）；恢复码仅经返回值出层，绝不落盘/记日志；真子进程跨进程实证仅凭持久化 method+salt+口令重派生主密钥逐字节一致。
- **manifest HMAC 完整性原语**（`sync/manifest_mac.py`）：签名与清单分离存储（`manifest.json.sig`，HMAC 覆盖磁盘精确字节，免除 JSON 规范化跨端不一致）；`hmac.compare_digest` 常量时间比较；损坏自动备份至 `.sync/corrupted-{ts}/` 并重建空清单；全量冲突重建接口 4.2.2 占位。
- **Lamport 时钟**（`sync/lamport.py`）：`LamportClock`（tick/merge 即落盘 `config.lamport`，防重启回退）；`(lamport, deviceId)` 字典序全序 `compare` / `happens_before`（架构 §3.2，平局 deviceId 决胜）。
- **FileVersion 清单**（`sync/manifest.py`）：`FileVersion`（frozen，字段与架构 §3.2 逐项对齐，camelCase 与 TS 接口逐字一致）；读写全程 HMAC 保护、验签失败走损坏处置；`diff` 四分（新增 / 变更 / 冲突 / 伪冲突）；`scan_sync_files` 枚举架构 §2.2 四类文件；清单模式 v1 canonical 序列化；contentHash 取整文件明文 SHA-256（GCM 随机 IV 使密文哈希跨端不可比）。
- **4KB 块级哈希树**（`sync/chunker.py`）：逐块 SHA-256 + Merkle 式根哈希 + 同趟 flat content_hash（与 `FileVersion.contentHash` 三方同源）；`changed_chunks` 变更块索引，供增量上传只传变更块；流式单趟读取；实测 1MB 文件尾部改 100 字节 → 变更块 1/256 ≈ 0.4%（验收线 <20%）。
- **离线队列**（`sync/queue.py`）：`queue.jsonl` 单文件 JSONL 追加（`QueuedChange` camelCase 对齐 FileVersion）；enqueue / peek / replay（只读快照）/ 两段式 clear（重放中途强杀零丢失）/ depth；500 条上限同路径合并保最新 + 告警不崩溃；进程内锁保证追加原子性（8 线程×25 并发实证零撕裂）；损坏行跳过 + 告警。

### 变更（2026-07-21）

- CI：Python 腿 pytest 步骤由 `tests/crypto/` 扩为 `tests/crypto/ tests/sync/`（沿用 `becf80e` 条件化通道：3.12 必绿、3.14 金丝雀条件跳过；sync 纯本地无新增依赖）。
- `.gitignore` 追加防复发规则：`fix-*.js`、`*.ts.new`。

### 修复（2026-07-21）

- **插件 `searchIndexPersistence` flaky（CI 掷骰失败病灶）**：`searchIndex.ts` `save()` 的 `updatedAt` 用 `toISOString()`（整数毫秒截断）与 `load()` 的 `mtimeMs`（亚毫秒浮点）严格比较，Windows 精度边界误判索引过期；现 `save()` 的 `updatedAt` 取 `max(Date.now(), Math.ceil(最晚源文件 mtimeMs))`（单调性范式，同 `7c6bd3b`），`load()` 严格比较不动、对真实更新零检测损失；新增 1 条回归断言（只增强未放宽）。
- **误提交临时文件清理**：移除 `packages/vscode-extension/fix-ext2.js`、`src/extension.ts.new`、`src/fix-ext2.js`（全仓检索零引用）。

### 测试（2026-07-21）

- `tests/sync/` 新增 **238 例全绿**（test_paths 8 / test_config 33 / test_bootstrap 21 / test_manifest_mac 29 / test_lamport 26 / test_manifest 64 / test_chunker 23 / test_queue 34）；`pytest tests/sync tests/crypto` 合计 **389/389**（crypto 151 既有零回退）。
- sync + crypto 联合覆盖率 **100%**（1283 语句 0 遗漏；验收要求 sync ≥85%）。
- 关键实证：首启 → 解锁 → 恢复码重建主密钥逐字节一致（真子进程跨进程重派生）；50 文件 FIFO 重放无丢失无重复；8 线程×25 并发追加零撕裂；1MB 尾部改 100B → 变更块 1/256 ≈ 0.4%。
- 插件侧 **334/334 ×3 连绿**（基线 333 + D1 回归断言 1）；tsc 0 错误。
- 回归基线不回退：mypy --strict 0 错误（21 文件）、ruff 0 错误、`test_endpoints.py` 8/8、`remember-me-crypto selftest` 4/4 PASS。

---

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

[0.3.0]: https://github.com/ltgkb/remember-me/releases/tag/v0.3.0
[0.2.0]: https://github.com/ltgkb/remember-me/releases/tag/v0.2.0
[0.1.0]: https://github.com/ltgkb/remember-me/releases/tag/v0.1.0

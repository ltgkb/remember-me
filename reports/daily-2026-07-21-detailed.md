# Remember Me — 详细日报

**日期**: 2026-07-21（周二）
**版本**: v0.4.0-alpha（开发中，未发布）
**迭代阶段**: Phase 4.2.1 二轮冲刺（密钥生命周期整合）收官 + Phase 4.2.2 提前启动（纯本地同步原语）
**开发窗口**: 02:00 – 03:21 CST（截至报告生成）
**执行结构**: 并行子代理开发（A 组 / B 组 / D1 副线）+ 主协调代理统一整合、质量门终验与报告
**报告生成时间**: 2026-07-21 03:21 CST

---

## 一、执行时间线

```
02:00  环境盘点 + 质量门基线确认；并行子代理全面启动
       ├─ 【A 组子代理】4.2.1 收官：A1 sync 包基座 → A2 crypto/bootstrap.py → A3 manifest_mac.py
       ├─ 【B 组子代理】4.2.2 原语先行：B1 lamport / B2 manifest / B3 chunker / B4 queue
       └─ 【D1 副线】searchIndexPersistence flaky 修复 + 全量连跑 3 次（插件侧独立改动）
       各组测试随开发同步落地（tests/sync/ 八文件 238 例）
       【主协调代理】sync/__init__.py 统一整合（导出 58 符号）→ 质量门终验（02:00 起）
       （pytest 389 / 覆盖率 100% / mypy / ruff / 端点 8/8 / npm ×3 / selftest）
       → E1 仓库清理 + .gitignore 防复发 + CI 补丁（tests/sync 纳入 Python 腿）
03:21  报告 ×3 + CHANGELOG 增补；提交时间线待主协调代理提交后回填
```

计划时间线对照：保底顺序 A1→A2→A3→B1→B2→C1→B3→B4→C2→D/E 全部完成，无弃项（计划风险表「挤压时保 A 弃 B4」未触发）；并行推进下全部任务组在报告生成前闭环。

## 二、环境与执行结构

| 项 | 值 |
|----|----|
| 迭代依据 | `plan/iteration-2026-07-21.md`（2026-07-20 20:00 编制） |
| 范围约束 | 引擎侧为主、不触网（除 git 推送）；4.2.2 仅四个纯本地原语，worker / 端点 / 冲突引擎 / 云端适配器不触碰；插件侧唯一改动为 D1 |
| 架构依据 | `docs/design/cloud-sync-architecture-2026-07-16.md` §2.2 / §3.2 / §3.4；路线图 §3.3 |
| 执行方式 | 并行子代理开发 + 主协调代理统一整合与终验 |
| 依赖变化 | **无新增**（sync 原语纯本地，沿用 07-20 sync 分组） |

## 三、模块交付明细

### 3.1 A1 `sync/` 包基座（`__init__` / `errors` / `paths` / `config`）

- `.sync/` 目录约定：`manifest.json` / `manifest.json.sig` / `config.json` / `queue` / `keystore.enc` 统一落点；路径解析复用 `cli.py` 的 `_data_dir()` / `REMEMBER_ME_DATA_DIR` 环境变量约定（测试隔离零成本）
- `SyncConfig` dataclass：`deviceId`（首次启动 UUID4）/ `sync.enabled` / `kdf.method` / `kdf.salt` / `lamport`；同目录临时文件 + `os.replace` 原子写（沿用 FileKeyStore 先例）
- `SyncError` 异常族自 `crypto/errors.py` 既有起点扩展：`SyncConfigError` / `ManifestIntegrityError`
- 测试：test_paths 8 例 + test_config 33 例

### 3.2 A2 `crypto/bootstrap.py`（首启 / 解锁 / 恢复码三流程）

- `bootstrap_first_run(passphrase, data_dir=None)` → `derive_master_key_auto` 派生主密钥 → `method`+`salt` 持久化至 `.sync/config.json`（07-20 决策记录 3 既定：method 必须持久化否则他端无法复现）→ `get_keystore().store(master_key)` → `generate_recovery()` 返回 12 词恢复码；结构化返回 `BootstrapResult`（含 `downgraded` 标记）
- `unlock(passphrase=None, data_dir=None)` → keystore.load 优先；无条目/后端不可用 → 口令经持久化 method+salt 重派生（`derive_master_key`，绝不暗中换法）→ 重新托管
- `unlock_with_recovery(words, data_dir=None)` → `from_recovery_code` 重建主密钥 → 重新托管；返回 `RecoveryUnlockResult`
- **关键安全设计**：`unlock` 加 `exists()` 守卫——错误口令绝不静默重派生并覆盖既有托管；配专测 `test_unlock_wrong_passphrase_never_rederives` 锁定语义
- **双 key_id 托管**：master（32B，KDF 主密钥）与 recovery（16B，恢复码主密钥）分条目托管，互不覆盖；恢复码仅经返回值出层，绝不落盘 / 记日志
- **真子进程跨进程实证**：仅凭持久化 method+salt+口令重派生主密钥逐字节一致
- 测试：test_bootstrap 21 例

### 3.3 A3 `sync/manifest_mac.py`（manifest HMAC 完整性原语）

- 签名与清单**分离存储**：`manifest.json.sig`（JSON `{version, alg, mac}`）；选型理由——HMAC 覆盖磁盘精确字节，免除 JSON 规范化跨端不一致
- `write_manifest_mac` / `verify_manifest_mac`；`hmac.compare_digest` 常量时间比较；校验失败抛 `SyncError` 族中文友好提示
- `handle_corrupted_manifest` 损坏处置：备份损坏文件至 `.sync/corrupted-{ts}/` + 重建空清单（路线图 §6「损坏即按全新设备重建」既定方针）
- `request_full_conflict_rebuild`：全量冲突重建 4.2.2 占位接口
- 测试：test_manifest_mac 29 例

### 3.4 B1 `sync/lamport.py`

- `LamportClock`：`tick()` / `merge(remote)`；**tick/merge 即落盘 `config.lamport`**，防进程重启回退；`deviceId` 自 config 注入
- `Stamp = (lamport, deviceId)` 字典序全序：`compare` / `happens_before`，语义 100% 对齐架构 §3.2（平局 deviceId 决胜）
- 随机交错 200 步收敛测试（双时钟合并最终一致）
- 测试：test_lamport 26 例

### 3.5 B2 `sync/manifest.py`

- `FileVersion`：**frozen** dataclass，`filepath / lamport / deviceId / contentHash / modifiedAt` 与架构 §3.2 逐项对齐；**camelCase 与 TS 接口逐字一致**（免除后续插件侧/端点侧命名映射）
- `Manifest` 读写全程 HMAC 保护（集成 A3）；验签失败走损坏处置（corruption 标记挂实例）
- `diff` 四分：新增 / 变更 / **冲突**（contentHash 不同且 lamport 相等）/ **伪冲突**（contentHash 相同但元数据不同，架构 §3.2）
- `scan_sync_files` 枚举架构 §2.2 四类文件（`profile.json`、`projects/*/context.json`、`projects/*/conversations/*.json`、`search-settings.json`）
- 清单模式 v1 canonical 序列化；`contentHash` = 整文件明文 SHA-256（docstring 写明不用密文哈希的理由：GCM 随机 IV 使密文哈希跨端不等）
- 测试：test_manifest 64 例

### 3.6 B3 `sync/chunker.py`

- 文件 → 4KB 块序列 → 逐块 SHA-256 → 块哈希列表 + Merkle 式根哈希（架构 §3.4）；**同趟**输出 flat `content_hash`（整文件 SHA-256，与 `FileVersion.contentHash` 三方同源）
- `changed_chunks(local_hashes, remote_hashes)`：变更块索引识别，供增量上传只传变更块
- 流式单趟读取支持大文件；边界：空文件 / 不足 4KB / 非 4KB 整数倍尾块
- **验收实证**：1MB 文件尾部改 100 字节 → 变更块 **1/256 ≈ 0.4%**（验收线 < 20%）✓
- 测试：test_chunker 23 例

### 3.7 B4 `sync/queue.py`

- `queue.jsonl` 单文件 JSONL 追加（延续透明 JSON 哲学；计划原文 `queue/*.json` 的实现收敛，见迭代报告 §五.4）；`QueuedChange`：`filepath / lamport / deviceId / contentHash / op / enqueuedAt`（camelCase 对齐 FileVersion）
- `enqueue` / `peek` / `replay`（**只读快照**）/ `clear`（**显式两段式**，重放中途强杀零丢失）/ `depth`
- 500 条上限：超限合并同路径变更保最新 + `logging.warning` 告警，不崩溃、不丢最新变更（路线图 §6 既定）
- 进程内 `threading.Lock` 保证追加原子性；进程强杀后队列文件可续（损坏行跳过 + 告警）
- **验收实证**：50 文件 FIFO 重放无丢失无重复 ✓；8 线程 × 25 条并发追加零撕裂 ✓
- 测试：test_queue 34 例

### 3.8 D1 `searchIndexPersistence` flaky 修复（插件侧）

- **病灶**：`searchIndex.ts` `save()` 的 `updatedAt` 用 `toISOString()`（整数毫秒截断）vs `load()` 用 `mtimeMs`（亚毫秒浮点）严格比较——Windows 精度边界误判索引过期（07-20 CI 事件定性，与 `7c6bd3b` ProfileManager flaky 同类）
- **修复（方案一单调性范式）**：`save()` 的 `updatedAt = max(Date.now(), Math.ceil(最晚源文件 mtimeMs))`——`Math.ceil` 消除浮点截断落差；`load()` 严格比较**不动**，对 save 后真实更新零检测损失（容差方案会放宽真实过期检测，故弃）
- 新增 1 条回归断言（只增强未放宽）
- **验证**：全量连跑 3 次 **334/334 全绿**（基线 333 + 新增 1）；tsc 0 错误；main 推送不再掷骰

### 3.9 E1 仓库清理

- `git rm` 三个误提交临时文件：`packages/vscode-extension/fix-ext2.js`、`src/extension.ts.new`、`src/fix-ext2.js`（全仓检索零引用）
- `.gitignore` 追加防复发规则：`fix-*.js`、`*.ts.new`

### 3.10 CI 补丁

- `.github/workflows/ci.yml`：Python 腿 pytest 步骤由 `tests/crypto/` 扩为 `tests/crypto/ tests/sync/`（沿用 `becf80e` 条件化通道：3.12 必绿、3.14 金丝雀条件跳过；sync 纯本地无新增依赖，预期全腿可跑）
- YAML 语法校验通过；tests/sync 首次入 CI 表现随本轮推送后观察

### 3.11 主协调代理统一整合

- `sync/__init__.py` 统一导出 **58 个符号**（A/B 两组并行产物的公共 API 收口）
- 质量门终验统一执行（见 §四），避免并行自报口径不一（B3/B4 代理曾自报 sync 覆盖率 99%，联合运行后终验 100%）

## 四、质量门终验记录（02:00 起，主协调代理统一执行）

| 项 | 命令 / 范围 | 结果 |
|----|------------|------|
| pytest | `pytest tests/sync tests/crypto` | **389/389 全绿**（crypto 151 既有零回退 + sync 新增 238） |
| 覆盖率 | sync + crypto 联合 | **100%**（1283 语句 0 遗漏；单包实测 chunker 100% / queue 100% / lamport 100% / manifest 100%；验收线 sync ≥85%） |
| mypy | `mypy --strict`（src，21 文件） | **0 错误**（既有 11 + 新增 sync 9 + crypto/bootstrap 1） |
| ruff | `ruff check src tests` | **0 错误** |
| 端点 | `scripts/test_endpoints.py` | **8/8**（"All endpoint tests passed!"） |
| npm test | 插件侧全量 ×3 连跑 | **334/334 ×3 连绿** |
| tsc | `npm run compile` | **0 错误** |
| selftest | `remember-me-crypto selftest` | **4/4 PASS**（不受影响） |

**覆盖率口径说明**：B3/B4 代理自报 sync 99%（manifest.py 当时 98%），B1/B2 代理测试补全后联合运行为 **100%**；报告统一采终验值 100%。

## 五、已知观察项（如实记录，非阻塞）

1. **`test_queue.py::TestIoErrors::test_compact_rewrite_failure_wrapped`** 并行开发期间曾在文件写入中途被并行代理观察到失败 1 次，后续三次全量均通过——登记为观察项，若 CI 再现需跟进。
2. **`scripts/` 目录 4 处 ruff 既有问题**（`model_benchmark.py` 3 处 + `semantic_search_prototype.py` 1 处，引入于 `9590bc3`）——`src`/`tests` 范围 0 错误不受影响，建议下轮顺手清理。
3. **queue `enqueue` 全量读文件算深度**（500 条上界 O(n²)，容量测试约 20s）——真实断网编辑频率无感，worker 集成时可加内存缓存。
4. **单进程假设**：queue 进程内锁已保证线程安全；多进程并发属 4.2.2 正式窗口范围。

## 六、D2 / D3 顺延说明（计划风险表既定策略）

- **D2 社交媒体宣发**：素材已就绪（`docs/demo/social-media-2026-07-15.md`）。发布需浏览器登录态（WebBridge，X 中文 / 即刻 / 小红书 ≥3 平台），凌晨自动化会话执行登录/验证码风险高，按计划「不阻塞主线、标记待人工」处理。
- **D3 三模式手动验证**：本质是人工 VS Code 界面操作（状态栏预热提示 / 🔍🧠 前缀 / 模式持久化），自动化无法替代；**已连续顺延三轮**（07-18 起），建议下个窗口优先人工执行。

## 七、下轮候选任务

1. **Phase 4.2.2 正式窗口**：同步 worker 线程、`server.py` 端点接入（ManifestDiff 五分类即上传 / 下载 / 冲突路由输入已就位）、冲突策略引擎（LWW + 伪冲突自动收敛已就位，真冲突 UI 待插件侧）；
2. D2 + D3 人工窗口执行（D3 已连续顺延三轮，建议优先）；
3. `scripts/` ruff 4 处清理（§五.2）；
4. CI 推送后观察 tests/sync 首次入 CI 表现（预期全腿可跑，3.14 金丝雀腿沿既定条件化通道）。

---

**编制**: 迭代开发系统（并行子代理 + 主协调代理统一整合终验）
**最后更新**: 2026-07-21 03:21 CST

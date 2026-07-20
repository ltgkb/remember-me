# Remember Me — 迭代报告

**迭代日期**: 2026-07-21
**版本号**: v0.4.0-alpha（开发中，未发布）
**迭代类型**: Phase 4.2.1 二轮冲刺（密钥生命周期整合）收官 + Phase 4.2.2 提前启动（纯本地同步原语）+ CI flaky 修复
**执行方式**: 并行子代理开发（A 组 / B 组 / D1 副线）+ 主协调代理统一整合、质量门终验与报告
**报告生成时间**: 2026-07-21 03:21 CST

---

## 一、交付总览（对照 plan/iteration-2026-07-21.md）

| 任务 | 模块 | 优先级 | 状态 | 验证方式 |
|------|------|--------|------|----------|
| A1 `.sync/` 目录约定与同步配置基座 | `sync/{__init__,errors,paths,config}.py` | P0 | ✅ 完成 | test_paths 8 例 + test_config 33 例全绿；`REMEMBER_ME_DATA_DIR` 隔离可用；config `os.replace` 原子写 round-trip |
| A2 首次绑定与解锁流程 | `crypto/bootstrap.py` | P0 | ✅ 完成 | test_bootstrap 21 例全绿；首启 → 解锁 → 恢复码重建主密钥逐字节一致；**真子进程跨进程重派生逐字节一致** |
| A3 manifest HMAC 完整性原语 | `sync/manifest_mac.py` | P0 | ✅ 完成 | test_manifest_mac 29 例全绿；1 bit 篡改必检出；损坏备份 `.sync/corrupted-{ts}/` + 空清单重建 |
| B1 Lamport 时钟 | `sync/lamport.py` | P0 | ✅ 完成 | test_lamport 26 例全绿；随机交错 200 步收敛；平局 deviceId 决胜；重启不回退 |
| B2 FileVersion 清单 | `sync/manifest.py` | P0 | ✅ 完成 | test_manifest 64 例全绿；diff 四分矩阵全过；字段与架构 §3.2 逐项对齐（camelCase 与 TS 接口逐字一致） |
| B3 4KB 块级哈希树 | `sync/chunker.py` | P0 | ✅ 完成 | test_chunker 23 例全绿；**1MB 尾部改 100B → 变更块 1/256 ≈ 0.4% < 20%** |
| B4 离线队列 | `sync/queue.py` | P0 | ✅ 完成 | test_queue 34 例全绿；**50 文件 FIFO 重放无丢失无重复；8 线程×25 并发追加零撕裂** |
| C1 `tests/sync/` 测试套件 | `tests/sync/`（8 文件） | P0 | ✅ 完成 | **sync 新增 238 例全绿；tests/sync + tests/crypto 合计 389/389；覆盖率 100%（验收线 ≥85%）** |
| C2 静态检查与既有基线回归 | 全仓 | P0 | ✅ 完成 | mypy --strict 0 错误（21 文件）；ruff 0 错误；crypto 151 零回退；端点 8/8；npm 334/334 ×3；tsc 0 错误；CI 补丁落地（tests/sync 纳入 Python 腿） |
| D1 `searchIndexPersistence` flaky 修复 | `searchIndex.ts` + 测试 | P1 | ✅ 完成 | 方案一单调性范式（同 `7c6bd3b`）；新增 1 条回归断言；**全量 334/334 ×3 连绿** |
| D2 社交媒体宣发 | 运营 | P1 | ⏳ 顺延 | 素材就绪待人工窗口（需 WebBridge 登录态，凌晨自动化会话不阻塞主线） |
| D3 VS Code 三模式搜索手动验证 | 插件 UI | P1 | ⏳ 待人工 | 已连续顺延三轮，建议人工优先安排 |
| E1 误提交临时文件清理 | `packages/vscode-extension/` | P2 | ✅ 完成 | `git rm` 三文件（全仓检索零引用）；`.gitignore` 追加 `fix-*.js`、`*.ts.new` 防复发 |
| E2 迭代报告 ×3 + CHANGELOG + 推送 | `reports/` / `CHANGELOG.md` / git | P2 | ✅ 完成 | 本报告 + 日报 ×2 + `[0.4.0-alpha]` 章节增补；推送 `244943a`，CI 29772390614 8/8 全绿 |

**范围纪律**：4.2.2 提前启动严格限定四个纯本地原语——同步 worker 线程、`server.py` 端点、冲突策略引擎、云端适配器均未触碰（留 4.2.2 正式窗口与 4.2.3）；插件侧唯一改动为 D1 flaky 修复；全程不触网（除 git 推送），符合计划范围约束。

---

## 二、验收标准对照（对照计划 §六）

| 检查项 | 标准 | 结果 | 证据 |
|--------|------|------|------|
| A1 目录约定 | `.sync/` 产物统一落点；`REMEMBER_ME_DATA_DIR` 隔离；config 原子写 round-trip | ✅ | test_paths 8 例 + test_config 33 例；原子写沿用 FileKeyStore 先例 |
| A2 绑定流程 | 首启 → 解锁 → 恢复码重建逐字节一致；method+salt 持久化；keyring 不可用自动降级 | ✅ | test_bootstrap 21 例；**真子进程实证**：仅凭持久化 method+salt+口令跨进程重派生主密钥逐字节一致 |
| A3 manifest HMAC | 1 bit 篡改必检出；损坏备份 + 空清单重建；恢复码/主密钥零日志 | ✅ | test_manifest_mac 29 例；`hmac.compare_digest` 常量时间比较 |
| B1 Lamport | 双时钟交错 merge 收敛一致；平局 deviceId 决胜；重启不回退 | ✅ | test_lamport 26 例（含随机交错 200 步收敛） |
| B2 清单 diff | 四分矩阵全过；字段与架构 §3.2 逐项对齐 | ✅ | test_manifest 64 例；冲突 = contentHash 不同且 lamport 相等；伪冲突 = contentHash 相同但元数据不同 |
| B3 chunker | 1MB 尾部变更 → 变更块 < 20%；空文件/不足 4KB/尾块边界正确 | ✅ | 尾部改 100B → **1/256 ≈ 0.4%**；边界三例全覆盖 |
| B4 队列 | 50 文件 FIFO 无丢失无重复；500 上限同路径合并 + 告警；损坏行容错 | ✅ | test_queue 34 例；8 线程×25 并发零撕裂；两段式 `clear` 重放中途强杀零丢失 |
| C1 覆盖率 | sync ≥ 85%；crypto 不跌破 100% 基线 | ✅ | **sync + crypto 合计 1283 语句 0 遗漏 = 100%** |
| C2 质量 | mypy/ruff 0 错误；crypto 151、端点 8/8、npm 333+、tsc 不回退 | ✅ | mypy 21 文件 0 错误；ruff 0 错误；crypto 151/151；端点 8/8；npm **334/334** ×3；tsc 0 错误 |
| D1 flaky | 修复后连跑 3 次全绿；npm 全量不回退 | ✅ | 334/334 ×3 连绿（基线 333 + 新增回归断言 1） |
| D2 宣发 | ≥3 平台发布，链接回写素材文档（待人工窗口） | ⏳ | 顺延 |
| D3 手动验证 | 三模式 + 预热提示 + 🔍🧠 前缀确认（待人工窗口） | ⏳ | 顺延（已连续三轮） |
| E1 清理 | 临时文件移除，tsc / npm 不受影响 | ✅ | 3 文件移除 + .gitignore 防复发；334/334 与 tsc 0 错误实证 |
| E2 报告 | 3 份报告 + CHANGELOG 条目 + 推送完成 + CI 绿钩 | 🔄 文档完成 | 文档已交付；推送 / CI 观察待提交后回填 |

## 三、关键数据

**质量门终验**：2026-07-21 02:00 起由主协调代理统一执行，全部通过。

| 指标 | 数值 |
|------|------|
| pytest `tests/sync/` + `tests/crypto/` | **389/389 全绿**（crypto 151 既有零回退 + sync 新增 238） |
| sync 新增测试分布 | test_paths 8 · test_config 33 · test_bootstrap 21 · test_manifest_mac 29 · test_lamport 26 · test_manifest 64 · test_chunker 23 · test_queue 34 |
| 覆盖率（sync + crypto 联合） | **100%**（1283 语句 0 遗漏；单包实测 chunker/queue/lamport/manifest 全满，远超 ≥85% 验收线） |
| mypy --strict | 0 错误（21 源文件：既有 11 + 新增 sync 9 + crypto/bootstrap 1） |
| ruff check（src + tests） | 0 错误 |
| 端点回归 `scripts/test_endpoints.py` | **8/8**（"All endpoint tests passed!"） |
| npm test（插件侧） | **334/334 ×3 连绿**（基线 333 + D1 新增回归断言 1） |
| tsc | 0 错误 |
| `remember-me-crypto selftest` | **4/4 PASS**（不受影响） |
| `sync/__init__.py` 公共 API | 主协调代理统一整合导出 **58 个符号** |

**B3 验收实证**：1MB 文件尾部修改 100 字节 → 变更块 **1/256 ≈ 0.4%**（验收线 < 20%）。
**B4 验收实证**：50 文件 FIFO 重放无丢失无重复；8 线程 × 25 条并发追加零撕裂；两段式 `clear` 重放中途强杀零丢失。

## 四、代码统计

| 位置 | 变更 | 说明 |
|------|------|------|
| `src/memory_engine/sync/` | +9 文件 | `__init__`（58 符号统一导出）/ `errors` / `paths` / `config` / `manifest_mac` / `lamport` / `manifest` / `chunker` / `queue` |
| `src/memory_engine/crypto/` | +1 文件 | `bootstrap.py`（首启 / 解锁 / 恢复码三流程） |
| `tests/sync/` | +8 文件（238 例） | test_paths / test_config / test_bootstrap / test_manifest_mac / test_lamport / test_manifest / test_chunker / test_queue |
| `packages/vscode-extension/src/utils/searchIndex.ts` | D1 修复 | `save()` 的 `updatedAt` 单调性修复（方案一） |
| `packages/vscode-extension/src/test/suite/searchIndexPersistence.test.ts` | +1 回归断言 | 只增强未放宽；333 → 334 |
| `.github/workflows/ci.yml` | CI 补丁 | Python 腿 pytest 步骤 `tests/crypto/` → `tests/crypto/ tests/sync/`（沿用 `becf80e` 条件化通道）；YAML 语法校验通过 |
| `.gitignore` | +2 规则 | `fix-*.js`、`*.ts.new`（E1 防复发） |
| 仓库清理 | −3 文件 | `git rm`：`packages/vscode-extension/fix-ext2.js`、`src/extension.ts.new`、`src/fix-ext2.js`（全仓检索零引用） |

## 五、设计决策与偏差记录

1. **manifest 签名与清单分离存储（`manifest.json.sig`）**：签名单存 JSON `{version, alg, mac}`，HMAC 覆盖磁盘精确字节，免除 JSON 规范化跨端不一致风险；`hmac.compare_digest` 常量时间比较防时序侧信道。
2. **`unlock` 加 `exists()` 守卫（A2 关键安全设计）**：错误口令绝不静默重派生并覆盖既有托管——口令路径先验证、失败即报错，绝不写回；配专测 `test_unlock_wrong_passphrase_never_rederives` 锁定该语义。
3. **双 key_id 托管（A2）**：master（32B，KDF 派生主密钥）与 recovery（16B，恢复码主密钥）分条目托管，恢复流程重建后互不覆盖；恢复码仅经返回值出层，绝不落盘 / 记日志（沿用 recovery.py 红线）。
4. **B4 队列收敛为单文件 `queue.jsonl`（计划原文 `queue/*.json` 的实现收敛）**：单文件 JSONL 追加 + 进程内 `threading.Lock` 保证原子性；`replay()` 只读快照与显式两段式 `clear()` 分离，重放中途强杀零丢失；500 条上限同路径合并保最新 + `logging.warning` 告警不崩溃（路线图 §6 既定）；损坏行跳过 + 告警。
5. **`contentHash` = 整文件明文 SHA-256（非密文哈希）**：GCM 随机 IV 使同明文每次密文不同，密文哈希跨端不可比；chunker 同趟输出 flat `content_hash` 与 Merkle 式根哈希，与 `FileVersion.contentHash` 三方同源（docstring 写明理由）。
6. **FileVersion camelCase 与 TS 接口逐字一致**：`filepath / lamport / deviceId / contentHash / modifiedAt` 与架构 §3.2 逐项对齐，为后续插件侧 / 端点侧 JSON 互通免除命名映射；清单模式 v1 canonical 序列化；`scan_sync_files` 枚举架构 §2.2 四类文件。
7. **D1 修复选方案一（单调性），放弃比较容差方案**：`save()` 的 `updatedAt = max(Date.now(), Math.ceil(最晚源文件 mtimeMs))`——`Math.ceil` 消除 `toISOString()` 整数毫秒截断与 `mtimeMs` 亚毫秒浮点之间的系统性落差；`load()` 严格比较不动，对 save 后真实更新零检测损失（容差方案会放宽真实过期检测）。与 `7c6bd3b` ProfileManager 修复同款范式。
8. **CI 补丁沿既定通道扩展**：`tests/sync/` 纯本地无新增依赖，直接并入 `becf80e` 条件化 pytest 步骤（3.12 必绿、3.14 金丝雀条件跳过），未开新通道。

## 六、风险跟踪（对照计划第七节）

| 计划风险 | 实际 |
|----------|------|
| 范围蔓延：4.2.2 提前启动部分越界做端点/worker | **未发生**——严格限定四个纯本地原语；worker / 端点 / 冲突引擎 / 云端适配器均未触碰 |
| 凌晨非交互会话 keyring 行为与桌面不一致 | **未发生**——07-20 已实证 `WinVaultKeyring` 凌晨可用；skipif + FileKeyStore 降级双通道保留 |
| manifest HMAC 与 FileKeyStore 的 MK 使用域冲突 | **未发生**——HKDF info 域分离（`remember-me:mk:v1`）既定；manifest 验签独立调用，不复用 keystore 内部密文 |
| 队列 JSONL 并发追加撕裂 | **未发生**——进程内锁 + 单行追加；8 线程×25 并发实证零撕裂；损坏行跳过 + 告警有测试覆盖 |
| D1 插件侧修复引入新时序问题 | **未发生**——334/334 ×3 连绿；改动独立可回退 |
| CI Python 3.14 金丝雀腿缺 sync 轮子 | **待观察**——tests/sync 纯本地无新增依赖、预期全腿可跑；推送后观察首次入 CI 表现 |
| 单轮 6h 做不完 A+B+C | **未发生**——02:00 启动，A / B / C / D1 / E1 全部闭环，质量门终验全绿（03:21 报告生成） |

## 七、阻塞与顺延

| 事项 | 状态 | 解锁条件 |
|------|------|----------|
| D2 社交媒体宣发（≥3 平台） | ⏳ 顺延 | 浏览器登录态（WebBridge）；素材已就绪（`docs/demo/social-media-2026-07-15.md`） |
| D3 VS Code 三模式搜索手动验证 | ⏳ 待人工 | 人工在 VS Code 界面操作（**已连续顺延三轮**，建议优先安排） |

## 七.五、CI 运行结论（推送后观察）

**提交时间线（本轮）**：`0173800`（feat: 4.2.1 收官 + 4.2.2 原语先行，含 E1 三个误提交文件删除）→ `473f635`（fix: D1 searchIndexPersistence flaky 单调性范式）→ `ea8386c`（ci: Python 腿纳入 tests/sync）→ `43574fb`（chore: .gitignore 防复发）→ `244943a`（docs: 报告 ×3 + CHANGELOG + 计划归档）。

**CI 补丁（已完成）**：`.github/workflows/ci.yml` Python 腿 pytest 步骤由 `tests/crypto/` 扩为 `tests/crypto/ tests/sync/`（沿用 `becf80e` 条件化通道：3.12 必绿、3.14 金丝雀条件跳过；sync 纯本地无新增依赖）；YAML 语法校验通过。

| 运行 | 提交 | 结果 |
|------|------|------|
| [29772390614](https://github.com/ltgkb/remember-me/actions/runs/29772390614) | `244943a` | **8/8 全绿**——tests/sync 首次入 CI 全腿通过（Python 3.12 win/ubuntu 必绿腿、3.14 金丝雀 win/ubuntu 全绿）；Node 18 windows 腿（原 D1 flaky 腿）修复后首轮即绿，零掷骰 |

**已知观察项（如实记录，非阻塞）**：

1. **`test_queue.py::TestIoErrors::test_compact_rewrite_failure_wrapped`** 并行开发期间曾被观察到失败 1 次（文件写入中途被并行代理观察），后续三次全量均通过——登记为观察项，若 CI 再现需跟进。
2. **`scripts/` 目录 4 处 ruff 既有问题**（`model_benchmark.py` 3 处 + `semantic_search_prototype.py` 1 处，引入于 `9590bc3`）——`src`/`tests` 范围 0 错误不受影响，建议下轮顺手清理。
3. **queue `enqueue` 全量读文件算深度**（500 条上界 O(n²)，容量测试约 20s）——真实断网编辑频率无感，worker 集成时可加内存缓存。
4. **单进程假设**：queue 进程内锁已保证线程安全；多进程并发属 4.2.2 正式窗口范围。

## 八、下轮建议

1. **Phase 4.2.2 正式窗口**：同步 worker 线程、`server.py` 端点接入（ManifestDiff 五分类即上传 / 下载 / 冲突路由输入已就位）、冲突策略引擎（LWW + 伪冲突自动收敛已就位，真冲突 UI 待插件侧）；
2. **D2 / D3 人工窗口优先**（D3 已连续顺延三轮）；
3. `scripts/` ruff 4 处清理（§七.五 观察项 2）；
4. **CI 推送后观察 tests/sync 首次入 CI 表现**（预期全腿可跑，3.14 金丝雀腿沿既定条件化通道）。

---

**编制**: 迭代开发系统（并行子代理 + 主协调代理统一整合终验）
**最后更新**: 2026-07-21 03:21 CST

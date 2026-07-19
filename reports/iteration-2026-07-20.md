# Remember Me — 迭代报告

**迭代日期**: 2026-07-20
**版本号**: v0.4.0-alpha（开发中，未发布）
**迭代类型**: Phase 4.2.1 本地加密层首轮冲刺
**执行方式**: 主代理统筹（A1 依赖分组 / 既有类型修复 / D1 CLI / 集成终验 / 报告）+ 4 个子代理（A2+A3、B2、B1、C1）
**报告生成时间**: 2026-07-20 03:15 CST

---

## 一、交付总览（对照 plan/iteration-2026-07-20.md）

| 任务 | 模块 | 优先级 | 状态 | 验证方式 |
|------|------|--------|------|----------|
| A1 sync 依赖分组 + crypto 包骨架 | `pyproject.toml` / `crypto/__init__.py` / `crypto/errors.py` | P0 | ✅ 完成 | 全量 8 项依赖一次安装成功（无需最小子集降级）；`from memory_engine import crypto` 冒烟通过 |
| A2 KDF 双路径 `kdf.py` | `crypto/kdf.py` | P0 | ✅ 完成 | pytest 28 例；Argon2id 实测 35.6ms |
| A3 AES-256-GCM `cipher.py` | `crypto/cipher.py` | P0 | ✅ 完成 | pytest 31 例；架构 §2.3 签名 100% 对齐 |
| B1 系统密钥环托管 `keystore.py` | `crypto/keystore.py` | P0 | ✅ 完成 | pytest 67 例；Windows Credential Locker 实测 + 跨进程免密恢复通过 |
| B2 BIP39 恢复码 `recovery.py` | `crypto/recovery.py` | P0 | ✅ 完成 | pytest 25 例；跨进程重建逐字节一致 |
| C1 `tests/crypto/` 测试套件 | `tests/crypto/`（5 文件） | P0 | ✅ 完成 | **151/151 全绿 ×2 遍；crypto 覆盖率 100%**（要求 ≥90%） |
| C2 静态检查与基线回归 | 全仓 | P0 | ✅ 完成 | mypy --strict 0 错误（11 文件）；ruff 0 错误；端点 8/8；npm test 333/333；tsc 0 错误 |
| D1 `remember-me-crypto selftest` | `cli.py` + pyproject scripts | P1 | ✅ 完成 | 4/4 项 PASS，退出码 0 |
| D2 社交媒体宣发（C2 收尾） | 运营 | P1 | ⏳ 顺延 | 需浏览器登录态（WebBridge），凌晨自动化会话不阻塞主线（计划风险表既定） |
| D3 VS Code 三模式搜索手动验证 | 插件 UI | P1 | ⏳ 待人工 | 需人工在 VS Code 界面操作（顺延自 07-18） |
| D4 迭代报告 ×3 + CHANGELOG + 推送 | `reports/` / `CHANGELOG.md` / git | P2 | ✅ 完成 | 本报告 + 日报 ×2 + `[0.4.0-alpha]` 章节 |

**范围纪律**：全程未触碰 `packages/vscode-extension/` 插件侧代码（npm test 333/333 仅作回归确认），未触网（除依赖安装与 git 推送），符合计划范围约束。

---

## 二、里程碑 4.2.1 验收标准对照（路线图 §3.2）

| 验收标准 | 结果 | 证据 |
|----------|------|------|
| 1. 架构 §2.3 encrypt/decrypt 语义 100% 落地，round-trip 全绿 | ✅ | `test_cipher.py` 31 例（空 / ASCII / 中文 UTF-8 / 全字节 / 1MB 随机） |
| 2. 密文或 AAD 任意篡改 → 抛认证错误，不返回明文 | ✅ | 1 bit 翻转（IV/密文体/tag 四区域）+ AAD filepath/version 篡改 + 截断（0/1/12/27B），全部 `CipherError` 且 `__cause__` 为 `InvalidTag` |
| 3. 同一明文两次加密 → IV 不同、密文不同 | ✅ | `test_cipher.py` IV 随机性用例 |
| 4. Windows Credential Locker 写入/读回/重启免密恢复 | ✅ | 本机实测（后端 `WinVaultKeyring`）：32B 密钥读回逐字节一致；**新 python 进程免密读回逐字节一致**；测试凭据已清理无残留 |
| 5. 恢复码可完整重建主密钥（跨进程模拟） | ✅ | 10 轮随机 + BIP39 官方向量（全零熵 ↔ abandon×11+about）+ 进程 A 生成 → 进程 B 重建逐字节相等 |
| 6. `mypy --strict` 0 错误；crypto 覆盖率 ≥ 90% | ✅ | mypy 11 文件 0 错误；覆盖率 **100%**（391/391 语句，6 模块全满） |

**附加验收（计划任务组内标准）**：KDF 双路径确定性 / 互异性 ✅；>3s 自动降级（假时钟注入）✅（本机 Argon2id 实测 35.6ms，远低于阈值）；`remember-me-crypto selftest` 4/4 PASS ✅。

## 三、关键数据

| 指标 | 数值 |
|------|------|
| Argon2id 派生耗时（64MB·3 遍历，本机） | **35.6 ms**（selftest 复测 36.1 / 42.7ms） |
| pytest `tests/crypto/` | **151 passed ×2 遍**（1.44s / 1.59s），0 skipped 0 failed |
| crypto 覆盖率 | **100%**（cipher 37/37、kdf 97/97、keystore 204/204、recovery 39/39、errors 7/7、__init__ 7/7） |
| mypy --strict | 0 错误（11 源文件，含 crypto 6 模块） |
| ruff check（src + tests） | 0 错误 |
| 端点回归 `test_endpoints.py` | **8/8 PASS**（/health、/extract、/search、/semantic-index、/semantic-search、400 校验、/hybrid-search ×2） |
| npm test（插件侧回归） | **333/333** passing（6s），未改插件代码 |
| tsc（插件侧回归） | 0 错误 |
| selftest 退出码 | 0（4/4 PASS） |

**依赖安装记录（全量 sync 分组一次成功，未走最小子集降级）**：cryptography 49.0.0 · argon2-cffi 25.1.0 · keyring 25.7.0 · mnemonic 0.21 · httpx · boto3 · tenacity · PyJWT 2.13.0；dev 分组：pytest 9.1.1 · pytest-cov 7.1.0 · mypy 2.3.0 · ruff 0.15.22。

## 四、代码统计

| 位置 | 变更 | 说明 |
|------|------|------|
| `src/memory_engine/crypto/` | +6 文件（约 700 行） | errors / __init__ / kdf / cipher / keystore / recovery |
| `tests/crypto/` | +5 文件（151 例） | conftest + test_kdf / test_cipher / test_keystore / test_recovery |
| `pyproject.toml` | +24/−4 | sync 分组、pytest-cov、`remember-me-crypto` scripts、mypy/ruff 目标 3.12 |
| `cli.py` | +145/−2 | `crypto_selftest_cmd`（懒加载 sync 依赖）；既有类型修复 |
| `vector_index.py` / `server.py` / `extractor.py` | −14 净 | 9 处 mypy 潜在问题 + ruff 未用导入/变量修复 |

## 五、设计决策与偏差记录

1. **mypy/ruff 目标 3.9 → 3.12（非计划原文的 3.11）**：计划 C2 授权「校正为 3.11 并记录理由」，实测 3.11 目标**无法解析** chromadb → numpy 的 3.12-only 类型存根（PEP 695 `Type` 语句），该链路对既有模块 `cli.py` 单独检查同样失败（配置滞后实证）；venv 统一 CPython 3.12.13、CI 矩阵 3.12/3.14，故直接钉 3.12。`requires-python` 未动（>=3.11 名义下限，CI 实测腿为 3.12+）。
2. **9 处既有 mypy 问题 + 7 处 ruff 问题修复**：旧 3.9 配置下 numpy 存根解析失败导致检查提前中止，「mypy 0 错误」基线实为未完整执行；新配置暴露后已全部修复（含 `vector_index.__main__` 缺 `import json` 真实缺陷；`cast(float, ...)` 替代失效 ignore）。属质量基线守护，非范围蔓延。
3. **`derive_master_key_auto` 返回 `AutoKdfResult`**（key + method + elapsed + downgraded）：auto 动态选路时调用方必须持久化实际 method 至 manifest，否则他端无法复现主密钥。`derive_master_key` 则**绝不暗中换法**（超时仍返回 Argon2id 结果 + WARNING 建议），避免已加密数据不可解密。
4. **KeyStore.delete 幂等**：清理/重置流程需无条件调用；keyring 原生 `PasswordDeleteError` 已专门捕获对齐 FileKeyStore 语义。
5. **三依赖自带 py.typed**（argon2-cffi 25.1 / mnemonic 0.21 / keyring 25.7），未加任何 `import-untyped` ignore（加了反触发 strict unused-ignore）。
6. **FileKeyStore 用 PBKDF2 而非 Argon2id**：降级文件威胁模型为离线爆破（口令 + 本机 ACL 防护），100k 迭代足够且启动零感知。
7. **selftest 懒加载 sync 依赖**：`crypto_selftest_cmd` 内函数级导入，base 安装（无 sync 分组）下 extract/search/backup-list 不受影响，守住「开源版零新增依赖」。

## 六、风险跟踪（对照计划第七节）

| 计划风险 | 实际 |
|----------|------|
| sync 全量依赖安装受阻 | **未发生**——8 项全部一次装上 |
| 凌晨自动化会话 Credential Locker 写入失败 | **未发生**——非交互会话下 `WinVaultKeyring` 可用且跨进程免密恢复通过，主路径无需「待人工复验」标记 |
| Argon2id 64MB 本机过慢 | **未发生**——35.6ms（阈值的 1.2%） |
| CI Python 3.14 金丝雀腿缺 keyring/argon2 轮子 | **已闭环**——CI 补丁 `becf80e` 按既定预案落地（条件跳过通道）；两轮运行 8/8 全绿（见 §七.五） |
| 单轮 6h 做不完 A+B+C | **未发生**——02:00 → 03:15 全部完成（含 D1），D2/D3 按计划既定顺延策略处理 |
| mypy 3.9 与 sync 存根不兼容 | **已发生并闭环**——见决策记录 1/2 |
| 宣发平台登录态失效 | 未验证——D2 顺延 |

## 七、阻塞与顺延

| 事项 | 状态 | 解锁条件 |
|------|------|----------|
| D2 社交媒体宣发（≥3 平台） | ⏳ 顺延 | 浏览器登录态（WebBridge）；素材已就绪（`docs/demo/social-media-2026-07-15.md`） |
| D3 VS Code 三模式搜索手动验证 | ⏳ 待人工 | 人工在 VS Code 界面操作（已连续顺延两轮，建议优先安排） |

## 七.五、CI 运行结论（推送后观察）

| 运行 | 提交 | 结果 |
|------|------|------|
| [29700232266](https://github.com/ltgkb/remember-me/actions/runs/29700232266) | `119c44e`（feat crypto 主提交） | ✅ **8/8 全绿**（Node 18/20 × ubuntu/windows + Python 3.12/3.14 × ubuntu/windows） |
| [29700467200](https://github.com/ltgkb/remember-me/actions/runs/29700467200) | `becf80e`（CI 补丁：Python 腿接入 crypto pytest） | ✅ **8/8 全绿**；3.12 腿 crypto pytest 步骤强制执行即 151 例在 CI 实跑通过；3.14 金丝雀腿按条件化策略执行（匿名 API 无法读日志，逐腿逐步骤明细标记为未核实） |

**CI 缺口修复记录**：主提交后发现 CI Python 腿只跑 `test_endpoints.py`、不含 pytest，`tests/crypto/` 151 例未纳入 CI。以 `becf80e` 补丁修复：新增 sync 子集安装步（`--only-binary :all:` + continue-on-error，沿用语义栈金丝雀先例）+ 可用性探针 + 条件化 pytest 步骤（3.12 必跑必绿，3.14 缺 wheel 时跳过并告警）。计划风险表「3.14 缺 keyring/argon2 轮子」一项至此有正式处置通道。

## 八、下轮建议

1. D2 宣发 + D3 手动验证（人工窗口，D3 已连续顺延两轮，建议优先）；
2. Phase 4.2.1 第二轮冲刺候选：manifest HMAC（MK 子密钥已就位）与 `.sync/` 目录约定落地、keystore 与 KDF/恢复码的首次绑定流程；或按路线图提前启动 4.2.2（Lamport 时钟 / chunker / 离线队列）——4.2.1 窗口尚余 11 天，裕度充足。

---

**编制**: 迭代开发系统（主代理 + 4 子代理）
**最后更新**: 2026-07-20 03:15 CST

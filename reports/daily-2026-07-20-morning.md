# Remember Me — 每日迭代报告（晨报）

**日期**: 2026-07-20（周一）
**版本**: v0.4.0-alpha（开发中，未发布）
**迭代阶段**: Phase 4.2.1 本地加密层 · 首轮冲刺
**开发窗口**: 凌晨 02:00 – 03:45 CST
**晨报编制时间**: 2026-07-20 08:00 CST（基于 git 历史与代码实测复核）

> 说明：凌晨开发会话已产出 `iteration-2026-07-20.md`、`daily-2026-07-20.md`、`daily-2026-07-20-detailed.md` 三份当日记录。本报告为晨报复核版，对代码变更逐项核验，不覆盖已有文件。

---

## 一、提交时间线（4 个提交，工作区干净）

| 提交 | 时间 | 内容 |
|------|------|------|
| `119c44e` | 03:14 | feat(crypto): Phase 4.2.1 本地加密层 — KDF 双路径 / AES-256-GCM / 密钥托管 / BIP39 恢复 |
| `becf80e` | 03:22 | ci: Python 腿接入 crypto pytest 套件（3.12 必跑，3.14 金丝雀条件化） |
| `6b6c9f3` | 03:28 | docs: CI 结果回写当日报告（两轮运行 8/8 全绿） |
| `8ea5f32` | 03:45 | docs: 记录 CI flaky 事件（searchIndexPersistence）+ 重跑成功，登记下轮 P1 修复 |

## 二、已完成功能

### 1. `crypto` 本地加密包（核心交付，纯本地、不触网）

`packages/memory-engine/src/memory_engine/crypto/` 新增 6 个模块，落地已评审云同步架构 §2：

| 模块 | 行数 | 功能 |
|------|------|------|
| `errors.py` | 44 | `CryptoError` 异常族（KDF / 加解密 / 托管 / 恢复）+ `SyncError` 起点 |
| `kdf.py` | 335 | 主密钥派生双路径：Argon2id（64MB·3 遍历）/ PBKDF2-SHA256（100k）；>3s 自动降级；HKDF 派生 DEK + MK 子密钥 |
| `cipher.py` | 144 | AES-256-GCM 文件级加解密，12B 随机 IV，`IV‖ct‖tag`，AAD=`filepath:version`，篡改必抛错 |
| `keystore.py` | 500 | KeyStore 抽象 + 系统密钥环后端（Windows Credential Locker 等）+ 加密密钥文件降级 + 工厂自动选路 |
| `recovery.py` | 136 | BIP39 12 词恢复码 ↔ 128-bit 主密钥，三层校验，中文友好报错 |
| `__init__.py` | 71 | 公共 API 统一导出 |

### 2. 测试套件 `tests/crypto/`（5 文件，151 例）

篡改检测（1 bit 翻转 / AAD 篡改 / 截断）、IV 随机性、KDF 假时钟降级、真实 Credential Locker 跨进程恢复、BIP39 官方向量等。**晨报复跑：151/151 通过（1.95s）**，crypto 包覆盖率 100%（要求 ≥90%）。

### 3. CLI 自检 `remember-me-crypto selftest`

串联 KDF → 加解密 → KeyStore → 恢复码。**晨报实测：4/4 PASS，退出码 0**，Argon2id 实测 36.4ms（远低于 3s 降级阈值）。sync 依赖懒加载，base 安装不受影响。

### 4. sync 依赖分组 + 质量基线守护

- `pyproject.toml` 新增 `sync` 可选分组 8 项（cryptography / argon2-cffi / keyring / mnemonic / httpx / boto3 / tenacity / PyJWT），一次安装成功；开源版零新增依赖。
- mypy 3.9 → 3.12、ruff py39 → py312；修复新配置暴露的 9 处既有 mypy 问题（含 `vector_index.__main__` 缺 `import json` 真实缺陷）+ 7 处 ruff 问题。
- 回归基线：mypy --strict 0 错误（11 文件）、ruff 0 错误、端点 8/8、npm test 333/333、tsc 0 错误。
- CHANGELOG 新增 `[0.4.0-alpha]` 章节。

### 5. CI 缺口闭环

主提交后发现 CI Python 腿只跑 `test_endpoints.py`、未含 pytest，151 例加密测试未纳入 CI。`becf80e` 补丁新增 sync 子集安装步（`--only-binary :all:`，3.14 缺 wheel 时条件跳过）+ 可用性探针 + 条件化 pytest 步骤，两轮 CI 运行 8/8 全绿。

## 三、遇到的问题与解决方案

| # | 问题 | 解决方案 | 状态 |
|---|------|----------|------|
| 1 | mypy 3.9/3.11 目标无法解析 chromadb→numpy 的 3.12-only 类型存根（PEP 695），旧「0 错误」基线实为检查提前中止 | 钉 3.12（与 venv/CI 一致），暴露的 16 处问题全部修复，理由写入 CHANGELOG | ✅ 闭环 |
| 2 | CI Python 腿未跑 pytest，crypto 151 例漏测 | `becf80e` 补丁：sync 子集安装 + 探针 + 条件化 pytest（3.12 必绿 / 3.14 条件跳过） | ✅ 闭环 |
| 3 | docs 提交触发 Node 18 Windows 腿 flaky：`searchIndexPersistence › load()` 因 mtime/updatedAt 毫秒精度边界误判索引过期，连续两次失败 | 定性为插件侧既有潜在缺陷（与本轮改动无关），Re-run failed jobs 后全绿；登记**下轮 P1 修复**（参照 `7c6bd3b` 单调性范式：updatedAt 不早于最晚源文件 mtime，或比较加 ≥1ms 容差） | ⚠️ 已登记，修复前 main 推送遇红重跑即可 |
| 4 | 计划风险项「非交互会话 Credential Locker 不可用」 | 未发生：`WinVaultKeyring` 凌晨会话实测可用，跨进程免密恢复逐字节一致 | ✅ 风险排除 |
| 5 | selftest 故意篡改触发 cipher WARNING 日志干扰输出 | 自检期间临时静默该 logger，测后恢复 | ✅ 闭环 |

## 四、代码变更统计

- 新增：`crypto/` 6 模块约 1,230 行 + `tests/crypto/` 5 文件约 1,167 行（合计 +2,397 行）
- 修改：`cli.py` +145（selftest 命令 + 类型修复）、`pyproject.toml` +24/−4、`vector_index.py`/`server.py`/`extractor.py` 净 −14（质量修复）
- 文档：`reports/` ×3、`plan/iteration-2026-07-20.md`、CHANGELOG `[0.4.0-alpha]`
- 合计主提交 23 文件、+3,227/−21

## 五、顺延事项

| 事项 | 状态 | 解锁条件 |
|------|------|----------|
| D2 社交媒体宣发（≥3 平台） | ⏳ 顺延 | 需浏览器登录态（WebBridge），素材已就绪 |
| D3 VS Code 三模式搜索手动验证 | ⏳ 待人工 | 需人工在 VS Code 界面操作（已连续顺延两轮，建议优先） |

## 六、下一步建议

1. **P1 修复 `searchIndexPersistence` flaky**（Windows 时间精度边界，范式已定）；
2. D2 宣发 + D3 手动验证（人工窗口）；
3. 下轮迭代候选：Phase 4.2.1 二轮冲刺（manifest HMAC / `.sync/` 目录约定 / keystore 首次绑定流程）或提前启动 4.2.2（Lamport 时钟 / chunker / 离线队列）——4.2.1 窗口余 11 天，裕度充足。

---

**编制**: Kimi Work 晨报复核（基于 git 历史 + 代码实测）
**复核动作**: 4 提交逐一核对 · crypto 测试复跑 151/151 · selftest 实测 4/4 · 工作区干净确认

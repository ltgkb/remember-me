# Remember Me — 开发迭代计划

**迭代日期**: 2026-07-20（凌晨 02:00 启动）  
**计划编制时间**: 2026-07-19 20:00 CST  
**迭代类型**: Phase 4.2.1 本地加密层首轮冲刺 + v0.3.0 发布收尾遗留  
**预估工时**: 6 小时（单轮迭代）  

---

## 一、当前进度总览（截至 2026-07-19 20:00）

### 1.1 已完成模块

| 阶段 | 模块 | 状态 | 关键交付物 |
|------|------|------|------------|
| Phase 1 MVP | 插件脚手架、JSON 存储、画像/项目/对话管理、6×AI 提供商、23 命令、首次使用向导 | ✅ 完成 | v0.1.0（2026-07-08） |
| Phase 2 核心 | 对话历史自动记录、关键信息提取、手动搜索、更新确认、多项目切换 | ✅ 完成 | v0.2.0（2026-07-10） |
| Phase 3 增强 | 8 场景模板系统、风格一致性检查、智能推荐、版本控制、搜索索引优化、模板市场 | ✅ 完成 | v0.3.0（2026-07-14） |
| Phase 4.1 语义搜索 | VectorIndex（ChromaDB + all-MiniLM-L6-v2）、语义/混合搜索端点、EngineClient 语义方法、搜索 UI 三模式切换 | ✅ 完成 | 端点测试 8/8；首查延迟 83.5ms < 200ms |
| 问题 #1 闭环 | 503 优雅降级兜底、SharedSystemClient 注册表清理、非 UTF-8 请求体 400 | ✅ 完成 | 故障注入验证通过（2026-07-18） |
| 环境统一 | `requires-python = ">=3.11,<3.14"`，.venv 统一 CPython 3.12.13 | ✅ 完成 | 冒烟测试通过 |
| 质量基线 | tsc 0 错误；npm test **333/333**（×3 次无 flaky）；test_endpoints.py 8/8 | ✅ 完成 | 2026-07-18 |
| CI | GitHub Actions 首跑三轮修复至 **8/8 全绿**（Node 18/20 × ubuntu/windows + Python 3.12/3.14） | ✅ 完成 | run 29678726011 |
| 产品发布 | **GitHub Release v0.3.0 已发布** 🎉 | ✅ 完成 | https://github.com/ltgkb/remember-me/releases/tag/v0.3.0 |
| 预研/设计 | 云端同步架构（07-16 已评审接受）、Phase 4.2 路线图（07-18） | ✅ 完成 | `docs/design/cloud-sync-roadmap-2026-07-18.md` |
| 工程规范 | 迭代收尾推送规则固化（CONTRIBUTING.md）、占位链接修正 | ✅ 完成 | commit `16b70a9` |

### 1.2 待办事项与遗留

| 需求 | 来源 | 当前状态 | 优先级与说明 |
|------|------|----------|--------------|
| **Phase 4.2.1 本地加密层启动** | PRD §7 Phase 4 / 4.2 路线图 §3.2 | ⏳ 待启动 | **P0** — 路线图窗口 2026-07-20 → 2026-07-31（2 周 56h），本轮执行首轮冲刺：依赖分组 + crypto 包四模块 + 测试 |
| **C2 社交媒体宣发执行** | 07-19 日报「下一步行动」 | ⏳ 素材就绪待发布 | **P1** — X 中文 / 即刻 / 小红书 ≥3 平台，需浏览器登录态（WebBridge），发布后回写素材文档 |
| **VS Code 三模式搜索手动验证** | 顺延自 07-18 | ⏳ 待人工 | **P1** — 状态栏预热提示、🔍🧠 混合结果前缀、模式持久化 |
| **仓库开启 Discussions** | 07-19 日报 | ⏳ 可选 | **P2** — Release 反馈帖暂以 Issues 代替 |

---

## 二、本次迭代目标

> **目标**：按已评审路线图正式启动 Phase 4.2.1 本地加密层——落地 `sync` 依赖分组与 `crypto` 包四大模块（KDF 双路径 / AES-256-GCM 加解密 / 系统密钥环托管 / BIP39 恢复码），配齐篡改检测与 round-trip 测试并通过 mypy --strict；同步闭环 v0.3.0 发布收尾遗留（社交媒体宣发、VS Code 三模式手动验证）。将 Phase 4.2 从"路线图就绪"推进到"加密层核心可验收"。

**范围约束**：本轮只做引擎侧（`packages/memory-engine`）纯本地加密能力，**不触网、不改插件侧代码**；同步协议（4.2.2）、云端适配器（4.2.3）、设置面板（4.2.4）不在本轮范围。

---

## 三、开发任务明细

### 任务组 A：Phase 4.2.1 启动 —— 加密层基础设施（优先级 P0）

#### A1. `sync` 依赖分组落地 + `crypto` 包骨架
- **优先级**: P0 🔴
- **负责模块**: `packages/memory-engine/pyproject.toml` + `packages/memory-engine/src/memory_engine/crypto/`
- **任务描述**:
  1. 按路线图 §2.3 新增 `[project.optional-dependencies]` `sync` 分组：`cryptography>=42.0`、`argon2-cffi>=23.1`、`keyring>=25.0`、`mnemonic>=0.21`、`httpx>=0.27`、`boto3>=1.34`、`tenacity>=8.2`、`PyJWT>=2.8`
  2. `.venv` 中执行 `pip install -e .[dev,sync]`（或 uv 等价命令）安装验证；若 boto3/httpx 等 4.2.2/4.2.3 才用的依赖安装受阻，**最小子集降级**：本轮实际仅需 `cryptography` + `argon2-cffi` + `keyring` + `mnemonic` 四项，其余保留声明即可
  3. 创建 `crypto/__init__.py` 包骨架，导出公共 API 占位；新增 `SyncError` / `CryptoError` 异常族起点（沿用 `vector_index.py` 的 `SemanticSearchError` 分层捕获惯例）
  4. 冒烟验证：`python -c "from memory_engine import crypto"` 可导入
- **预期产出**:
  - `pyproject.toml` sync 分组补丁
  - 依赖安装成功记录（实际安装版本清单）
  - `crypto/__init__.py` 可导入

#### A2. KDF 双路径实现 `crypto/kdf.py`
- **优先级**: P0 🔴
- **负责模块**: `packages/memory-engine/src/memory_engine/crypto/kdf.py`
- **任务描述**:
  1. `derive_master_key(passphrase, salt, method)`：双路径——`cryptography` 内置 PBKDF2-SHA256（100,000 迭代，兜底路径）/ `argon2-cffi` Argon2id（64MB 内存硬度、3 次遍历，高配路径），对应架构文档 §2.1
  2. `derive_subkeys(master_key)`：按架构 §2.1 派生 DEK（数据加密密钥）+ MK（manifest HMAC 密钥），HKDF info 字段分离
  3. 自适应降级：Argon2id 派生耗时 > 3s 时自动降级 PBKDF2 并记录日志（架构 §6 既定方针）
  4. salt 生成：`os.urandom(16)`，与密文分离存储约定写入 docstring
- **预期产出**:
  - `kdf.py`（含类型注解，满足 mypy --strict）
  - 双路径派生结果等价性说明（同一 passphrase+salt 两路径产出不同主密钥但各自确定性）

#### A3. AES-256-GCM 文件级加解密 `crypto/cipher.py`
- **优先级**: P0 🔴
- **负责模块**: `packages/memory-engine/src/memory_engine/crypto/cipher.py`
- **任务描述**:
  1. `encrypt_file(plaintext: bytes, key: bytes, filepath: str, version: int) -> bytes` / `decrypt_file(...) -> bytes`：函数签名与语义 100% 对齐架构 §2.3 示例
  2. 12 字节随机 IV（`os.urandom(12)`），密文格式 `IV || ciphertext || tag`；AAD = `f"{filepath}:{version}"` UTF-8 编码
  3. 篡改语义：密文或 AAD 任意改动 → 解密抛 `InvalidTag` 包装后的 `CryptoError`，**绝不返回部分明文**
  4. 文件级粒度约定对齐架构 §2.2 加密粒度表（`profile.json` / `context.json` / `conversations/*.json` 单文件加密）
- **预期产出**:
  - `cipher.py`（含 IV 随机性、round-trip 的模块内自证 docstring 示例）

---

### 任务组 B：密钥托管与恢复（优先级 P0）

#### B1. 系统密钥环托管 `crypto/keystore.py`
- **优先级**: P0 🔴
- **负责模块**: `packages/memory-engine/src/memory_engine/crypto/keystore.py`
- **任务描述**:
  1. `KeyStore` 抽象：`store(key_id, key)` / `load(key_id)` / `delete(key_id)` / `exists(key_id)`
  2. 首选后端：`keyring` → Windows Credential Locker（主密钥 32B，远低于 2.5KB/条上限）
  3. 降级后端：`keyring` 不可用/失败时 → 口令保护的加密密钥文件 `~/.remember-me/.sync/keystore.enc`（PBKDF2 + AES-GCM，复用 A2/A3），并在 docstring 明示降级路径安全等级差异（路线图 §6 风险表）
  4. 数据目录解析复用 `cli.py` 的 `_data_dir()` / `REMEMBER_ME_DATA_DIR` 环境变量约定，测试隔离零成本
  5. Windows 实测：主密钥写入/读回 Credential Locker，进程重启后免密恢复
- **预期产出**:
  - `keystore.py` 双后端实现
  - Windows Credential Locker 读写实测记录（写入报告）

#### B2. BIP39 恢复码 `crypto/recovery.py`
- **优先级**: P0 🔴
- **负责模块**: `packages/memory-engine/src/memory_engine/crypto/recovery.py`
- **任务描述**:
  1. 基于 `mnemonic` 库：主密钥（128 bit 熵）→ BIP39 12 词恢复码生成
  2. 反向重建：12 词恢复码 → 熵 → 主密钥，支持跨进程/跨设备模拟重建
  3. 输入校验：词表合法性、校验位验证，非法恢复码抛 `CryptoError` 友好提示
- **预期产出**:
  - `recovery.py`
  - 恢复码重建一致性自证（生成 → 重建 → 主密钥逐字节相等）

---

### 任务组 C：质量验证（优先级 P0）

#### C1. `tests/crypto/` 测试套件
- **优先级**: P0 🔴
- **负责模块**: `packages/memory-engine/tests/crypto/`
- **任务描述**:
  1. **round-trip**：`encrypt_file → decrypt_file` 还原明文（含空输入、1MB 大输入边界）
  2. **篡改检测**：密文改 1 bit / AAD 改 filepath 或 version → 必抛认证错误，不返回明文
  3. **IV 随机性**：同一明文同密钥两次加密 → IV 不同、密文不同
  4. **KDF 双路径**：确定性（同输入同输出）、双路径互不相同、降级逻辑单测（mock 耗时 > 3s）
  5. **KeyStore**：内存 fake 后端 + 降级加密密钥文件路径测试（`REMEMBER_ME_DATA_DIR` 指向 tmp 目录隔离）
  6. **恢复码**：生成/重建一致性、非法恢复码拒绝
  7. 覆盖率目标：crypto 包 **≥ 90%**（路线图 §3.2 验收标准 6）
- **预期产出**:
  - `pytest tests/crypto/` 全绿记录
  - 覆盖率数据（写入迭代报告）

#### C2. 静态检查与既有基线回归
- **优先级**: P0 🔴
- **负责模块**: `packages/memory-engine/`（全仓回归，插件侧仅确认不改动）
- **任务描述**:
  1. `mypy --strict` crypto 包 0 错误（注意 `pyproject.toml` 现有 `python_version = "3.9"` 配置，评估是否需要随 sync 依赖一并校正为 3.11/3.12，改动需记录理由）
  2. `ruff check` 0 错误
  3. 既有基线不回退：`python scripts/test_endpoints.py` 6~8 项全过；npm test 333/333（本次未改插件侧，跑一遍确认即可）
  4. 按 CONTRIBUTING 迭代收尾规则：提交并推送 main，观察 CI（Python 3.12/3.14 矩阵下 crypto 测试行为；3.14 金丝雀腿若 keyring/argon2 轮子缺失，走条件跳过并记录）
- **预期产出**:
  - mypy / ruff 零错误日志
  - 端点测试 + npm test 回归确认
  - 推送记录 + CI 运行结果（绿钩或已知问题清单）

---

### 任务组 D：发布收尾遗留与迭代闭环（优先级 P1/P2）

#### D1. CLI 自检命令 `remember-me-crypto selftest`
- **优先级**: P1 🟡
- **负责模块**: `packages/memory-engine/src/memory_engine/cli.py` + `pyproject.toml` scripts
- **任务描述**:
  1. 新增 `pyproject.toml` scripts 条目 `remember-me-crypto = "memory_engine.cli:crypto_selftest_cmd"`
  2. selftest 串联冒烟：KDF 派生 → 加解密 round-trip → KeyStore 存取 → 恢复码重建，逐项打印 PASS/FAIL
  3. 沿用 cli.py 现有命令风格（`extract_cmd` / `search_cmd` / `backup_list_cmd`）
- **预期产出**: `remember-me-crypto selftest` 全 PASS

#### D2. 社交媒体宣发执行（C2 收尾）
- **优先级**: P1 🟡
- **负责模块**: 运营 / `docs/demo/social-media-2026-07-15.md`
- **任务描述**:
  1. 按已备素材发布 ≥3 平台：X 中文（极简版）、即刻（功能亮点版）、小红书（场景痛点版）；需浏览器登录态，经 WebBridge 操作
  2. 发布链接回写素材文档末尾「发布记录」表
- **预期产出**: ≥3 平台实际发布链接 + 素材文档更新

#### D3. VS Code 三模式搜索手动验证（顺延自 07-18）
- **优先级**: P1 🟡（需人工在 VS Code 界面操作）
- **负责模块**: `packages/vscode-extension` UI
- **任务描述**:
  1. 启动 memory-engine，观察状态栏从「🧠 语义模型预热中…」到正常的过渡
  2. 关键词 / 语义 / 混合三模式切换与持久化（`search-settings.json`）
  3. 混合搜索结果展示 `🔍🧠` 前缀与 hybrid_scores
- **预期产出**: 手动验证记录（写入日报）

#### D4. 迭代报告 + CHANGELOG + 推送
- **优先级**: P2 🟡
- **负责模块**: `reports/` + `CHANGELOG.md` + git
- **任务描述**:
  1. `reports/iteration-2026-07-20.md`：任务对照表、crypto 验收数据、覆盖率、CI 结论
  2. `reports/daily-2026-07-20.md` + `reports/daily-2026-07-20-detailed.md`（含 D2/D3 执行记录、下一步行动）
  3. `CHANGELOG.md` 新增 `[0.4.0-alpha]`（Unreleased）章节，登记 Phase 4.2.1 首轮交付
  4. 按迭代收尾规则推送 main
- **预期产出**: 3 份报告 + CHANGELOG 条目 + 推送记录

---

## 四、任务优先级矩阵

```
           紧急程度
           高 ←————————→ 低
           ┌─────────┬─────────┐
     高   │ A1 A2   │   D1    │
     重   │ A3 B1   │   D2    │
     要   │ B2 C1   │   D3    │
     性   │ C2 (P0) │  (P1)   │
           ├─────────┼─────────┤
     低   │   —     │   D4    │
           │         │  (P2)   │
           └─────────┴─────────┘
```

---

## 五、执行顺序建议（时间线）

```
02:00 ─┬─ 环境盘点：git status + .venv 确认 + 回顾 07-19 日报「下一步行动」
       │
02:10 ─┬─ 【A1】sync 依赖分组 + crypto 包骨架（安装受阻走最小子集降级）
       │
02:40 ─┬─ 【A2】kdf.py KDF 双路径 + 自适应降级
       │
03:30 ─┬─ 【A3】cipher.py AES-256-GCM（对齐架构 §2.3 签名）
       │
04:10 ─┬─ 【B1】keystore.py keyring 后端 + 加密密钥文件降级（Windows 实测）
       │
04:50 ─┬─ 【B2】recovery.py BIP39 12 词恢复码
       │
05:20 ─┬─ 【C1】tests/crypto/ 六项测试 + 覆盖率 ≥90%
       │
06:20 ─┬─ 【C2】mypy --strict / ruff / 端点测试 + npm test 回归
       │
06:50 ─┬─ 【D1】remember-me-crypto selftest CLI
       │
07:00 ─┬─ 【D2】社交媒体宣发 ≥3 平台（WebBridge 登录态）
       │    【D3】VS Code 三模式手动验证（可并行/标记待人工）
       │
07:30 ─┬─ 【D4】迭代报告 3 份 + CHANGELOG 0.4.0-alpha + 推送 main
       │
08:00 ── 迭代结束，最终检查（git diff + 测试确认 + CI 观察）
```

---

## 六、验收标准

| 检查项 | 标准 | 验证方式 |
|--------|------|----------|
| A1 依赖分组 | `pyproject.toml` sync 分组按路线图 §2.3 落地；`pip install -e .[dev,sync]` 成功（或最小子集降级有记录） | 安装日志 |
| A2 KDF | PBKDF2 100k / Argon2id 64MB·3 遍历双路径确定性；>3s 自动降级 | pytest + 日志 |
| A3 加解密 | 架构 §2.3 语义 100% 落地；AAD = `filepath:version`；篡改必抛错不返回明文 | pytest 篡改用例 |
| B1 密钥托管 | Windows Credential Locker 写入/读回/重启免密恢复通过；keyring 失败降级加密密钥文件可用 | Windows 实测 |
| B2 恢复码 | 12 词恢复码跨进程重建主密钥逐字节相等；非法恢复码拒绝 | pytest |
| C1 测试 | `pytest tests/crypto/` 全绿；crypto 包覆盖率 ≥ 90% | pytest-cov |
| C2 质量 | mypy --strict 0 错误；ruff 0 错误；test_endpoints.py 不回退；npm test 333/333 不回退 | 命令行 |
| D1 CLI | `remember-me-crypto selftest` 全 PASS | 命令行 |
| D2 宣发 | ≥3 平台发布，链接回写素材文档 | 平台链接 |
| D3 手动验证 | 三模式切换 + 预热提示 + 🔍🧠 前缀确认 | 人工记录 |
| D4 报告 | 3 份报告 + CHANGELOG 条目 + 推送完成 | 文档审查 |

---

## 七、风险与应对

| 风险 | 可能性 | 影响 | 应对 |
|------|--------|------|------|
| sync 全量依赖安装受阻（boto3/httpx 体积大或网络问题） | 中 | A1 延迟 | 最小子集降级：本轮仅需 cryptography + argon2-cffi + keyring + mnemonic；其余保留声明、安装记录写入报告 |
| 凌晨自动化会话无交互桌面，Windows Credential Locker 写入失败/策略限制 | 中 | B1 主路径受阻 | 降级加密密钥文件路径必须同步实现并测试；主路径标记「待人工桌面会话复验」，不阻塞迭代 |
| Argon2id 64MB 内存硬度在本机过慢 | 低 | A2 验收受阻 | 耗时 > 3s 自动降级 PBKDF2 的设计本身就是应对方案；实测数据写入报告 |
| keyring / argon2-cffi 在 CI Python 3.14 金丝雀腿缺 wheel | 中 | C2 CI 黄灯 | 参照语义栈先例：条件跳过 + 已知问题记录；3.12 腿必须全绿 |
| 单轮 6h 做不完 A+B+C 全部 | 中 | 任务挤压 | 保底顺序 A1→A2→A3→C1（加密核心+测试）→ B1→B2 → C2 → D 组；07:00 时 D2/D3 未启动则顺延下轮 |
| mypy `python_version = "3.9"` 与 sync 依赖类型存根不兼容 | 低 | C2 报错 | 校正为 3.11 并记录理由（requires-python 已钉 >=3.11，属配置滞后） |
| 宣发平台登录态失效 | 中 | D2 受阻 | 不阻塞主线；标记待人工，素材与链接占位保持就绪 |

---

## 八、相关文档与代码入口

- **PRD 需求**: `docs/PRD.md`（§5.2 Pro 版云端同步、§7 Phase 4 里程碑）
- **Phase 4.2 路线图**: `docs/design/cloud-sync-roadmap-2026-07-18.md`（§2 选型、§3.2 里程碑 4.2.1、§6 风险表）⭐ 本轮直接依据
- **架构依据**: `docs/design/cloud-sync-architecture-2026-07-16.md`（§2.1 KDF、§2.2 加密粒度、§2.3 加解密示例）
- **上轮计划/报告**: `plan/iteration-2026-07-18.md`、`reports/daily-2026-07-19.md`（待办来源）
- **工程配置**: `packages/memory-engine/pyproject.toml`
- **引擎代码**: `packages/memory-engine/src/memory_engine/`（`cli.py` / `server.py` / `vector_index.py` 异常分层惯例）
- **端点测试**: `packages/memory-engine/scripts/test_endpoints.py`
- **宣发素材**: `docs/demo/social-media-2026-07-15.md`
- **推送规则**: `docs/CONTRIBUTING.md`「迭代收尾规则」
- **仓库**: https://github.com/ltgkb/remember-me（v0.3.0 已发布）

---

**计划版本**: v1.0  
**编制者**: 迭代计划系统  
**最后更新**: 2026-07-19 20:00 CST

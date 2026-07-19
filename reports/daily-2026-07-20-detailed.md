# Remember Me — 详细日报

**日期**: 2026-07-20（周一）
**版本**: v0.4.0-alpha（开发中，未发布）
**迭代阶段**: Phase 4.2.1 本地加密层首轮冲刺
**开发窗口**: 02:00 – 03:15 CST
**执行结构**: 主代理（A1 / 既有类型修复 / D1 / 集成终验 / 报告）+ 4 并行子代理（A2+A3、B2、B1、C1）
**报告生成时间**: 2026-07-20 03:15 CST

---

## 一、执行时间线

```
02:00  环境盘点：git status / .venv 确认（CPython 3.12.13）/ 回顾 07-19 日报与今日计划
02:10  【A1】pyproject sync 分组 + crypto 包骨架（errors.py 异常族 + __init__ 占位）
02:20  uv 全量安装 .[dev,sync] 一次成功（8 项 sync + pytest-cov 新增）；冒烟导入通过
02:25  【并行】子代理1 = A2 kdf.py + A3 cipher.py；子代理2 = B2 recovery.py
02:45  两子代理交付；主代理修复 mypy 3.12 暴露的 9 处既有问题 + ruff 7 处
02:55  【B1】子代理3 = keystore.py（Windows 实测 Credential Locker + 跨进程免密恢复）
03:00  【并行】子代理4 = C1 tests/crypto/ 151 例；主代理 = D1 selftest CLI
03:10  C1 交付（覆盖率 100%）；selftest 4/4 PASS；公共 API 导出收尾
03:15  C2 全量回归（mypy/ruff/端点 8/8/npm 333/tsc）→ 报告与 CHANGELOG → 推送
```

计划时间线对照：各环节均显著提前（计划 C1 05:20 完成，实际 03:10），无保底降级发生。

## 二、环境与依赖记录

| 项 | 值 |
|----|----|
| Python | CPython 3.12.13（`.venv`，uv 0.11.21 管理） |
| sync 依赖（实测安装版本） | cryptography **49.0.0** · argon2-cffi **25.1.0** · keyring **25.7.0** · mnemonic **0.21** · httpx · boto3 · tenacity · PyJWT **2.13.0** |
| dev 新增 | pytest **9.1.1** · pytest-cov **7.1.0** · mypy **2.3.0** · ruff **0.15.22** |
| py.typed 实证 | argon2-cffi / mnemonic / keyring 均自带 → 未加任何 `import-untyped` ignore |
| keyring 后端 | `WinVaultKeyring`（凌晨非交互自动化会话**可用**，计划风险表该场景未发生） |

## 三、模块交付明细

### 3.1 `crypto/errors.py`（主代理，A1）

异常层级：`RuntimeError` → `CryptoError`（`KeyDerivationError` / `CipherError` / `KeyStoreError` / `RecoveryError`）；`SyncError` 独立分支（4.2.2/4.2.3 用）。沿用 `SemanticSearchError`「业务异常携带面向用户提示、上层降级、绝不穿透处理器」惯例。

### 3.2 `crypto/kdf.py`（子代理1，A2）

```python
def generate_salt() -> bytes                                    # os.urandom(16)
def derive_master_key(passphrase, salt, method="argon2id", *, clock=perf_counter) -> bytes
def derive_master_key_auto(passphrase, salt, *, clock=perf_counter) -> AutoKdfResult
def derive_subkeys(master_key: bytes) -> Subkeys                # frozen dataclass(dek, mk)
```

- Argon2id：`low_level.hash_secret_raw`，memory=65536 KiB、time=3、parallelism ≤4、32B 输出、Type.ID
- PBKDF2：cryptography `PBKDF2HMAC` SHA-256 ×100,000、32B
- 降级语义分工：`derive_master_key` 超时**仍返回 Argon2id 结果** + WARNING（不暗中换法，保护既有密文可解密）；`derive_master_key_auto` 面向首次初始化，探测 >3s 则弃探测结果改 PBKDF2 重派生，返回 `AutoKdfResult(key, method, elapsed_seconds, downgraded)` —— method 必须随 salt 持久化到 manifest，否则他端无法复现
- HKDF 子密钥：`info=b"remember-me:dek:v1"` / `b"remember-me:mk:v1"` 域分离；salt=None（主密钥已是高熵 KDF 输出，RFC 5869 §3.3）
- 实测耗时：**35.6ms**（阈值 3s 的 1.2%）

### 3.3 `crypto/cipher.py`（子代理1，A3）

```python
def encrypt_file(plaintext: bytes, key: bytes, filepath: str, version: int) -> bytes
def decrypt_file(ciphertext: bytes, key: bytes, filepath: str, version: int) -> bytes
```

- 格式 `IV(12B) ‖ ciphertext ‖ tag(16B)`；AAD = `f"{filepath}:{version}".encode()`；密钥非 32B → `CipherError`
- 密文 < 28B → `CipherError`（非 IndexError）；`InvalidTag` 包装为中文提示并记 WARNING（仅 filepath+version，不含内容）；无任何容错开关

### 3.4 `crypto/keystore.py`（子代理3，B1）

```python
class KeyStore(ABC): store / load / delete / exists             # delete 幂等
class KeyringKeyStore(KeyStore): is_available() -> bool         # 真实读写探测 + 进程内缓存
class FileKeyStore(KeyStore): __init__(passphrase, data_dir=None)
def get_keystore(prefer_keyring=True, fallback_passphrase=None, data_dir=None) -> KeyStore
```

- keyring：service `"remember-me"`，key hex 编码（32B → 64 字符 ≪ 2.5KB 上限）
- 文件格式：`{"version":1,"salt":"<hex>","entries":{"<key_id>":"<hex 密文>"}}`；每 entry 独立 `encrypt_file`，AAD 绑定 `f"keystore:{key_id}"`（跨条目搬移即解密失败）；同目录临时文件 + `os.replace` 原子写；`0o600` 尽力而为（Windows 靠 NTFS ACL，docstring 明示）
- 安全等级差异已按路线图 §6 写入 docstring：密钥环 = OS 级 DPAPI 免密；降级文件 = 仅口令 PBKDF2、可离线爆破，仅作兜底
- **Windows 实测**（全部实跑）：store/load 32B 逐字节一致；**跨进程免密读回一致**；非法长度拦截；delete 幂等清理无残留；FileKeyStore 全链路 + 坏口令（`__cause__`=CipherError）+ 截断损坏；工厂双路径选路

### 3.5 `crypto/recovery.py`（子代理2，B2）

```python
def generate_master_key() -> bytes                  # os.urandom(16)
def to_recovery_code(master_key: bytes) -> list[str]
def from_recovery_code(words: Sequence[str]) -> bytes
def generate_recovery() -> tuple[bytes, list[str]]
```

- 128-bit 熵 ↔ 12 词（+4bit 校验）；与 KDF 32B 主密钥是**两条独立获取路径**（docstring 明示）
- 三层校验：词数 → 词表（strip/lower 归一化后）→ `Mnemonic.check` 校验位；全部中文提示且指出非法词
- 日志红线：绝不打印恢复码/主密钥内容（含指纹）

### 3.6 `tests/crypto/`（子代理4，C1）— 151 例

| 文件 | 用例 | 要点 |
|------|------|------|
| `test_kdf.py` | 28 | 双路径确定性/互异、假时钟（0→4.0s）降级且与纯 PBKDF2 逐字节一致、恰好 3.0s 不降级边界、caplog WARNING、HKDF 域分离 |
| `test_cipher.py` | 31 | 1MB round-trip、布局断言、四区域 1bit 翻转 + AAD 篡改 + 截断均 `CipherError`（`__cause__`=InvalidTag）、IV 随机性 |
| `test_keystore.py` | 67 | InMemoryKeyStore 契约 12；FileKeyStore 30（落点 `tmp/.sync/keystore.enc`、AAD 防搬移、写盘失败清理 tmp）；KeyringKeyStore 9（skipif 条件跳过 + finally 清理）；工厂 6 |
| `test_recovery.py` | 25 | 10 轮随机 + BIP39 官方向量 + **预验证固定非法向量**（abandon×12 等，规避 1/16 校验位误中 flaky） |
| `conftest.py` | — | `random_key` / `key_factory` / `tmp_data_dir`（monkeypatch `REMEMBER_ME_DATA_DIR`） |

覆盖率：**100%**（391/391 语句，6 模块全满；含 monkeypatch 确定性覆盖的底层失败分支）。CI 无桌面环境 keyring 用例自动 skipif（覆盖率影响 ~2 行，仍 ≥90%）。

### 3.7 `remember-me-crypto selftest`（主代理，D1）

```
[PASS] KDF 双路径派生 + 子密钥分离 — argon2id 耗时 36.1ms
[PASS] AES-256-GCM round-trip + 篡改检测 — round-trip 一致，篡改已正确拒绝
[PASS] KeyStore 存取 — 系统密钥环
[PASS] BIP39 恢复码生成/重建 — 重建逐字节一致，非法输入已拒绝
自检完成: 4/4 项通过        （退出码 0）
```

工程细节：crypto 依赖**函数级懒加载**（ImportError → 中文引导 + exit 2），base 安装其他命令零影响；stdout/stderr 强制 UTF-8（07-19 CI cp1252 教训同款处理）；故意篡改触发 cipher WARNING 期间临时静默该 logger 后恢复；KeyStore 测试 key_id 带 uuid 后缀且 finally 清理，降级路径用 `TemporaryDirectory` 不污染真实 `~/.remember-me`。

## 四、质量基线守护记录（计划外发现，计划内闭环）

**发现**：两个子代理独立报告——规定门槛命令 `mypy src/memory_engine/crypto/`（py311 配置）**必然失败**：venv 内 numpy 存根使用 PEP 695 `Type` 语句（3.12-only），经 `memory_engine/__init__.py` → vector_index → chromadb → numpy 链路触发语法级解析失败（`--follow-imports=silent` 无法抑制）。对既有 `cli.py`、`errors.py` 单独检查同样失败 → 证实为**既有配置滞后**，且说明 07-18「mypy 0 错误」基线实为检查提前中止、从未完整执行。

**处置**（计划 C2 授权范围内，3.11 → 调整为 3.12 并记录理由）：

| 文件 | 修复 |
|------|------|
| `pyproject.toml` | mypy `python_version` 3.9→3.12；ruff `target-version` py39→py312 |
| `vector_index.py` | `__main__` 缺 `import json`（**真实缺陷**）补顶部导入；删 4 处失效 `type: ignore[import-untyped]`（chromadb/st 现可解析） |
| `server.py` | 删 2 处失效 ignore；备份排序 `cast(float, b["timestamp"])` 替代失效 `ignore[arg-type]`；删未用导入 |
| `cli.py` | 同款排序修复；删未用变量 `suffix`、未用导入 |
| `extractor.py` | 删未用变量 `definition`（group(2) 捕获本就未消费，行为不变） |

终态：`mypy --strict` **0 错误（11 源文件）**；`ruff check src/ tests/` **0 错误**。

## 五、回归验证终态（03:10–03:15 主代理终验）

| 项 | 命令 | 结果 |
|----|------|------|
| mypy | `mypy src/memory_engine/` | Success: no issues in 11 files |
| ruff | `ruff check src/ tests/` | All checks passed |
| pytest | `pytest tests/crypto/ -q` ×2 | 151 passed（1.44s / 1.59s） |
| 覆盖率 | `--cov=memory_engine.crypto --cov-fail-under=90` | **100.00%** |
| 端点 | 起服 8765 + `scripts/test_endpoints.py` | **8/8 PASS**（含 hybrid 退化分支） |
| npm | `npm test`（插件侧，未改码） | **333 passing**（6s） |
| tsc | `npm run compile` | 0 错误 |
| selftest | `remember-me-crypto selftest` | 4/4，exit 0 |
| CI 主提交 | run 29700232266（`119c44e`） | **8/8 全绿** |
| CI 补丁 | run 29700467200（`becf80e`，Python 腿接入 crypto pytest） | **8/8 全绿**（3.12 腿 pytest 强制实跑通过） |

**CI 缺口修复**：主提交后发现 CI Python 腿只跑 `test_endpoints.py`、`tests/crypto/` 未纳入 → `becf80e` 补丁新增 sync 子集安装步（`--only-binary :all:` + continue-on-error）+ 探针 + 条件化 pytest 步骤（3.12 必跑必绿；3.14 缺 wheel 跳过并告警，沿用语义栈金丝雀先例）。

## 六、D2 / D3 顺延说明（计划风险表既定策略）

- **D2 宣发**：素材已就绪（`docs/demo/social-media-2026-07-15.md`，占位链接已于 07-19 替换为实际链接）。发布需浏览器登录态（WebBridge），凌晨自动化会话执行登录/验证码风险高，按计划「不阻塞主线、标记待人工」处理。
- **D3 三模式手动验证**：本质是人工 VS Code 界面操作（状态栏预热提示 / 🔍🧠 前缀 / 模式持久化），自动化无法替代，顺延自 07-18，建议下个窗口优先人工执行。

## 七、下轮候选任务

1. D2 + D3 人工窗口执行（D3 已连续顺延两轮，建议优先）；
2. Phase 4.2.1 二轮冲刺：manifest HMAC（MK 已就位）+ `.sync/` 目录约定 + keystore 与 KDF 路径整合（passphrase → master key → 托管/恢复码首次绑定流程）；
3. 或按路线图提前启动 4.2.2：`sync/lamport.py` / `sync/chunker.py` / `sync/queue.py`（4.2.1 窗口余 11 天，裕度充足）。

---

**编制**: 迭代开发系统（主代理 + 4 子代理）
**最后更新**: 2026-07-20 03:15 CST

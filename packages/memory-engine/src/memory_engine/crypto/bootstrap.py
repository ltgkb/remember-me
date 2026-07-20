"""首次绑定与解锁流程 — passphrase → 主密钥 → 托管 / 恢复码的整合闭环。

实现迭代计划 A2，把 Phase 4.2.1 首轮的四个独立原语（KDF / KeyStore / 恢复码 /
同步配置）整合为三条面向上层（设置面板 / 同步 worker）的生命周期流程：

* :func:`bootstrap_first_run`  首次启用：口令探测式派生主密钥 → method+salt
  持久化至 ``.sync/config.json``（07-20 决策记录 3：method 必须持久化，
  否则他端无法复现）→ 主密钥托管 → 生成 12 词恢复码；
* :func:`unlock`               常规解锁：托管读回优先；无条目 / 后端读失败 →
  口令经持久化的 method+salt 重派生（绝不暗中换 KDF 方法）→ 重新托管；
* :func:`unlock_with_recovery` 恢复码重建：12 词 → 恢复码路径主密钥 → 重新托管。

密钥托管条目约定（``crypto.keystore`` 的 ``key_id``）：

* ``master``   32 字节 KDF 路径主密钥（日常解锁用，``derive_subkeys`` 的输入）；
* ``recovery`` 16 字节恢复码路径主密钥（``crypto.recovery`` 既定「两条独立
  获取路径」之一）。托管它的理由：路线图 §6 主密钥丢失缓解 ③「设置面板
  重新查看恢复码（需重新输入口令）」要求能从托管中重新编码出同一组助记词；
  用户离线保存的恢复码则是同一密钥的独立副本，两条路径互为冗余。

恢复码出层红线：**12 词恢复码仅经 :class:`BootstrapResult` 返回值出层一次**，
绝不落盘、绝不记日志（含任何前缀指纹）——日志纪律沿用 ``crypto.recovery``，
本模块仅记录方法标识、后端类型、密钥长度与操作结果。

重复初始化防护：``.sync/config.json`` 已含 KDF 参数或托管中已存在主密钥时，
:func:`bootstrap_first_run` 直接抛错——重复首启会轮换 salt 导致既有密文
永久不可解密，必须显式失败而非静默覆盖。

本模块位于 ``crypto`` 包但依赖 ``sync.config`` / ``sync.paths``（计划 A2 既定
落点）；单向依赖无环：``sync`` 各模块不反向导入 ``crypto.bootstrap``，
``crypto/__init__`` 亦不 re-export 本模块（避免包初始化阶段的循环导入，
调用方请以 ``memory_engine.crypto.bootstrap`` 路径导入）。
"""

from __future__ import annotations

import logging
import time
from dataclasses import dataclass
from pathlib import Path
from typing import Literal, Sequence

from ..sync.config import load_config, load_or_create_config, save_config
from .errors import CryptoError, KeyStoreError
from .kdf import (
    ClockFn,
    KdfMethod,
    derive_master_key,
    derive_master_key_auto,
    generate_salt,
)
from .keystore import KeyStore, KeyringKeyStore, get_keystore
from .recovery import from_recovery_code, generate_recovery

logger = logging.getLogger("memory_engine.crypto.bootstrap")

__all__ = [
    "MASTER_KEY_ID",
    "RECOVERY_KEY_ID",
    "BackendName",
    "UnlockSource",
    "BootstrapResult",
    "UnlockResult",
    "RecoveryUnlockResult",
    "bootstrap_first_run",
    "unlock",
    "unlock_with_recovery",
]

MASTER_KEY_ID = "master"
"""KDF 路径主密钥在 KeyStore 中的 ``key_id``（32 字节）。"""

RECOVERY_KEY_ID = "recovery"
"""恢复码路径主密钥在 KeyStore 中的 ``key_id``（16 字节）。"""

BackendName = Literal["keyring", "file"]
"""托管后端标识：系统密钥环 / 降级加密密钥文件。"""

UnlockSource = Literal["keystore", "passphrase"]
"""解锁来源：托管直接读回 / 口令经持久化参数重派生。"""


@dataclass(frozen=True)
class BootstrapResult:
    """:func:`bootstrap_first_run` 的结构化结果。

    Attributes:
        master_key: 32 字节 KDF 路径主密钥（仅存于内存，已由 KeyStore 托管）。
        recovery_words: 12 词 BIP39 恢复码——**仅经此字段出层一次**，
            上层须立即展示并引导用户离线保存，绝不落盘 / 记日志。
        method: 实际使用的 KDF 方法（已连同 salt 持久化至 ``.sync/config.json``）。
        downgraded: 是否发生 Argon2id → PBKDF2 自动降级（供上层提示低端设备）。
        keystore_backend: 托管后端（``"keyring"`` 系统密钥环 / ``"file"``
            降级密钥文件；后者安全等级较低，供上层按路线图 §6 明示用户）。
        device_id: 本设备 UUID4 标识（首次启动生成并持久化）。
    """

    master_key: bytes
    recovery_words: list[str]
    method: KdfMethod
    downgraded: bool
    keystore_backend: BackendName
    device_id: str


@dataclass(frozen=True)
class UnlockResult:
    """:func:`unlock` 的结构化结果。

    Attributes:
        master_key: 32 字节 KDF 路径主密钥。
        source: 解锁来源（``"keystore"`` 托管读回 / ``"passphrase"`` 口令重派生）。
        keystore_backend: 托管后端标识。
    """

    master_key: bytes
    source: UnlockSource
    keystore_backend: BackendName


@dataclass(frozen=True)
class RecoveryUnlockResult:
    """:func:`unlock_with_recovery` 的结构化结果。

    Attributes:
        master_key: 16 字节恢复码路径主密钥（与恢复码逐字节对应）。
        keystore_backend: 重新托管的后端标识。
        restored: 重新托管成功标记（托管失败会抛异常，能返回即为 ``True``）。
    """

    master_key: bytes
    keystore_backend: BackendName
    restored: bool


def _backend_name(store: KeyStore) -> BackendName:
    """返回托管后端标识，供上层按安全等级差异提示（路线图 §6 既定）。"""
    if isinstance(store, KeyringKeyStore):
        return "keyring"
    return "file"


# ---------------------------------------------------------------------------
# 首次启用
# ---------------------------------------------------------------------------
def bootstrap_first_run(
    passphrase: str,
    data_dir: Path | None = None,
    *,
    clock: ClockFn = time.perf_counter,
) -> BootstrapResult:
    """首次启用：口令 → 主密钥 → 持久化 KDF 参数 → 托管 → 恢复码。

    流程（顺序即计划 A2 既定）：

    1. 读取或创建 ``.sync/config.json``（deviceId 首次生成 UUID4 并落盘）；
    2. 重复初始化防护：配置已含 KDF 参数或托管中已有主密钥 → 抛错；
    3. ``generate_salt()`` + :func:`derive_master_key_auto` 探测式派生
       32 字节主密钥（Argon2id 超时自动降级 PBKDF2）；
    4. 实际 method 与 salt 成对持久化至 ``.sync/config.json``
       （07-20 决策记录 3：他端凭此复现同一主密钥）；
    5. :func:`get_keystore` 选后端并托管主密钥（``master`` 条目）；
    6. :func:`generate_recovery` 生成 16 字节恢复码路径主密钥与 12 词恢复码，
       恢复码密钥托管于 ``recovery`` 条目（供「重新查看恢复码」），
       12 词仅经返回值出层。

    崩溃一致性说明：步骤 4 与 5 之间崩溃会留下「配置已写、托管缺失」状态，
    由 :func:`unlock` 的口令重派生路径自动修复；步骤 6 前崩溃则恢复码未出层，
    主密钥仍可正常解锁，恢复码需重新绑定。

    Args:
        passphrase: 用户口令，非空（同时用作 FileKeyStore 降级口令）。
        data_dir: 数据目录；``None`` 时走 ``cli._data_dir()``
            （``REMEMBER_ME_DATA_DIR`` 环境变量覆盖）。
        clock: 单调时钟（秒），透传 ``derive_master_key_auto``；测试可注入
            假时钟确定性触发降级路径。

    Returns:
        :class:`BootstrapResult`（含 12 词恢复码与降级标记）。

    Raises:
        CryptoError: 本数据目录已完成首次绑定（配置含 KDF 参数或托管已有主密钥）。
        KeyDerivationError: 口令为空或派生失败。
        KeyStoreError: 托管后端不可用且降级路径也无法完成存取。
        SyncConfigError: 同步配置损坏或写入失败。
    """
    config = load_or_create_config(data_dir)
    if config.kdf_method is not None:
        raise CryptoError(
            "本数据目录已完成首次绑定（.sync/config.json 已含 KDF 参数）；"
            "重复初始化会轮换 salt 导致既有密文永久不可解密，"
            "如需解锁请使用 unlock()，如需恢复请使用 unlock_with_recovery()"
        )

    store = get_keystore(fallback_passphrase=passphrase, data_dir=data_dir)
    if store.exists(MASTER_KEY_ID):
        raise CryptoError(
            "密钥托管中已存在主密钥；重复初始化会导致既有密文永久不可解密，"
            "如需解锁请使用 unlock()，如需恢复请使用 unlock_with_recovery()"
        )

    salt = generate_salt()
    derived = derive_master_key_auto(passphrase, salt, clock=clock)

    config.set_kdf_params(derived.method, salt)
    save_config(config, data_dir)
    store.store(MASTER_KEY_ID, derived.key)

    recovery_key, words = generate_recovery()
    store.store(RECOVERY_KEY_ID, recovery_key)

    backend = _backend_name(store)
    logger.info(
        "首次绑定完成：KDF 方法 %s（%s），托管后端 %s，主密钥 %d 字节，恢复码密钥 %d 字节",
        derived.method,
        "低端设备已自动降级" if derived.downgraded else "未降级",
        backend,
        len(derived.key),
        len(recovery_key),
    )
    return BootstrapResult(
        master_key=derived.key,
        recovery_words=words,
        method=derived.method,
        downgraded=derived.downgraded,
        keystore_backend=backend,
        device_id=config.device_id,
    )


# ---------------------------------------------------------------------------
# 常规解锁
# ---------------------------------------------------------------------------
def unlock(passphrase: str | None = None, data_dir: Path | None = None) -> UnlockResult:
    """常规解锁：托管读回优先，缺失时口令经持久化参数重派生并重新托管。

    流程：

    1. ``keystore.load("master")`` 读回主密钥——系统密钥环免密可读，
       降级文件需口令（构造 FileKeyStore 时已用 ``passphrase``）；
    2. **仅当条目不存在**（无条目 / 后端条目缺失）→ 读取 ``.sync/config.json``
       持久化的 method+salt，:func:`derive_master_key` **按原方法**重派生
       （绝不暗中换法——切换方法会改变派生结果，导致既有密文不可解密），
       随后重新托管。

    ⚠ 静默重派生防护：条目**存在**但读取失败（口令错误、条目损坏）时
    直接传播原异常，绝不fallback重派生——否则错误口令会派生出错误主密钥
    并覆盖托管，导致全部既有密文永久不可解密。

    Args:
        passphrase: 用户口令；系统密钥环可用且已有托管条目时可为 ``None``。
        data_dir: 数据目录；``None`` 时走 ``cli._data_dir()``。

    Returns:
        :class:`UnlockResult`（``source`` 标明读回 / 重派生）。

    Raises:
        KeyStoreError: 条目存在但读取失败（口令错误 / 条目损坏）、托管无
            主密钥且未提供口令、尚未完成首次绑定（配置无 KDF 参数）或后端失败。
        KeyDerivationError: 重派生失败。
        SyncConfigError: 同步配置损坏。
    """
    store = get_keystore(fallback_passphrase=passphrase, data_dir=data_dir)
    backend = _backend_name(store)

    try:
        key = store.load(MASTER_KEY_ID)
    except KeyStoreError as load_exc:
        if store.exists(MASTER_KEY_ID):
            # 条目存在但读不出：口令错误或条目损坏，传播原异常，绝不静默重派生
            raise
        if not passphrase:
            raise KeyStoreError(
                "密钥托管中无主密钥可读且未提供口令：请提供口令以重派生主密钥，"
                "或使用 unlock_with_recovery() 以恢复码重建"
            ) from load_exc
        config = load_config(data_dir)
        method = config.kdf_method
        salt = config.kdf_salt()
        if method is None or salt is None:
            raise KeyStoreError(
                "尚未完成首次绑定（.sync/config.json 无 KDF 参数），无法以口令重派生；"
                "请先执行 bootstrap_first_run() 或使用 unlock_with_recovery() 恢复"
            ) from load_exc
        key = derive_master_key(passphrase, salt, method)
        store.store(MASTER_KEY_ID, key)
        logger.info(
            "主密钥经口令重派生并重新托管（方法 %s，后端 %s，%d 字节）",
            method,
            backend,
            len(key),
        )
        return UnlockResult(master_key=key, source="passphrase", keystore_backend=backend)

    logger.debug("主密钥自托管读回（后端 %s，%d 字节）", backend, len(key))
    return UnlockResult(master_key=key, source="keystore", keystore_backend=backend)


# ---------------------------------------------------------------------------
# 恢复码重建
# ---------------------------------------------------------------------------
def unlock_with_recovery(
    words: Sequence[str],
    data_dir: Path | None = None,
    *,
    fallback_passphrase: str | None = None,
) -> RecoveryUnlockResult:
    """恢复码重建：12 词 BIP39 恢复码 → 恢复码路径主密钥 → 重新托管。

    :func:`from_recovery_code` 完成三层校验（词数 / 词表 / 校验位）后逐字节
    重建 16 字节主密钥熵，随后托管于 ``recovery`` 条目——与首次绑定托管的
    恢复码密钥逐字节一致（路线图 §3.2 验收标准 5 的跨进程一致性语义）。

    Args:
        words: 12 个英文助记词（允许大小写混杂与首尾空白）。
        data_dir: 数据目录；``None`` 时走 ``cli._data_dir()``。
        fallback_passphrase: 系统密钥环不可用时的降级文件保护口令；
            密钥环可用时无需提供。

    Returns:
        :class:`RecoveryUnlockResult`（``restored=True`` 表示重新托管成功）。

    Raises:
        RecoveryError: 恢复码词数不符、含非法单词或校验位不匹配。
        KeyStoreError: 托管后端不可用且未提供降级口令，或写入失败。
    """
    key = from_recovery_code(words)
    store = get_keystore(fallback_passphrase=fallback_passphrase, data_dir=data_dir)
    store.store(RECOVERY_KEY_ID, key)
    backend = _backend_name(store)
    logger.info(
        "恢复码重建完成：主密钥熵 %d 字节已重新托管（后端 %s）",
        len(key),
        backend,
    )
    return RecoveryUnlockResult(master_key=key, keystore_backend=backend, restored=True)

"""主密钥派生（KDF）— Remember Me Phase 4.2.1 本地加密层。

实现 ``docs/design/cloud-sync-architecture-2026-07-16.md`` §2.1 的密钥管理双路径：

* **Argon2id 高配路径**（默认）：内存硬度 64 MiB、3 次遍历、并行度按 CPU 核数
  取值（上限 4），输出 32 字节主密钥。使用 argon2-cffi 的 ``low_level.hash_secret_raw``
  底层接口，避免高级 API 的 salt 编码开销与哈希字符串解析。
* **PBKDF2 兜底路径**：SHA-256、100,000 迭代，输出 32 字节主密钥，面向低端设备。

自适应降级（架构 §6 既定方针）：

* :func:`derive_master_key` 在 Argon2id 实际耗时超过
  :data:`SLOW_DERIVATION_THRESHOLD_SECONDS` 时**仍返回本次 Argon2id 结果**，
  仅记录 warning 日志，建议调用方后续改用 PBKDF2；
* :func:`derive_master_key_auto` 提供探测式自动选择：先实测一次 Argon2id，
  超时则降级 PBKDF2 并记录降级事件。降级行为可通过注入假时钟单测。

子密钥派生 :func:`derive_subkeys` 按架构 §2.1 用 HKDF-SHA256 从主密钥分离出
DEK（数据加密密钥）与 MK（manifest HMAC 密钥），``info`` 字段互不相同，
保证两个子密钥在密码学上独立。

存储约定：``generate_salt()`` 生成的 salt **与密文分离存储**（通常存于同步
manifest / 配置中，而非密文头部）；主密钥派生后仅存于内存，持久化走操作系统
密钥链（见 ``keystore`` 模块，本模块不落盘）。
"""

from __future__ import annotations

import logging
import os
import time
from dataclasses import dataclass
from typing import Callable, Literal

from argon2.exceptions import Argon2Error
from argon2.low_level import Type, hash_secret_raw
from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.primitives.kdf.hkdf import HKDF
from cryptography.hazmat.primitives.kdf.pbkdf2 import PBKDF2HMAC

from .errors import KeyDerivationError

logger = logging.getLogger("memory_engine.crypto.kdf")


# ---------------------------------------------------------------------------
# 常量（协议参数，变更即破坏跨设备兼容性，须同步 bump info 版本号）
# ---------------------------------------------------------------------------
SALT_LENGTH = 16
"""``generate_salt()`` 输出长度（字节），128 位。"""

MASTER_KEY_LENGTH = 32
"""主密钥与子密钥长度（字节），256 位。"""

ARGON2_MEMORY_COST_KIB = 65_536
"""Argon2id 内存硬度（KiB），即架构 §2.1 的 64 MiB。"""

ARGON2_TIME_COST = 3
"""Argon2id 遍历次数。"""

ARGON2_MAX_PARALLELISM = 4
"""Argon2id 并行度上限，实际取 ``min(os.cpu_count(), 此值)``。"""

PBKDF2_ITERATIONS = 100_000
"""PBKDF2-SHA256 迭代次数（架构 §2.1 兜底路径）。"""

SLOW_DERIVATION_THRESHOLD_SECONDS = 3.0
"""慢派生阈值：Argon2id 实测耗时超过此值即触发降级告警 / 自动降级。"""

HKDF_DEK_INFO = b"remember-me:dek:v1"
"""HKDF 派生 DEK 的 ``info`` 字段（域分离）。"""

HKDF_MK_INFO = b"remember-me:mk:v1"
"""HKDF 派生 MK 的 ``info`` 字段（域分离）。"""

KdfMethod = Literal["argon2id", "pbkdf2"]
"""主密钥派生方法标识。"""

ClockFn = Callable[[], float]
"""单调时钟函数签名（秒），默认 ``time.perf_counter``，测试可注入假时钟。"""


@dataclass(frozen=True)
class Subkeys:
    """从主密钥派生的一对子密钥（HKDF 域分离）。

    Attributes:
        dek: 数据加密密钥（32 字节），供 AES-256-GCM 文件级加解密使用。
        mk: manifest HMAC 密钥（32 字节），供同步清单完整性校验使用。
    """

    dek: bytes
    mk: bytes


@dataclass(frozen=True)
class AutoKdfResult:
    """:func:`derive_master_key_auto` 的探测结果。

    Attributes:
        key: 实际派生出的 32 字节主密钥。
        method: 实际使用的派生方法；调用方必须将其与 salt 一并持久化，
            否则其他设备无法用同一口令复现主密钥。
        elapsed_seconds: Argon2id 探测耗时（秒）。
        downgraded: 是否发生了 Argon2id → PBKDF2 降级。
    """

    key: bytes
    method: KdfMethod
    elapsed_seconds: float
    downgraded: bool


# ---------------------------------------------------------------------------
# 参数校验与内部派生实现
# ---------------------------------------------------------------------------

def _validate_inputs(passphrase: str, salt: bytes) -> None:
    """校验口令与 salt，非法输入抛 :class:`KeyDerivationError`。"""
    if not passphrase:
        raise KeyDerivationError("口令不能为空：请提供用户密码或恢复口令后再派生主密钥")
    if len(salt) < SALT_LENGTH:
        raise KeyDerivationError(
            f"salt 长度不足：需要至少 {SALT_LENGTH} 字节（实际 {len(salt)} 字节）；"
            "请使用 generate_salt() 生成新 salt，或从同步 manifest 读回原 salt"
        )


def _argon2_parallelism() -> int:
    """按 CPU 核数计算 Argon2id 并行度，上限 :data:`ARGON2_MAX_PARALLELISM`。"""
    return max(1, min(os.cpu_count() or 1, ARGON2_MAX_PARALLELISM))


def _derive_argon2id(passphrase: str, salt: bytes) -> bytes:
    """Argon2id 高配路径：64 MiB 内存硬度、3 次遍历、32 字节原始输出。"""
    try:
        return hash_secret_raw(
            secret=passphrase.encode("utf-8"),
            salt=salt,
            time_cost=ARGON2_TIME_COST,
            memory_cost=ARGON2_MEMORY_COST_KIB,
            parallelism=_argon2_parallelism(),
            hash_len=MASTER_KEY_LENGTH,
            type=Type.ID,
        )
    except Argon2Error as exc:
        raise KeyDerivationError(f"Argon2id 主密钥派生失败：{exc}") from exc


def _derive_pbkdf2(passphrase: str, salt: bytes) -> bytes:
    """PBKDF2-SHA256 兜底路径：100,000 迭代、32 字节输出。"""
    kdf = PBKDF2HMAC(
        algorithm=hashes.SHA256(),
        length=MASTER_KEY_LENGTH,
        salt=salt,
        iterations=PBKDF2_ITERATIONS,
    )
    try:
        return kdf.derive(passphrase.encode("utf-8"))
    except Exception as exc:  # 底层库错误统一包装为 KeyDerivationError
        raise KeyDerivationError(f"PBKDF2 主密钥派生失败：{exc}") from exc


# ---------------------------------------------------------------------------
# 公共 API
# ---------------------------------------------------------------------------

def generate_salt() -> bytes:
    """生成 16 字节随机 salt。

    存储约定：salt **与密文分离存储**——通常与派生方法标识一并存于同步
    manifest / 本地配置中，而不是拼接进密文头部。多设备场景下各设备从
    manifest 读回同一 salt，才能用同一口令复现主密钥。

    Returns:
        16 字节密码学安全随机数（``os.urandom``）。
    """
    return os.urandom(SALT_LENGTH)


def derive_master_key(
    passphrase: str,
    salt: bytes,
    method: KdfMethod = "argon2id",
    *,
    clock: ClockFn = time.perf_counter,
) -> bytes:
    """从口令与 salt 派生 32 字节主密钥（确定性）。

    同一 ``passphrase`` + ``salt`` + ``method`` 组合永远产出相同主密钥；
    两条路径（``argon2id`` / ``pbkdf2``）产出互不相同。

    慢派生自适应（架构 §6 既定方针）：``method="argon2id"`` 且实测耗时超过
    :data:`SLOW_DERIVATION_THRESHOLD_SECONDS` 时，**本次仍返回 Argon2id 结果**，
    仅记录 warning 日志建议调用方后续改用 ``"pbkdf2"``——切换方法会改变派生
    结果，本函数绝不暗中替换，以免已加密数据无法解密。

    Args:
        passphrase: 用户口令，非空。
        salt: 至少 :data:`SALT_LENGTH` 字节的随机 salt（见 :func:`generate_salt`）。
        method: 派生方法，默认 ``"argon2id"``。
        clock: 单调时钟（秒），仅用于耗时测量；测试可注入假时钟。

    Returns:
        32 字节主密钥。

    Raises:
        KeyDerivationError: 口令为空、salt 长度不足、方法未知或底层库失败。
    """
    _validate_inputs(passphrase, salt)

    if method == "argon2id":
        start = clock()
        key = _derive_argon2id(passphrase, salt)
        elapsed = clock() - start
        if elapsed > SLOW_DERIVATION_THRESHOLD_SECONDS:
            logger.warning(
                "Argon2id 主密钥派生耗时 %.2f 秒，超过阈值 %.1f 秒；本次仍返回 "
                "Argon2id 结果，建议调用方后续改用 method='pbkdf2' 或使用 "
                "derive_master_key_auto() 自动选择（架构 §6 低端设备降级方针）",
                elapsed,
                SLOW_DERIVATION_THRESHOLD_SECONDS,
            )
        else:
            logger.debug("Argon2id 主密钥派生完成，耗时 %.3f 秒", elapsed)
        return key

    if method == "pbkdf2":
        start = clock()
        key = _derive_pbkdf2(passphrase, salt)
        logger.debug("PBKDF2 主密钥派生完成，耗时 %.3f 秒", clock() - start)
        return key

    raise KeyDerivationError(
        f"未知的 KDF 方法：{method!r}（仅支持 'argon2id' / 'pbkdf2'）"
    )


def derive_master_key_auto(
    passphrase: str,
    salt: bytes,
    *,
    clock: ClockFn = time.perf_counter,
) -> AutoKdfResult:
    """探测式自动选择 KDF 路径：先试 Argon2id，超时则降级 PBKDF2。

    实测一次 Argon2id 派生并计时；耗时超过
    :data:`SLOW_DERIVATION_THRESHOLD_SECONDS` 即认为当前设备为低端设备，
    丢弃探测结果、改用 PBKDF2 重新派生，并记录降级事件日志。返回的
    :class:`AutoKdfResult` 携带实际使用的方法标识，调用方**必须**将其与
    salt 一并持久化（如同步 manifest），否则其他设备无法复现主密钥。

    与 :func:`derive_master_key` 的区别：本函数允许替换派生方法，因此仅
    适用于**首次初始化**（尚未产生任何密文）或显式重新密钥化场景。

    Args:
        passphrase: 用户口令，非空。
        salt: 至少 :data:`SALT_LENGTH` 字节的随机 salt。
        clock: 单调时钟（秒）；测试注入假时钟即可确定性地触发降级路径。

    Returns:
        :class:`AutoKdfResult`，含主密钥、实际方法、探测耗时与降级标记。

    Raises:
        KeyDerivationError: 口令为空、salt 长度不足或底层库失败。
    """
    _validate_inputs(passphrase, salt)

    start = clock()
    probed = _derive_argon2id(passphrase, salt)
    elapsed = clock() - start

    if elapsed > SLOW_DERIVATION_THRESHOLD_SECONDS:
        logger.warning(
            "Argon2id 探测耗时 %.2f 秒，超过阈值 %.1f 秒，判定为低端设备，"
            "自动降级为 PBKDF2（%d 迭代）并记录降级事件（架构 §6 既定方针）",
            elapsed,
            SLOW_DERIVATION_THRESHOLD_SECONDS,
            PBKDF2_ITERATIONS,
        )
        return AutoKdfResult(
            key=_derive_pbkdf2(passphrase, salt),
            method="pbkdf2",
            elapsed_seconds=elapsed,
            downgraded=True,
        )

    logger.debug("Argon2id 探测耗时 %.3f 秒，未触发降级", elapsed)
    return AutoKdfResult(
        key=probed,
        method="argon2id",
        elapsed_seconds=elapsed,
        downgraded=False,
    )


def derive_subkeys(master_key: bytes) -> Subkeys:
    """按架构 §2.1 用 HKDF-SHA256 从主密钥派生 DEK 与 MK。

    两次独立 HKDF 调用，``info`` 字段分别为 :data:`HKDF_DEK_INFO` 与
    :data:`HKDF_MK_INFO`，实现域分离，保证 DEK 泄露不波及 MK（反之亦然）。

    ``salt=None`` 的理由：HKDF 的 extract 阶段 salt 用于从**非均匀**密钥
    材料中提取熵；此处输入已是高熵 KDF 输出（32 字节均匀随机），按
    RFC 5869 §3.3，salt 省略等价于全零 salt，不损失安全性，且省去一项
    需要跨设备同步持久化的参数。

    Args:
        master_key: :func:`derive_master_key` 产出的 32 字节主密钥。

    Returns:
        :class:`Subkeys`（``dek`` 与 ``mk`` 各 32 字节）。

    Raises:
        KeyDerivationError: 主密钥长度不是 32 字节。
    """
    if len(master_key) != MASTER_KEY_LENGTH:
        raise KeyDerivationError(
            f"主密钥长度必须为 {MASTER_KEY_LENGTH} 字节（实际 {len(master_key)} 字节）；"
            "请先通过 derive_master_key() 派生"
        )

    dek = HKDF(
        algorithm=hashes.SHA256(),
        length=MASTER_KEY_LENGTH,
        salt=None,
        info=HKDF_DEK_INFO,
    ).derive(master_key)
    mk = HKDF(
        algorithm=hashes.SHA256(),
        length=MASTER_KEY_LENGTH,
        salt=None,
        info=HKDF_MK_INFO,
    ).derive(master_key)
    return Subkeys(dek=dek, mk=mk)

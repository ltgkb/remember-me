"""AES-256-GCM 文件级加解密 — Remember Me Phase 4.2.1 本地加密层。

函数签名与语义 100% 对齐 ``docs/design/cloud-sync-architecture-2026-07-16.md``
§2.3 的示例代码：12 字节随机 IV、AAD = ``filepath:version``、128 位认证标签。

密文格式::

    IV (12B) || ciphertext || tag (16B)

``cryptography`` 的 ``AESGCM.encrypt`` 输出本身已是 ``ciphertext || tag``，
故整体只需前置 IV；解密时认证失败由 GCM tag 保证，**绝不返回部分明文**。

文件级粒度约定（架构 §2.2）：每个文件独立加密、独立 IV，单文件泄露不影响
其他数据，且支持细粒度增量同步与文件级版本控制：

* ``profile.json``                    完整文件
* ``{project}/context.json``          完整文件
* ``{project}/conversations/*.json``  每条对话历史独立加密
* ``search-settings.json``            完整文件

AAD 绑定文件路径与版本号：密文被复制到其他路径或回滚到旧版本时解密必失败，
以此防止重放攻击。路径字符串须使用同步协议约定的相对路径表示（调用方责任）。

错误处理只有一种：抛 :class:`CipherError`。本模块**不提供**任何「容忍错误」
的开关——密文、IV、AAD 任何改动、长度不足、密钥长度错误，一律抛出异常。

Round-trip 自证示例::

    >>> key = bytes(range(32))  # 实际使用 kdf.derive_subkeys().dek
    >>> ct = encrypt_file(b"hello", key, "profile.json", 1)
    >>> len(ct) == 12 + 5 + 16  # IV || ciphertext || tag
    True
    >>> decrypt_file(ct, key, "profile.json", 1)
    b'hello'
    >>> decrypt_file(ct, key, "profile.json", 2)  # 版本号改动 → 认证失败
    Traceback (most recent call last):
    ...
    memory_engine.crypto.errors.CipherError: 解密失败：文件已损坏或遭篡改（认证标签校验不通过）
"""

from __future__ import annotations

import logging
import os

from cryptography.exceptions import InvalidTag
from cryptography.hazmat.primitives.ciphers.aead import AESGCM

from .errors import CipherError

logger = logging.getLogger("memory_engine.crypto.cipher")


# ---------------------------------------------------------------------------
# 常量（密文格式参数，与架构 §2.3 绑定，变更即破坏密文兼容性）
# ---------------------------------------------------------------------------
KEY_LENGTH = 32
"""AES-256 密钥长度（字节）。"""

IV_LENGTH = 12
"""GCM 随机 IV 长度（字节），96 位，每份密文独立生成、永不重复。"""

TAG_LENGTH = 16
"""GCM 认证标签长度（字节），128 位。"""

MIN_CIPHERTEXT_LENGTH = IV_LENGTH + TAG_LENGTH
"""合法密文的最小长度（空明文场景：IV + 空密文 + tag）。"""


def _build_aad(filepath: str, version: int) -> bytes:
    """构造附加认证数据：``f"{filepath}:{version}"`` 的 UTF-8 编码。"""
    return f"{filepath}:{version}".encode("utf-8")


def _check_key(key: bytes) -> None:
    """校验 AES-256 密钥长度，非法即抛 :class:`CipherError`。"""
    if len(key) != KEY_LENGTH:
        raise CipherError(
            f"密钥长度必须为 {KEY_LENGTH} 字节 / AES-256（实际 {len(key)} 字节）；"
            "请使用 kdf.derive_subkeys() 派生的 DEK"
        )


# ---------------------------------------------------------------------------
# 公共 API（签名与架构 §2.3 示例一一对应）
# ---------------------------------------------------------------------------

def encrypt_file(plaintext: bytes, key: bytes, filepath: str, version: int) -> bytes:
    """用 AES-256-GCM 加密单个文件内容。

    Args:
        plaintext: 文件明文（可为空字节串）。
        key: 32 字节加密密钥（即 ``Subkeys.dek``）。
        filepath: 文件相对路径，参与 AAD 计算。
        version: 文件版本号，参与 AAD 计算（防重放）。

    Returns:
        ``IV (12B) || ciphertext || tag (16B)`` 拼接后的整体密文。

    Raises:
        CipherError: 密钥长度不是 32 字节。
    """
    _check_key(key)
    iv = os.urandom(IV_LENGTH)
    aad = _build_aad(filepath, version)
    ciphertext = AESGCM(key).encrypt(iv, plaintext, aad)
    return iv + ciphertext


def decrypt_file(ciphertext: bytes, key: bytes, filepath: str, version: int) -> bytes:
    """解密 :func:`encrypt_file` 产出的整体密文。

    密文、IV、AAD（路径或版本号）的任何改动都会导致 GCM 认证失败；
    底层的 ``InvalidTag`` 统一包装为 :class:`CipherError`，**绝不返回
    部分明文**。

    Args:
        ciphertext: ``IV || ciphertext || tag`` 整体密文。
        key: 32 字节加密密钥，须与加密时相同。
        filepath: 文件相对路径，须与加密时相同。
        version: 文件版本号，须与加密时相同。

    Returns:
        原始明文字节串。

    Raises:
        CipherError: 密钥长度错误、密文长度不足或认证校验失败（篡改 / 损坏）。
    """
    _check_key(key)
    if len(ciphertext) < MIN_CIPHERTEXT_LENGTH:
        raise CipherError(
            f"密文长度不足：至少 {MIN_CIPHERTEXT_LENGTH} 字节（IV {IV_LENGTH}B + "
            f"tag {TAG_LENGTH}B），实际 {len(ciphertext)} 字节；文件已损坏或遭篡改"
        )

    iv, encrypted = ciphertext[:IV_LENGTH], ciphertext[IV_LENGTH:]
    aad = _build_aad(filepath, version)
    try:
        return AESGCM(key).decrypt(iv, encrypted, aad)
    except InvalidTag as exc:
        logger.warning("密文认证标签校验失败（filepath=%r, version=%d）", filepath, version)
        raise CipherError(
            "解密失败：文件已损坏或遭篡改（认证标签校验不通过）"
        ) from exc

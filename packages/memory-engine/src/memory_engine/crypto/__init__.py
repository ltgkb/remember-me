"""crypto 包 — Remember Me Phase 4.2.1 本地加密层。

实现 ``docs/design/cloud-sync-architecture-2026-07-16.md`` §2 的端到端加密能力，
纯本地、不触网：

* ``kdf``      主密钥派生双路径（PBKDF2-SHA256 100k / Argon2id 64MB·3 遍历）+ HKDF 子密钥
* ``cipher``   AES-256-GCM 文件级加解密（12 字节随机 IV，AAD = ``filepath:version``）
* ``keystore`` 主密钥系统密钥环托管（Windows Credential Locker 等）+ 加密密钥文件降级
* ``recovery`` BIP39 12 词恢复码生成与主密钥重建

异常族统一定义于 ``errors`` 模块，与公共 API 一并在此重导出。
"""

from __future__ import annotations

from .cipher import decrypt_file, encrypt_file
from .errors import (
    CipherError,
    CryptoError,
    KeyDerivationError,
    KeyStoreError,
    RecoveryError,
    SyncError,
)
from .kdf import (
    AutoKdfResult,
    KdfMethod,
    Subkeys,
    derive_master_key,
    derive_master_key_auto,
    derive_subkeys,
    generate_salt,
)
from .keystore import FileKeyStore, KeyringKeyStore, KeyStore, get_keystore
from .recovery import (
    from_recovery_code,
    generate_master_key,
    generate_recovery,
    to_recovery_code,
)

__all__ = [
    # 异常族
    "CipherError",
    "CryptoError",
    "KeyDerivationError",
    "KeyStoreError",
    "RecoveryError",
    "SyncError",
    # kdf
    "AutoKdfResult",
    "KdfMethod",
    "Subkeys",
    "derive_master_key",
    "derive_master_key_auto",
    "derive_subkeys",
    "generate_salt",
    # cipher
    "decrypt_file",
    "encrypt_file",
    # keystore
    "FileKeyStore",
    "KeyStore",
    "KeyringKeyStore",
    "get_keystore",
    # recovery
    "from_recovery_code",
    "generate_master_key",
    "generate_recovery",
    "to_recovery_code",
]

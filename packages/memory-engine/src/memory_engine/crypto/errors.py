"""加密与同步异常族 — 分层捕获惯例的起点。

沿用 ``vector_index.py`` 的 ``SemanticSearchError`` 分层语义：业务异常携带
面向用户的可读提示，上层（HTTP 端点 / CLI）据此优雅降级，绝不穿透处理器。

异常层级::

    RuntimeError
    ├── CryptoError          本地加密层一切失败（KDF / 加解密 / 密钥托管 / 恢复码）
    │   ├── KeyDerivationError   主密钥 / 子密钥派生失败
    │   ├── CipherError          加解密与篡改认证失败（包装 InvalidTag 等）
    │   ├── KeyStoreError        系统密钥环与降级密钥文件存取失败
    │   └── RecoveryError        BIP39 恢复码生成 / 校验 / 重建失败
    └── SyncError            云端同步层失败（4.2.2 / 4.2.3 使用，本轮仅定义起点）
"""

from __future__ import annotations


class CryptoError(RuntimeError):
    """本地加密层不可用时抛出，携带面向用户的提示信息。"""


class KeyDerivationError(CryptoError):
    """主密钥 / 子密钥派生失败（KDF 参数非法、底层库错误等）。"""


class CipherError(CryptoError):
    """加解密失败；密文或 AAD 被篡改时抛出（包装 ``InvalidTag``）。

    安全语义：篡改场景下**绝不返回部分明文**，统一以本异常向上传播。
    """


class KeyStoreError(CryptoError):
    """密钥托管失败（系统密钥环不可用且降级路径也无法完成存取）。"""


class RecoveryError(CryptoError):
    """BIP39 恢复码生成、校验或主密钥重建失败（含非法恢复码输入）。"""


class SyncError(RuntimeError):
    """云端同步层失败（Phase 4.2.2 / 4.2.3 使用），本轮仅定义族起点。"""

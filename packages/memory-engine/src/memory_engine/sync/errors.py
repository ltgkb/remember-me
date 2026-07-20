"""同步层异常族 — 自 ``crypto/errors.py`` 的 :class:`SyncError` 起点扩展。

分层语义沿用 ``vector_index.py`` 的 ``SemanticSearchError`` 先例：业务异常携带
面向用户的中文可读提示，上层（HTTP 端点 / CLI / 设置面板）据此优雅降级，
绝不穿透处理器。

异常层级::

    RuntimeError
    └── SyncError（定义于 crypto.errors，此处为族起点重导出）
        ├── SyncConfigError         .sync/config.json 读写 / 解析 / 校验失败
        └── ManifestIntegrityError  manifest HMAC 验签失败、签名文件缺失或损坏
"""

from __future__ import annotations

from ..crypto.errors import SyncError

__all__ = [
    "SyncError",
    "SyncConfigError",
    "ManifestIntegrityError",
]


class SyncConfigError(SyncError):
    """``.sync/config.json`` 读写、JSON 解析或字段校验失败。

    损坏语义与 ``FileKeyStore`` 一致：任何非法输入一律抛错且**绝不返回
    部分数据**，由调用方决定重建或中止。
    """


class ManifestIntegrityError(SyncError):
    """manifest HMAC 完整性校验失败（篡改、签名缺失、签名文件损坏）。

    安全语义：校验失败**绝不返回部分清单数据**；调用方应按
    ``manifest_mac.handle_corrupted_manifest()`` 的既定处置流程备份并重建，
    而非静默覆盖（路线图 §6 风险表「Lamport 时钟状态损坏」行既定方针）。
    """

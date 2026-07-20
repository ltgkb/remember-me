"""4KB 块级哈希树 — 增量同步的变更块识别原语（架构 §3.4）。

实现 ``docs/design/cloud-sync-architecture-2026-07-16.md`` §3.4 的客户端侧
原语：文件 → 4KB（4096 字节）块序列 → 逐块 SHA-256 → 块哈希列表 + 整文件
根哈希。同步时本地与远端各自计算块哈希列表，:func:`changed_chunks` 对比
得出变更块索引，仅上传变更块，服务端据此重组密文块、更新版本元数据。

根哈希算法（**Merkle 式**，与整文件 flat SHA-256 不同的独立指标）::

    root = SHA-256( digest(chunk₀) ‖ digest(chunk₁) ‖ … ‖ digest(chunkₙ₋₁) )

即按块序拼接各块的 **32 字节原始摘要**（非 hex 文本）后再做一次 SHA-256。
空文件没有块，根哈希定义为 ``SHA-256(b"")``（空输入摘要），全端一致可复现。
选型理由：根哈希只做「两棵哈希树是否一致」的 O(1) 判等，拼接摘要再哈希
与块列表等长信息绑定（块数、顺序、内容任一变化根即变），且计算与逐块
哈希同趟完成、零额外读盘。

字段分工（与 4.2.2 ``sync.manifest`` 的对接约定，本模块不 import 它，零耦合）：

* ``content_hash`` — 同一读取趟内顺带计算的**整文件 flat SHA-256**，与
  ``FileVersion.contentHash`` 约定一致，供清单层直接取用，避免为拿整文件
  摘要二次读盘；
* ``root_hash`` — Merkle 式根，仅作哈希树一致性判等，**不应**写入清单。

边界约定：空文件 → 零块；恰为 4KB 整数倍 → 无空尾块；不足 4KB 的尾块
按实际长度单独成块。:func:`hash_file` 流式读取，每次仅一块（≤4KB）
驻留内存，GB 级文件内存占用恒定（块哈希列表本身随块数线性增长，
1GB 文件约 25 万条 hex，可忽略）。
"""

from __future__ import annotations

import hashlib
from collections.abc import Iterator, Sequence
from dataclasses import dataclass
from pathlib import Path

from .errors import SyncError

__all__ = [
    "CHUNK_SIZE",
    "FileChunkHashes",
    "hash_file",
    "hash_bytes",
    "changed_chunks",
]

CHUNK_SIZE = 4096
"""块大小：4KB（架构 §3.4 既定）。跨端必须一致，变更即破坏增量同步协议。"""


@dataclass(frozen=True)
class FileChunkHashes:
    """一个文件的块级哈希树计算结果。

    Attributes:
        chunk_hashes: 逐块 SHA-256 摘要（小写 hex，按块序，0 基索引与
            :func:`changed_chunks` 的返回值对应）。
        root_hash: Merkle 式根哈希（算法见模块 docstring）。
        content_hash: 整文件 flat SHA-256（小写 hex）；与 4.2.2
            ``FileVersion.contentHash`` 约定一致，同一读取趟顺带算出。
        file_size: 文件字节数（尾块长度校验与统计用）。
    """

    chunk_hashes: tuple[str, ...]
    root_hash: str
    content_hash: str
    file_size: int


def _iter_file_blocks(path: Path) -> Iterator[bytes]:
    """流式产出文件块：每次仅一块（≤4KB）驻留内存。"""
    with path.open("rb") as fh:
        while True:
            block = fh.read(CHUNK_SIZE)
            if not block:
                return
            yield block


def _iter_bytes_blocks(data: bytes) -> Iterator[bytes]:
    """把内存字节串切成 4KB 块序列（尾块按实际长度）。"""
    for offset in range(0, len(data), CHUNK_SIZE):
        yield data[offset : offset + CHUNK_SIZE]


def _build_tree(blocks: Iterator[bytes]) -> FileChunkHashes:
    """单趟流式计算：逐块 SHA-256 → Merkle 根 + 整文件 flat hash。"""
    root_hasher = hashlib.sha256()
    content_hasher = hashlib.sha256()
    chunk_hashes: list[str] = []
    file_size = 0
    for block in blocks:
        digest = hashlib.sha256(block).digest()
        root_hasher.update(digest)
        content_hasher.update(block)
        chunk_hashes.append(digest.hex())
        file_size += len(block)
    return FileChunkHashes(
        chunk_hashes=tuple(chunk_hashes),
        root_hash=root_hasher.hexdigest(),
        content_hash=content_hasher.hexdigest(),
        file_size=file_size,
    )


def hash_file(path: Path) -> FileChunkHashes:
    """流式计算文件的 4KB 块级哈希树（≥1MB 大文件内存占用恒定）。

    Args:
        path: 待哈希文件路径。

    Returns:
        :class:`FileChunkHashes`（块哈希列表 + Merkle 根 + 整文件 flat hash）。

    Raises:
        SyncError: 文件不存在、不可读或读取中途 IO 失败。
    """
    try:
        return _build_tree(_iter_file_blocks(path))
    except OSError as exc:
        raise SyncError(f"文件分块哈希失败（{path}）：{exc}") from exc


def hash_bytes(data: bytes) -> FileChunkHashes:
    """计算内存字节串的块级哈希树（与 :func:`hash_file` 结果逐字段一致）。

    供测试与小数据场景使用；服务端重组密文块后的完整性校验亦可复用本函数。
    """
    return _build_tree(_iter_bytes_blocks(data))


def changed_chunks(local_hashes: Sequence[str], remote_hashes: Sequence[str]) -> list[int]:
    """对比本地与远端块哈希列表，返回需上传的变更块索引（0 基，升序）。

    语义（供 4.2.2 增量上传「只传变更块」）：

    * 公共长度范围内逐位比对，hex 串不同即变更；
    * 本地比远端多出的尾部块全部视为新增变更（索引 ≥ ``len(remote_hashes)``）；
    * 远端比本地更长（本地截断）时，超出本地长度的索引**不**返回——本地
      无块可传，长度差由块数与根哈希差异另行体现。

    Args:
        local_hashes: 本地文件的块哈希列表（本模块产出的小写 hex）。
        remote_hashes: 远端同路径文件的块哈希列表（同一算法约定）。

    Returns:
        变更块索引列表（升序）；空列表表示块级一致（长度与逐块内容全同）。
    """
    changed = [
        index
        for index, (local, remote) in enumerate(zip(local_hashes, remote_hashes))
        if local != remote
    ]
    changed.extend(range(len(remote_hashes), len(local_hashes)))
    return changed

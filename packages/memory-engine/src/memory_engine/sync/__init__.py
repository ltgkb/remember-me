"""sync 包 — Remember Me Phase 4.2 云端同步层（纯本地原语，不触网）。

实现 ``docs/design/cloud-sync-roadmap-2026-07-18.md`` 的同步协议本地原语：

* ``paths``        ``.sync/`` 目录约定与全部同步产物落点（路线图 §5.4）
* ``config``       ``.sync/config.json`` 读写（deviceId / sync.enabled / KDF 参数）
* ``manifest_mac`` manifest HMAC-SHA256 签名 / 验签 / 损坏处置（MK 子密钥）
* ``errors``       ``SyncError`` 异常族（自 ``crypto.errors`` 起点扩展）
* ``lamport``      Lamport 时钟与 ``(lamport, deviceId)`` 字典序全序（架构 §3.2）
* ``manifest``     ``FileVersion`` 清单读写与新增/变更/冲突/伪冲突 diff（架构 §3.2）
* ``chunker``      4KB 块级哈希树与变更块识别（架构 §3.4 增量同步原语）
* ``queue``        离线队列（JSONL 追加、500 条上限同路径合并、损坏行容错）

异常族与公共 API 一并在此重导出。
"""

from __future__ import annotations

from .chunker import (
    CHUNK_SIZE,
    FileChunkHashes,
    changed_chunks,
    hash_bytes,
    hash_file,
)
from .config import (
    CONFIG_FORMAT_VERSION,
    SyncConfig,
    load_config,
    load_or_create_config,
    save_config,
)
from .errors import ManifestIntegrityError, SyncConfigError, SyncError
from .lamport import LamportClock, Stamp, compare, happens_before
from .manifest import (
    FileVersion,
    Manifest,
    ManifestDiff,
    VersionPair,
    build_manifest,
    hash_file_content,
    scan_sync_files,
)
from .manifest_mac import (
    EMPTY_MANIFEST_BYTES,
    MANIFEST_MAC_ALGORITHM,
    SIG_FORMAT_VERSION,
    ManifestCorrupted,
    handle_corrupted_manifest,
    request_full_conflict_rebuild,
    verify_manifest_mac,
    write_manifest_mac,
)
from .paths import (
    CONFIG_FILENAME,
    CORRUPTED_DIR_PREFIX,
    KEYSTORE_FILENAME,
    MANIFEST_FILENAME,
    MANIFEST_MAC_FILENAME,
    QUEUE_DIR_NAME,
    SYNC_DIR_NAME,
    config_path,
    corrupted_backup_dir,
    ensure_sync_dir,
    keystore_path,
    manifest_mac_path,
    manifest_path,
    queue_dir,
    sync_dir,
)
from .queue import (
    QUEUE_CAPACITY,
    QUEUE_FILENAME,
    QUEUE_RECORD_VERSION,
    ChangeOp,
    QueuedChange,
    clear,
    depth,
    enqueue,
    peek,
    queue_file_path,
    replay,
)

__all__ = [
    # 异常族
    "SyncError",
    "SyncConfigError",
    "ManifestIntegrityError",
    # config
    "CONFIG_FORMAT_VERSION",
    "SyncConfig",
    "load_config",
    "load_or_create_config",
    "save_config",
    # manifest_mac
    "SIG_FORMAT_VERSION",
    "MANIFEST_MAC_ALGORITHM",
    "EMPTY_MANIFEST_BYTES",
    "ManifestCorrupted",
    "write_manifest_mac",
    "verify_manifest_mac",
    "handle_corrupted_manifest",
    "request_full_conflict_rebuild",
    # paths
    "SYNC_DIR_NAME",
    "MANIFEST_FILENAME",
    "MANIFEST_MAC_FILENAME",
    "CONFIG_FILENAME",
    "QUEUE_DIR_NAME",
    "KEYSTORE_FILENAME",
    "CORRUPTED_DIR_PREFIX",
    "sync_dir",
    "ensure_sync_dir",
    "manifest_path",
    "manifest_mac_path",
    "config_path",
    "queue_dir",
    "keystore_path",
    "corrupted_backup_dir",
    # lamport
    "Stamp",
    "LamportClock",
    "compare",
    "happens_before",
    # manifest
    "FileVersion",
    "VersionPair",
    "ManifestDiff",
    "Manifest",
    "scan_sync_files",
    "hash_file_content",
    "build_manifest",
    # chunker
    "CHUNK_SIZE",
    "FileChunkHashes",
    "hash_file",
    "hash_bytes",
    "changed_chunks",
    # queue
    "QUEUE_CAPACITY",
    "QUEUE_FILENAME",
    "QUEUE_RECORD_VERSION",
    "ChangeOp",
    "QueuedChange",
    "queue_file_path",
    "enqueue",
    "peek",
    "replay",
    "depth",
    "clear",
]

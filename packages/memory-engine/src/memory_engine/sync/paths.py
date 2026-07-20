"""``.sync/`` 目录约定 — 全部同步产物的统一落点与路径解析。

实现 ``docs/design/cloud-sync-roadmap-2026-07-18.md`` §5.4 的集成约定：
同步产物（``manifest.json`` / ``config.json`` / ``queue/`` / ``keystore.enc``
等）统一置于 ``{data_dir}/.sync/``，跟随 ``cli._data_dir()`` 的
``REMEMBER_ME_DATA_DIR`` 环境变量覆盖约定——测试将环境变量指向 pytest
临时目录即可零成本隔离，与 ``tests/crypto`` 的 ``tmp_data_dir`` fixture 同款。

目录布局::

    {data_dir}/                         默认 ~/.remember-me（REMEMBER_ME_DATA_DIR 可覆盖）
    ├── profile.json                    ┐
    ├── projects/...                    │ 明文业务数据（同步数据源，架构 §2.2 加密粒度表）
    ├── search-settings.json            ┘
    ├── .backups/                       ✗ 不纳入同步范围（本地版本备份，路线图 §5.1）
    ├── templates/                      ✗ 不纳入同步范围（本地资产，列入 .syncignore，路线图 §5.1）
    └── .sync/                          ✔ 本模块管理的同步产物目录
        ├── config.json                 设备身份 / 同步开关 / KDF 参数（sync.config）
        ├── manifest.json               FileVersion 清单（4.2.2 sync.manifest）
        ├── manifest.json.sig           manifest HMAC-SHA256 签名（sync.manifest_mac）
        ├── keystore.enc                降级密钥文件（crypto.keystore，仅 keyring 不可用时存在）
        ├── queue/                      离线队列 JSONL（4.2.2 sync.queue）
        └── corrupted-{ts}/             manifest 验签失败后的损坏文件备份（sync.manifest_mac）

不纳入同步范围的约定（路线图 §5.1 既定）：

* ``.backups/`` 为 ``JsonStorage.backup()`` 的本地版本备份，属设备私有历史，
  不同步、不上云；
* ``templates/`` 与用户自定义模板为本地资产，默认不同步，列入 ``.syncignore``。

路径解析全部接受可选 ``data_dir`` 显式覆盖；为 ``None`` 时走
:func:`memory_engine.cli._data_dir`（``REMEMBER_ME_DATA_DIR`` 环境变量 →
默认 ``~/.remember-me``）。本模块只计算路径，除 :func:`ensure_sync_dir` 外
不做任何 IO。
"""

from __future__ import annotations

from pathlib import Path

from ..cli import _data_dir
from ..crypto.keystore import KEYSTORE_FILENAME

__all__ = [
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
]

# ---------------------------------------------------------------------------
# 常量（同步产物命名约定，变更即破坏跨版本兼容）
# ---------------------------------------------------------------------------
SYNC_DIR_NAME = ".sync"
"""同步产物根目录名，固定位于 ``{data_dir}/`` 下。"""

MANIFEST_FILENAME = "manifest.json"
"""FileVersion 清单文件名（4.2.2 ``sync.manifest`` 读写，本模块仅约定落点）。"""

MANIFEST_MAC_FILENAME = "manifest.json.sig"
"""manifest HMAC 签名文件名（``sync.manifest_mac``，与清单分离存储）。"""

CONFIG_FILENAME = "config.json"
"""同步配置文件名（``sync.config`` 读写）。"""

QUEUE_DIR_NAME = "queue"
"""离线队列目录名（4.2.2 ``sync.queue``，JSONL 追加）。"""

CORRUPTED_DIR_PREFIX = "corrupted-"
"""manifest 损坏备份目录名前缀，完整名为 ``corrupted-{UTC 时间戳}``。"""


def _base(data_dir: Path | None) -> Path:
    """解析数据目录：显式参数优先，否则走 ``cli._data_dir()`` 环境约定。"""
    return data_dir if data_dir is not None else _data_dir()


# ---------------------------------------------------------------------------
# 公共 API
# ---------------------------------------------------------------------------
def sync_dir(data_dir: Path | None = None) -> Path:
    """返回 ``{data_dir}/.sync/`` 路径（不保证已存在，不做 IO）。"""
    return _base(data_dir) / SYNC_DIR_NAME


def ensure_sync_dir(data_dir: Path | None = None) -> Path:
    """返回 ``.sync/`` 路径并确保其存在（``mkdir(parents=True, exist_ok=True)``）。

    写盘类调用方（config / manifest_mac / keystore）落盘前调用；
    重复调用幂等。
    """
    path = sync_dir(data_dir)
    path.mkdir(parents=True, exist_ok=True)
    return path


def manifest_path(data_dir: Path | None = None) -> Path:
    """``.sync/manifest.json`` — FileVersion 清单落点。"""
    return sync_dir(data_dir) / MANIFEST_FILENAME


def manifest_mac_path(data_dir: Path | None = None) -> Path:
    """``.sync/manifest.json.sig`` — manifest HMAC 签名落点（与清单分离存储）。"""
    return sync_dir(data_dir) / MANIFEST_MAC_FILENAME


def config_path(data_dir: Path | None = None) -> Path:
    """``.sync/config.json`` — 同步配置落点。"""
    return sync_dir(data_dir) / CONFIG_FILENAME


def queue_dir(data_dir: Path | None = None) -> Path:
    """``.sync/queue/`` — 离线队列目录落点（4.2.2 ``sync.queue`` 使用）。"""
    return sync_dir(data_dir) / QUEUE_DIR_NAME


def keystore_path(data_dir: Path | None = None) -> Path:
    """``.sync/keystore.enc`` — 降级密钥文件落点（与 ``crypto.keystore`` 一致）。

    常量 :data:`KEYSTORE_FILENAME` 直接重导出 ``crypto.keystore`` 的同名常量，
    保证两处约定永不漂移；该文件仅当系统密钥环不可用时才会存在。
    """
    return sync_dir(data_dir) / KEYSTORE_FILENAME


def corrupted_backup_dir(timestamp: str, data_dir: Path | None = None) -> Path:
    """``.sync/corrupted-{timestamp}`` — manifest 损坏备份目录落点。

    Args:
        timestamp: 文件系统安全的时间戳串（如 ``20260721T103000Z``），
            由 ``sync.manifest_mac`` 生成；本函数只负责拼接。
    """
    return sync_dir(data_dir) / f"{CORRUPTED_DIR_PREFIX}{timestamp}"

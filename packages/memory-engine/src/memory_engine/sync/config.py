"""``.sync/config.json`` 读写 — 同步配置基座（设备身份 / 开关 / KDF 参数）。

实现迭代计划 A1 与路线图 §5.4 的配置约定：

* ``deviceId``      设备唯一标识，首次启动生成 UUID4 并持久化（跨进程稳定）；
* ``sync.enabled``  云端同步总开关（默认关闭，用户在设置面板显式开启）；
* ``kdf.method`` / ``kdf.salt``   主密钥派生参数——07-20 决策记录 3 既定：
  ``derive_master_key_auto`` 实际选用的 method 必须与 salt 一并持久化，
  否则其他设备无法用同一口令复现主密钥；两者成对出现，缺一即非法；
* ``lamport``       Lamport 时钟值持久化字段（4.2.2 ``sync.lamport`` 使用，
  防进程重启回退；本轮仅预留，默认 0）。

文件格式（版本 1）::

    {
      "version": 1,
      "deviceId": "<uuid4>",
      "sync": {"enabled": false},
      "kdf": {"method": "argon2id", "salt": "<16 字节 salt 的 hex>"} | null,
      "lamport": 0
    }

写盘安全：沿用 ``FileKeyStore`` 先例——先写同目录临时文件，再
:func:`os.replace` 原子替换，杜绝半截文件；临时文件清理失败属尽力而为。
不做 ``chmod 0o600``：本文件不含密钥材料（salt 与 deviceId 均非秘密，
主密钥 / 恢复码绝不落盘于此），与 ``keystore.enc`` 的威胁模型不同。

损坏语义：JSON 解析失败、版本不支持、字段非法，一律抛
:class:`SyncConfigError` 且**绝不返回部分数据**（与 ``FileKeyStore``
的损坏语义一致）；文件不存在不算损坏，由 :func:`load_config` /
:func:`load_or_create_config` 分别按「内存默认值」与「生成并落盘」处理。
"""

from __future__ import annotations

import json
import logging
import os
import tempfile
import uuid
from dataclasses import dataclass
from pathlib import Path
from typing import Any, cast

from ..crypto.kdf import SALT_LENGTH, KdfMethod
from .errors import SyncConfigError
from .paths import config_path

logger = logging.getLogger("memory_engine.sync.config")

__all__ = [
    "CONFIG_FORMAT_VERSION",
    "SyncConfig",
    "load_config",
    "load_or_create_config",
    "save_config",
]

CONFIG_FORMAT_VERSION = 1
"""``.sync/config.json`` 格式版本；结构演进时递增并在 ``_parse`` 中兼容。"""

_VALID_KDF_METHODS: frozenset[str] = frozenset({"argon2id", "pbkdf2"})


# ---------------------------------------------------------------------------
# 配置数据模型
# ---------------------------------------------------------------------------
@dataclass
class SyncConfig:
    """``.sync/config.json`` 的内存表示。

    Attributes:
        device_id: 设备唯一标识（UUID4 字符串），首次启动生成并持久化。
        sync_enabled: 云端同步总开关，默认 ``False``。
        kdf_method: 主密钥派生方法；``None`` 表示尚未完成首次绑定。
        kdf_salt_hex: 主密钥派生 salt（hex 编码）；与 ``kdf_method`` 成对出现。
        lamport: Lamport 时钟持久化值（4.2.2 预留，本轮默认 0）。
    """

    device_id: str
    sync_enabled: bool = False
    kdf_method: KdfMethod | None = None
    kdf_salt_hex: str | None = None
    lamport: int = 0

    def set_kdf_params(self, method: KdfMethod, salt: bytes) -> None:
        """成对写入 KDF 参数（hex 编码 salt）。

        Args:
            method: 实际使用的派生方法（``derive_master_key_auto`` 的探测结果）。
            salt: 至少 :data:`SALT_LENGTH` 字节的派生 salt。

        Raises:
            SyncConfigError: salt 长度不足。
        """
        if len(salt) < SALT_LENGTH:
            raise SyncConfigError(
                f"KDF salt 长度不足：需要至少 {SALT_LENGTH} 字节（实际 {len(salt)} 字节）；"
                "请使用 kdf.generate_salt() 生成的 salt"
            )
        self.kdf_method = method
        self.kdf_salt_hex = salt.hex()

    def kdf_salt(self) -> bytes | None:
        """读回 KDF salt（bytes）；未设置返回 ``None``。

        Raises:
            SyncConfigError: 已持久化的 hex 串非法（正常路径不会发生，
                读取侧 ``_parse`` 已校验）。
        """
        if self.kdf_salt_hex is None:
            return None
        try:
            return bytes.fromhex(self.kdf_salt_hex)
        except ValueError as exc:
            raise SyncConfigError(
                "同步配置中的 KDF salt 不是合法 hex 编码；配置可能已损坏"
            ) from exc

    def to_dict(self) -> dict[str, Any]:
        """序列化为 JSON 可写结构（``kdf`` 未设置时为 ``null``）。"""
        kdf: dict[str, str] | None = None
        if self.kdf_method is not None or self.kdf_salt_hex is not None:
            kdf = {"method": str(self.kdf_method), "salt": str(self.kdf_salt_hex)}
        return {
            "version": CONFIG_FORMAT_VERSION,
            "deviceId": self.device_id,
            "sync": {"enabled": self.sync_enabled},
            "kdf": kdf,
            "lamport": self.lamport,
        }


def _default_config() -> SyncConfig:
    """生成全新默认配置（新 UUID4 deviceId，其余字段取默认值）。"""
    return SyncConfig(device_id=str(uuid.uuid4()))


# ---------------------------------------------------------------------------
# 解析与校验
# ---------------------------------------------------------------------------
def _parse_device_id(doc: dict[str, Any]) -> str:
    """校验并取出 ``deviceId`` 字段。"""
    device_id = doc.get("deviceId")
    if not isinstance(device_id, str):
        raise SyncConfigError(
            "同步配置格式非法：deviceId 缺失或不是字符串；请不要手动编辑 .sync/ 目录"
        )
    try:
        uuid.UUID(device_id)
    except ValueError as exc:
        raise SyncConfigError(
            "同步配置格式非法：deviceId 不是合法 UUID；请不要手动编辑 .sync/ 目录"
        ) from exc
    return device_id


def _parse_sync_enabled(doc: dict[str, Any]) -> bool:
    """校验并取出 ``sync.enabled`` 字段。"""
    sync_section = doc.get("sync")
    if not isinstance(sync_section, dict):
        raise SyncConfigError("同步配置格式非法：sync 段缺失或不是对象")
    enabled = sync_section.get("enabled")
    if not isinstance(enabled, bool):
        raise SyncConfigError("同步配置格式非法：sync.enabled 缺失或不是布尔值")
    return enabled


def _parse_kdf(doc: dict[str, Any]) -> tuple[KdfMethod | None, str | None]:
    """校验并取出 ``kdf.method`` / ``kdf.salt``；两者必须成对出现。"""
    kdf_section = doc.get("kdf")
    if kdf_section is None:
        return None, None
    if not isinstance(kdf_section, dict):
        raise SyncConfigError("同步配置格式非法：kdf 段必须是对象或 null")

    method = kdf_section.get("method")
    salt_hex = kdf_section.get("salt")
    if method is None and salt_hex is None:
        return None, None
    if not isinstance(method, str) or method not in _VALID_KDF_METHODS:
        raise SyncConfigError(
            f"同步配置格式非法：kdf.method 仅支持 "
            f"{' / '.join(sorted(_VALID_KDF_METHODS))}（实际 {method!r}）"
        )
    if not isinstance(salt_hex, str):
        raise SyncConfigError(
            "同步配置格式非法：kdf.method 与 kdf.salt 必须成对出现（salt 缺失或不是字符串）"
        )
    try:
        salt = bytes.fromhex(salt_hex)
    except ValueError as exc:
        raise SyncConfigError(
            "同步配置格式非法：kdf.salt 不是合法 hex 编码；请不要手动编辑 .sync/ 目录"
        ) from exc
    if len(salt) < SALT_LENGTH:
        raise SyncConfigError(
            f"同步配置格式非法：kdf.salt 长度不足 {SALT_LENGTH} 字节；"
            "请不要手动编辑 .sync/ 目录"
        )
    return cast(KdfMethod, method), salt_hex


def _parse_lamport(doc: dict[str, Any]) -> int:
    """校验并取出 ``lamport`` 字段（缺省 0；注意 ``bool`` 是 ``int`` 子类，须排除）。"""
    lamport = doc.get("lamport", 0)
    if not isinstance(lamport, int) or isinstance(lamport, bool) or lamport < 0:
        raise SyncConfigError("同步配置格式非法：lamport 必须是非负整数")
    return lamport


def _parse(doc: Any) -> SyncConfig:
    """把 JSON 文档校验并转换为 :class:`SyncConfig`；任何非法即抛错。"""
    if not isinstance(doc, dict):
        raise SyncConfigError("同步配置格式非法：顶层必须是 JSON 对象")
    if doc.get("version") != CONFIG_FORMAT_VERSION:
        raise SyncConfigError(
            f"同步配置版本不支持：期望 version={CONFIG_FORMAT_VERSION}，"
            f"实际 {doc.get('version')!r}；请确认引擎版本后重试"
        )
    kdf_method, kdf_salt_hex = _parse_kdf(doc)
    return SyncConfig(
        device_id=_parse_device_id(doc),
        sync_enabled=_parse_sync_enabled(doc),
        kdf_method=kdf_method,
        kdf_salt_hex=kdf_salt_hex,
        lamport=_parse_lamport(doc),
    )


# ---------------------------------------------------------------------------
# 公共 API：读 / 写 / 读取或创建
# ---------------------------------------------------------------------------
def load_config(data_dir: Path | None = None) -> SyncConfig:
    """读取 ``.sync/config.json``；不存在时返回**内存默认值（不落盘）**。

    ⚠ 文件不存在时返回的默认配置携带**临时 deviceId**，每次调用各不相同；
    需要稳定设备标识（首次启动场景）请使用 :func:`load_or_create_config`。

    Args:
        data_dir: 数据目录；``None`` 时走 ``cli._data_dir()``
            （``REMEMBER_ME_DATA_DIR`` 环境变量覆盖）。

    Returns:
        解析后的 :class:`SyncConfig`。

    Raises:
        SyncConfigError: 文件存在但读取失败、JSON 损坏或字段非法。
    """
    path = config_path(data_dir)
    if not path.exists():
        logger.debug("同步配置不存在，返回内存默认值（%s）", path)
        return _default_config()
    try:
        raw = path.read_text(encoding="utf-8")
    except OSError as exc:
        raise SyncConfigError(f"同步配置读取失败（{path}）：{exc}") from exc
    try:
        doc = json.loads(raw)
    except json.JSONDecodeError as exc:
        raise SyncConfigError(
            f"同步配置已损坏（{path}）：JSON 解析失败——{exc}；"
            "请不要手动编辑 .sync/ 目录；可删除该文件后重新完成首次绑定"
        ) from exc
    return _parse(doc)


def load_or_create_config(data_dir: Path | None = None) -> SyncConfig:
    """读取 ``.sync/config.json``；不存在则生成默认配置并**立即原子落盘**。

    首次启动入口：deviceId 自此在文件层面稳定，后续进程 / 其他模块
    （如 4.2.2 Lamport 时钟）读到的都是同一设备标识。

    Raises:
        SyncConfigError: 文件存在但损坏，或新建落盘失败。
    """
    path = config_path(data_dir)
    if path.exists():
        return load_config(data_dir)
    config = _default_config()
    save_config(config, data_dir)
    logger.info("已创建同步配置并生成设备标识（%s）", path)
    return config


def save_config(config: SyncConfig, data_dir: Path | None = None) -> None:
    """原子写入 ``.sync/config.json``（同目录临时文件 + ``os.replace``）。

    Args:
        config: 待持久化配置；``kdf_method`` 与 ``kdf_salt_hex`` 必须成对出现。
        data_dir: 数据目录；``None`` 时走 ``cli._data_dir()``。

    Raises:
        SyncConfigError: KDF 参数不成对，或底层写入失败（不残留临时文件）。
    """
    if (config.kdf_method is None) != (config.kdf_salt_hex is None):
        raise SyncConfigError(
            "KDF 参数必须成对设置：kdf.method 与 kdf.salt 缺一即无法在他端复现主密钥；"
            "请通过 SyncConfig.set_kdf_params() 成对写入"
        )

    path = config_path(data_dir)
    payload = json.dumps(config.to_dict(), ensure_ascii=False, indent=2)
    try:
        path.parent.mkdir(parents=True, exist_ok=True)
        fd, tmp_name = tempfile.mkstemp(
            dir=path.parent, prefix=".config-", suffix=".tmp"
        )
        try:
            with os.fdopen(fd, "w", encoding="utf-8") as tmp_file:
                tmp_file.write(payload)
            os.replace(tmp_name, path)
        except BaseException:
            # 替换失败时尽力清理临时文件，不留垃圾（沿用 FileKeyStore 先例）
            try:
                os.unlink(tmp_name)
            except OSError:
                pass
            raise
    except OSError as exc:
        raise SyncConfigError(f"同步配置写入失败（{path}）：{exc}") from exc
    logger.debug("同步配置已原子写入（%s）", path)

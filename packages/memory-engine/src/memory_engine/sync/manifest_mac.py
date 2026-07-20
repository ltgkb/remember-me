"""manifest HMAC 完整性原语 — 同步清单的签名、验签与损坏处置。

实现迭代计划 A3 与路线图 §6 风险表「Lamport 时钟状态损坏」行的既定方针：
``manifest.json`` 带 HMAC（MK 派生）自检，损坏即按「全新设备」重建并触发
全量冲突比对，而非静默覆盖云端。

密钥来源：:func:`memory_engine.crypto.kdf.derive_subkeys` 的 ``mk`` 子密钥
（HKDF ``info=b"remember-me:mk:v1"`` 域分离）。MK 与 DEK 在密码学上独立，
用 DEK 验签必然失败（域分离测试即据此断言）。

签名存储选型 —— **与清单分离的 ``manifest.json.sig`` 文件**（而非内嵌字段）：

1. **透明 JSON 哲学**（路线图 §1.1）：``manifest.json`` 保持纯 JSON，用户
   可直接阅读 / diff，不混入签名字段；
2. **免除 JSON 规范化（canonicalization）难题**：HMAC 直接覆盖磁盘上的
   **精确字节**，不存在键序 / 空白 / 浮点表示差异导致的跨端验签不一致；
   内嵌字段方案必须先定义「剔除 mac 字段后的规范序列化」，脆弱且易错；
3. **零耦合**：4.2.2 的 ``sync.manifest``（B2）按纯 JSON 读写清单，
   无需感知任何内嵌字段布局；
4. 代价是写序需「先清单后签名」、两文件可被独立删除——由原子写 +
   :func:`verify_manifest_mac` 的缺失即失败语义 + 损坏处置流程兜底。

``.sig`` 文件格式（JSON，版本 1）::

    {"version": 1, "alg": "HMAC-SHA256", "mac": "<32 字节 MAC 的 hex>"}

损坏处置（:func:`handle_corrupted_manifest`）：验签失败 → 备份损坏文件至
``.sync/corrupted-{ts}/`` → 原地重建空清单 → 返回 :class:`ManifestCorrupted`
状态标记。空清单模式为 ``{"version": 1, "files": {}}``（4.2.2 ``sync.manifest``
据此初始扫描并重建版本条目；模式演进归 B2 所有）。「全量冲突比对」属 4.2.2，
本轮仅以 :func:`request_full_conflict_rebuild` 留接口占位。

日志红线沿用 ``crypto.recovery``：绝不打印 MK、manifest 内容或其任何指纹，
仅记录路径、字节长度与操作结果。
"""

from __future__ import annotations

import hashlib
import hmac
import json
import logging
import os
import shutil
import tempfile
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from ..crypto.kdf import MASTER_KEY_LENGTH
from .errors import ManifestIntegrityError
from .paths import corrupted_backup_dir, manifest_mac_path, manifest_path

logger = logging.getLogger("memory_engine.sync.manifest_mac")

__all__ = [
    "SIG_FORMAT_VERSION",
    "MANIFEST_MAC_ALGORITHM",
    "EMPTY_MANIFEST_BYTES",
    "ManifestCorrupted",
    "write_manifest_mac",
    "verify_manifest_mac",
    "handle_corrupted_manifest",
    "request_full_conflict_rebuild",
]

SIG_FORMAT_VERSION = 1
"""``.sig`` 签名文件格式版本。"""

MANIFEST_MAC_ALGORITHM = "HMAC-SHA256"
"""签名算法标识，写入 ``.sig`` 以便未来算法迁移时识别。"""

EMPTY_MANIFEST_BYTES = (
    json.dumps({"version": 1, "files": {}}, ensure_ascii=False, indent=2) + "\n"
).encode("utf-8")
"""损坏重建用的空清单字节：``{"version": 1, "files": {}}``（UTF-8，尾部换行）。"""


@dataclass(frozen=True)
class ManifestCorrupted:
    """manifest 验签失败后的损坏处置结果标记（路线图 §6「按全新设备重建」语义）。

    Attributes:
        backup_dir: 损坏文件备份目录（``.sync/corrupted-{ts}/``）。
        backed_up_files: 实际备份的文件名（``manifest.json`` / ``manifest.json.sig``
            中存在者的子集）。
        manifest_path: 已重建的空清单路径。
        sig_path: 重建后的签名文件路径；``mk`` 未提供时为 ``None``
            （旧签名已备份并移除，待 4.2.2 ``sync.manifest`` 下次写清单时重签）。
        rebuilt_at: 重建时间（ISO 8601 UTC）。
        reason: 触发处置的原因描述（通常来自验签异常信息），供审计日志使用。
    """

    backup_dir: Path
    backed_up_files: tuple[str, ...]
    manifest_path: Path
    sig_path: Path | None
    rebuilt_at: str
    reason: str


# ---------------------------------------------------------------------------
# 内部工具
# ---------------------------------------------------------------------------
def _check_mk(mk: bytes) -> None:
    """校验 MK 长度，非法即抛 :class:`ManifestIntegrityError`。"""
    if len(mk) != MASTER_KEY_LENGTH:
        raise ManifestIntegrityError(
            f"MK 长度必须为 {MASTER_KEY_LENGTH} 字节（实际 {len(mk)} 字节）；"
            "请使用 kdf.derive_subkeys() 派生的 mk 子密钥"
        )


def _compute_mac(data: bytes, mk: bytes) -> bytes:
    """计算 ``data`` 的 HMAC-SHA256（MK 为密钥）。"""
    _check_mk(mk)
    return hmac.new(mk, data, hashlib.sha256).digest()


def _atomic_write(path: Path, payload: bytes) -> None:
    """原子写入：同目录临时文件 + ``os.replace``（沿用 FileKeyStore 先例）。"""
    try:
        path.parent.mkdir(parents=True, exist_ok=True)
        fd, tmp_name = tempfile.mkstemp(dir=path.parent, prefix=".mac-", suffix=".tmp")
        try:
            with os.fdopen(fd, "wb") as tmp_file:
                tmp_file.write(payload)
            os.replace(tmp_name, path)
        except BaseException:
            try:
                os.unlink(tmp_name)
            except OSError:
                pass
            raise
    except OSError as exc:
        raise ManifestIntegrityError(f"manifest 签名 / 清单写入失败（{path}）：{exc}") from exc


def _read_sig_document(path: Path) -> dict[str, Any]:
    """读取并解析 ``.sig`` 文件；缺失 / 损坏一律抛 :class:`ManifestIntegrityError`。"""
    if not path.exists():
        raise ManifestIntegrityError(
            f"manifest 签名文件不存在（{path}）：无法证明清单完整性，"
            "请按损坏处置流程处理（handle_corrupted_manifest）"
        )
    try:
        raw = path.read_text(encoding="utf-8")
    except OSError as exc:
        raise ManifestIntegrityError(f"manifest 签名文件读取失败（{path}）：{exc}") from exc
    try:
        doc = json.loads(raw)
    except json.JSONDecodeError as exc:
        raise ManifestIntegrityError(
            f"manifest 签名文件已损坏（{path}）：JSON 解析失败——{exc}"
        ) from exc
    if (
        not isinstance(doc, dict)
        or doc.get("version") != SIG_FORMAT_VERSION
        or doc.get("alg") != MANIFEST_MAC_ALGORITHM
        or not isinstance(doc.get("mac"), str)
    ):
        raise ManifestIntegrityError(
            f"manifest 签名文件格式非法或版本不支持（{path}）：期望 version="
            f"{SIG_FORMAT_VERSION}、alg={MANIFEST_MAC_ALGORITHM} 且含 mac 字段"
        )
    return doc


# ---------------------------------------------------------------------------
# 公共 API：签名 / 验签
# ---------------------------------------------------------------------------
def write_manifest_mac(data: bytes, mk: bytes, data_dir: Path | None = None) -> Path:
    """计算 manifest 序列化字节的 HMAC-SHA256 并原子写入 ``.sync/manifest.json.sig``。

    调用约定：先写完 ``manifest.json``，再以**落盘的精确字节**调用本函数
    （读回文件字节传入即可），保证 HMAC 覆盖的内容与磁盘一致。

    Args:
        data: manifest 序列化字节（通常是 ``manifest.json`` 的文件内容）。
        mk: :func:`kdf.derive_subkeys` 派生的 32 字节 MK 子密钥。
        data_dir: 数据目录；``None`` 时走 ``cli._data_dir()``。

    Returns:
        签名文件路径（``.sync/manifest.json.sig``）。

    Raises:
        ManifestIntegrityError: MK 长度非法或底层写入失败。
    """
    mac = _compute_mac(data, mk)
    doc = {"version": SIG_FORMAT_VERSION, "alg": MANIFEST_MAC_ALGORITHM, "mac": mac.hex()}
    payload = (json.dumps(doc, ensure_ascii=False, indent=2) + "\n").encode("utf-8")
    path = manifest_mac_path(data_dir)
    _atomic_write(path, payload)
    logger.debug("manifest 签名已原子写入（%s，清单 %d 字节）", path, len(data))
    return path


def verify_manifest_mac(data: bytes, mk: bytes, data_dir: Path | None = None) -> None:
    """读取 ``.sync/manifest.json.sig`` 并校验 manifest 序列化字节的完整性。

    采用 ``hmac.compare_digest`` 常量时间比较，防时序侧信道。

    Args:
        data: manifest 序列化字节（与签名时传入的完全一致）。
        mk: :func:`kdf.derive_subkeys` 派生的 32 字节 MK 子密钥。
        data_dir: 数据目录；``None`` 时走 ``cli._data_dir()``。

    Raises:
        ManifestIntegrityError: 签名文件缺失 / 损坏 / 格式非法，或 HMAC 不匹配
            （清单已损坏或遭篡改）。失败时**绝不返回部分清单数据**，调用方应走
            :func:`handle_corrupted_manifest` 处置。
    """
    doc = _read_sig_document(manifest_mac_path(data_dir))
    try:
        actual = bytes.fromhex(doc["mac"])
    except ValueError as exc:
        raise ManifestIntegrityError(
            "manifest 签名文件已损坏：mac 字段不是合法 hex 编码"
        ) from exc
    expected = _compute_mac(data, mk)
    if not hmac.compare_digest(actual, expected):
        raise ManifestIntegrityError(
            "manifest 完整性校验失败：清单内容已损坏或遭篡改（HMAC 不匹配）；"
            "请勿手动编辑 .sync/ 目录，将按「全新设备」语义备份并重建空清单"
        )
    logger.debug("manifest 完整性校验通过（清单 %d 字节）", len(data))


# ---------------------------------------------------------------------------
# 公共 API：损坏处置（「损坏即按全新设备重建」语义原语）
# ---------------------------------------------------------------------------
def handle_corrupted_manifest(
    data_dir: Path | None = None,
    *,
    mk: bytes | None = None,
    reason: str = "",
    now: datetime | None = None,
) -> ManifestCorrupted:
    """manifest 损坏处置：备份损坏文件 → 原地重建空清单 → 返回状态标记。

    执行步骤：

    1. 在 ``.sync/`` 下创建 ``corrupted-{UTC 时间戳}`` 备份目录（同一秒
       重复处置时自动追加 ``-2`` / ``-3`` 后缀防撞名）；
    2. 将现存的 ``manifest.json`` / ``manifest.json.sig`` **复制**进备份目录
       （保留取证现场，原文件随后被原子重建覆盖）；
    3. 原地原子重建空清单（:data:`EMPTY_MANIFEST_BYTES`）；
    4. 提供 ``mk`` 时立即为空清单重签；未提供时移除旧签名文件（已备份），
       待 4.2.2 ``sync.manifest`` 下次写清单时重签——避免旧签名与新空清单
       不匹配造成的「反复判损坏」循环。

    Args:
        data_dir: 数据目录；``None`` 时走 ``cli._data_dir()``。
        mk: 可选 MK；提供时为空清单立即重签。
        reason: 触发原因（通常为验签异常信息），记入结果与日志供审计。
        now: 时间戳注入点（测试用）；``None`` 取当前 UTC 时间。

    Returns:
        :class:`ManifestCorrupted` 状态标记。

    Raises:
        ManifestIntegrityError: MK 长度非法或备份 / 重建 IO 失败。
    """
    moment = now if now is not None else datetime.now(timezone.utc)
    timestamp = moment.strftime("%Y%m%dT%H%M%SZ")
    backup_dir = corrupted_backup_dir(timestamp, data_dir)
    suffix = 2
    while backup_dir.exists():
        backup_dir = corrupted_backup_dir(f"{timestamp}-{suffix}", data_dir)
        suffix += 1

    manifest = manifest_path(data_dir)
    sig = manifest_mac_path(data_dir)
    backed_up: list[str] = []
    try:
        backup_dir.mkdir(parents=True)
        for source in (manifest, sig):
            if source.exists():
                shutil.copy2(source, backup_dir / source.name)
                backed_up.append(source.name)
    except OSError as exc:
        raise ManifestIntegrityError(
            f"manifest 损坏备份失败（{backup_dir}）：{exc}"
        ) from exc

    _atomic_write(manifest, EMPTY_MANIFEST_BYTES)

    new_sig: Path | None = None
    if mk is not None:
        new_sig = write_manifest_mac(EMPTY_MANIFEST_BYTES, mk, data_dir)
    elif sig.exists():
        # 旧签名已备份；移除以免与新空清单不匹配而反复判损坏（待 B2 重签）
        try:
            sig.unlink()
        except OSError as exc:
            raise ManifestIntegrityError(
                f"旧 manifest 签名移除失败（{sig}）：{exc}"
            ) from exc

    result = ManifestCorrupted(
        backup_dir=backup_dir,
        backed_up_files=tuple(backed_up),
        manifest_path=manifest,
        sig_path=new_sig,
        rebuilt_at=moment.isoformat(),
        reason=reason,
    )
    logger.warning(
        "manifest 已按「全新设备」语义重建：备份 %d 个文件至 %s，空清单已重建%s；原因：%s",
        len(backed_up),
        backup_dir,
        "并完成重签" if new_sig is not None else "（待下次写清单时重签）",
        reason or "未提供",
    )
    return result


def request_full_conflict_rebuild(corrupted: ManifestCorrupted) -> None:
    """全量冲突比对接口占位（Phase 4.2.2，本轮不实现）。

    路线图 §6 既定方针：manifest 损坏按「全新设备」重建后，必须触发与云端的
    全量冲突比对来收敛状态，而非静默覆盖云端。该流程依赖 4.2.2 的
    ``sync.manifest`` diff 能力与云端适配器，本轮仅冻结调用契约：
    调用方（验签失败处置点）拿到 :class:`ManifestCorrupted` 后调用本函数。

    Args:
        corrupted: :func:`handle_corrupted_manifest` 的处置结果。

    Raises:
        NotImplementedError: 全量冲突比对属 Phase 4.2.2 范围。
    """
    raise NotImplementedError(
        "全量冲突比对属 Phase 4.2.2 范围（sync.manifest diff + 云端适配器），"
        f"本轮仅留接口占位；损坏现场已备份至 {corrupted.backup_dir}"
    )

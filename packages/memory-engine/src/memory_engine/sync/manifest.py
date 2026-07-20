"""FileVersion 清单 — 同步协议的版本元数据中心（架构 §3.2 / §2.2）。

实现 ``docs/design/cloud-sync-architecture-2026-07-16.md`` §3.2 的
``FileVersion`` 数据模型与 ``docs/design/cloud-sync-roadmap-2026-07-18.md``
§3.3 的清单交付物：清单读写（``.sync/manifest.json``）、四分 diff
（新增 / 变更 / 冲突 / 伪冲突）、本地数据源扫描构建。

**数据模型（字段与架构 §3.2 逐项对齐）**：:class:`FileVersion` 五字段
``filepath / lamport / deviceId / contentHash / modifiedAt``——刻意沿用
架构 TypeScript 接口的 camelCase 命名（而非 Python 惯例 snake_case），
保证清单 JSON 与架构定义逐字一致、跨语言序列化零映射成本。

**清单文件格式（版本 1）**::

    {
      "version": 1,
      "files": {
        "profile.json": {
          "lamport": 3,
          "deviceId": "<uuid4>",
          "contentHash": "<64 字符小写 hex，SHA-256>",
          "modifiedAt": "<ISO 8601，UTC 偏移>"
        },
        ...
      }
    }

向后兼容：与 ``manifest_mac.EMPTY_MANIFEST_BYTES``（``{"version": 1,
"files": {}}``）初始模式完全兼容——损坏处置重建的空清单可直接被
:meth:`Manifest.load` 解析为空清单。模式演进约定：``version`` 字段保留且
单调递增；新增顶层可选字段不算破坏性变更（旧解析器忽略未知字段），
变更 ``files`` 条目结构或移除字段必须 bump version 并在 ``from_dict``
中保留旧版解析分支。

**完整性**：读写全程经 ``manifest_mac`` 的 HMAC-SHA256 保护——
:meth:`Manifest.save` 先原子写清单再 ``write_manifest_mac`` 签名；
:meth:`Manifest.load` 先 ``verify_manifest_mac`` 验签再解析，验签失败
即走 ``handle_corrupted_manifest`` 既定处置（备份 ``corrupted-{ts}/`` +
重建空清单 + 重签），处置标记记入返回实例的 ``corruption`` 字段供审计
与 4.2.2 全量冲突比对（``request_full_conflict_rebuild``）使用。

**diff 四分语义**（:meth:`Manifest.diff` 的精确定义，对齐架构 §3.2）：

* **新增**：仅一侧存在的文件——``added_local``（仅本地，待上传）与
  ``added_remote``（仅远端，待下载）两个方向；
* **变更** ``changed``：双侧存在、``contentHash`` 不同、且 lamport 值不同——
  单侧严格领先，按字典序全序 LWW **自动收敛**（大者胜），无需用户介入；
* **冲突** ``conflicts``：双侧存在、``contentHash`` 不同、且 **lamport 相等**——
  即「双方 lamport 分叉」的本地可判定定义：同一逻辑时刻的并发写入
  （deviceId 不同），或同一 deviceId 下 lamport 重复（时钟状态损坏 /
  回放的信号）。两种形态都无法用全序判定先后，必须交 4.2.2 冲突策略
  引擎（架构 §3.3 三级策略）处置，本轮只负责识别与标记；
* **伪冲突** ``pseudo_conflicts``：双侧存在、``contentHash`` **相同**但
  lamport / deviceId / modifiedAt 任一项不同（架构 §3.2「内容哈希用于
  检测伪冲突：内容相同但时间戳不同」）——内容一致，无数据分歧，
  仅元数据以 LWW 胜者为准重写即可自动收敛，**不传输内容、不打扰用户**。
  四项元数据全同则视为「同步中」，不进入任何分类。

**contentHash 约定（供 chunker / queue 并行代理对齐）**：
整文件内容的 **SHA-256，小写 hex 编码（64 字符）**，对本地文件原始字节
流一次性计算。 chunker 的「整文件根哈希」必须与本约定一致（对同一字节
流的 SHA-256），增量上传窗口才能直接复用清单哈希做内容判等。
注意按明文内容计算而非密文：AES-256-GCM 的随机 IV 使同明文每次加密
密文不同，若以密文哈希判等，跨设备比较将永远分歧；明文哈希保证
「同内容 → 同哈希 → 伪冲突自动收敛」。

**扫描数据源约定**（架构 §2.2 加密粒度表，:func:`scan_sync_files`）：
``profile.json``、``projects/*/context.json``、
``projects/*/conversations/*.json``、``search-settings.json`` 四类；
``.sync/`` / ``.backups/`` / ``templates/`` 与隐藏目录（``.`` 开头）一律
排除（路线图 §5.1：备份与模板属本地资产，不同步）。清单键（``filepath``）
一律为相对数据目录的 **POSIX 路径**（``/`` 分隔），保证 Windows 与
macOS 设备产出逐字一致的清单键。

日志红线沿用 ``manifest_mac``：不打印文件内容、contentHash 全值与 MK。
"""

from __future__ import annotations

import hashlib
import json
import logging
import os
import tempfile
from dataclasses import dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from ..cli import _data_dir
from .errors import ManifestIntegrityError, SyncError
from .lamport import LamportClock, Stamp, compare
from .manifest_mac import (
    ManifestCorrupted,
    handle_corrupted_manifest,
    verify_manifest_mac,
    write_manifest_mac,
)
from .paths import manifest_path

logger = logging.getLogger("memory_engine.sync.manifest")

__all__ = [
    "MANIFEST_FORMAT_VERSION",
    "SYNC_TOP_LEVEL_FILES",
    "PROJECTS_DIR_NAME",
    "CONTEXT_FILENAME",
    "CONVERSATIONS_DIR_NAME",
    "EXCLUDED_DIR_NAMES",
    "FileVersion",
    "VersionPair",
    "ManifestDiff",
    "Manifest",
    "scan_sync_files",
    "hash_file_content",
    "build_manifest",
]

MANIFEST_FORMAT_VERSION = 1
"""``manifest.json`` 格式版本（演进约定见模块 docstring「向后兼容」段）。"""

SYNC_TOP_LEVEL_FILES: tuple[str, ...] = ("profile.json", "search-settings.json")
"""数据目录顶层纳入同步范围的文件（架构 §2.2 加密粒度表）。"""

PROJECTS_DIR_NAME = "projects"
"""项目目录名；其下 ``*/context.json`` 与 ``*/conversations/*.json`` 纳入同步。"""

CONTEXT_FILENAME = "context.json"
"""项目上下文文件名（架构 §2.2）。"""

CONVERSATIONS_DIR_NAME = "conversations"
"""项目对话历史目录名；其下全部 ``*.json`` 单文件纳入同步（架构 §2.2）。"""

EXCLUDED_DIR_NAMES: frozenset[str] = frozenset({".sync", ".backups", "templates"})
"""永不纳入同步范围的目录名（路线图 §5.1：备份与模板属本地资产）。"""

_HEX_DIGITS = frozenset("0123456789abcdef")


# ---------------------------------------------------------------------------
# FileVersion 数据模型（架构 §3.2 逐项对齐）
# ---------------------------------------------------------------------------
@dataclass(frozen=True)
class FileVersion:
    """单文件版本元数据——架构 §3.2 ``FileVersion`` 接口的 Python 落地。

    字段名刻意沿用架构 TypeScript 接口的 camelCase（``deviceId`` /
    ``contentHash`` / ``modifiedAt``），保证清单 JSON 与架构定义逐字一致、
    跨语言零映射。``frozen=True``：版本条目创建后不可变，更新只能以
    新条目整体替换（与 LWW「整版本覆盖」语义一致）。

    Attributes:
        filepath: 相对数据目录的 POSIX 路径（``/`` 分隔，跨平台稳定）。
        lamport: 单调递增的逻辑时钟值（非负整数）。
        deviceId: 产生该版本的设备唯一标识（UUID4 字符串）。
        contentHash: 整文件内容 SHA-256（小写 hex，64 字符；约定见模块
            docstring「contentHash 约定」段）。
        modifiedAt: 文件修改时间（ISO 8601，必须带 UTC 偏移）。
    """

    filepath: str
    lamport: int
    deviceId: str
    contentHash: str
    modifiedAt: str

    def __post_init__(self) -> None:
        """结构校验：任何非法字段一律抛 :class:`SyncError`，绝不留非法版本。"""
        if (
            not isinstance(self.filepath, str)
            or not self.filepath
            or self.filepath.startswith("/")
            or "\\" in self.filepath
            or ".." in self.filepath.split("/")
        ):
            raise SyncError(
                f"FileVersion 格式非法：filepath 必须是相对 POSIX 路径"
                f"（实际 {self.filepath!r}）"
            )
        if (
            not isinstance(self.lamport, int)
            or isinstance(self.lamport, bool)
            or self.lamport < 0
        ):
            raise SyncError(
                f"FileVersion 格式非法：{self.filepath} 的 lamport 必须是非负整数"
                f"（实际 {self.lamport!r}）"
            )
        if not isinstance(self.deviceId, str) or not self.deviceId:
            raise SyncError(
                f"FileVersion 格式非法：{self.filepath} 的 deviceId 必须是非空字符串"
                f"（实际 {self.deviceId!r}）"
            )
        if (
            not isinstance(self.contentHash, str)
            or len(self.contentHash) != 64
            or any(ch not in _HEX_DIGITS for ch in self.contentHash)
        ):
            raise SyncError(
                f"FileVersion 格式非法：{self.filepath} 的 contentHash 必须是"
                f" 64 字符小写 hex（SHA-256，实际 {self.contentHash!r}）"
            )
        if not isinstance(self.modifiedAt, str):
            raise SyncError(
                f"FileVersion 格式非法：{self.filepath} 的 modifiedAt 必须是"
                f" ISO 8601 字符串（实际 {self.modifiedAt!r}）"
            )
        try:
            parsed = datetime.fromisoformat(self.modifiedAt)
        except ValueError as exc:
            raise SyncError(
                f"FileVersion 格式非法：{self.filepath} 的 modifiedAt 不是合法"
                f" ISO 8601（实际 {self.modifiedAt!r}）"
            ) from exc
        if parsed.tzinfo is None:
            raise SyncError(
                f"FileVersion 格式非法：{self.filepath} 的 modifiedAt 必须带"
                f" UTC 偏移（架构 §3.2 要求 ISO 8601 UTC，实际 {self.modifiedAt!r}）"
            )

    def stamp(self) -> Stamp:
        """版本印记 ``(lamport, deviceId)``——字典序全序比较单元（架构 §3.2）。"""
        return (self.lamport, self.deviceId)

    def to_dict(self) -> dict[str, Any]:
        """序列化为清单 ``files`` 条目（键即 filepath，条目内不重复存储）。"""
        return {
            "lamport": self.lamport,
            "deviceId": self.deviceId,
            "contentHash": self.contentHash,
            "modifiedAt": self.modifiedAt,
        }


# ---------------------------------------------------------------------------
# diff 结果类型
# ---------------------------------------------------------------------------
@dataclass(frozen=True)
class VersionPair:
    """同一文件的双端版本对（diff 结果条目）。

    Attributes:
        local: 本地版本。
        remote: 远端版本。
    """

    local: FileVersion
    remote: FileVersion

    @property
    def lww_winner(self) -> FileVersion:
        """LWW 胜者：``(lamport, deviceId)`` 字典序大者（架构 §3.3 默认策略）。

        变更 / 伪冲突分类下可直接采用；冲突分类下仅为默认值，最终取舍
        由 4.2.2 冲突策略引擎（手动合并 / 追加合并）决定。两印记完全相等
        （同 lamport 同 deviceId 但 contentHash 不同的损坏形态）时确定性
        返回本地版本。
        """
        if compare(self.local.stamp(), self.remote.stamp()) >= 0:
            return self.local
        return self.remote


@dataclass(frozen=True)
class ManifestDiff:
    """清单 diff 四分结果（精确定义见模块 docstring「diff 四分语义」段）。

    Attributes:
        added_local: 新增·仅本地存在（待上传），键为 filepath。
        added_remote: 新增·仅远端存在（待下载），键为 filepath。
        changed: 变更·contentHash 不同且 lamport 不同——LWW 自动收敛。
        conflicts: 冲突·contentHash 不同且 lamport 相等（并发分叉 / 时钟
            损坏）——必须交 4.2.2 冲突策略引擎，不可自动覆盖。
        pseudo_conflicts: 伪冲突·contentHash 相同但元数据不同——内容一致，
            仅元数据以 LWW 胜者重写，不传输内容。
    """

    added_local: dict[str, FileVersion] = field(default_factory=dict)
    added_remote: dict[str, FileVersion] = field(default_factory=dict)
    changed: dict[str, VersionPair] = field(default_factory=dict)
    conflicts: dict[str, VersionPair] = field(default_factory=dict)
    pseudo_conflicts: dict[str, VersionPair] = field(default_factory=dict)

    @property
    def clean(self) -> bool:
        """双端清单完全一致（五个分类全空）。"""
        return not (
            self.added_local
            or self.added_remote
            or self.changed
            or self.conflicts
            or self.pseudo_conflicts
        )

    @property
    def total(self) -> int:
        """差异条目总数（五分类之和）。"""
        return (
            len(self.added_local)
            + len(self.added_remote)
            + len(self.changed)
            + len(self.conflicts)
            + len(self.pseudo_conflicts)
        )


# ---------------------------------------------------------------------------
# Manifest：清单读写（HMAC 全程保护）+ diff
# ---------------------------------------------------------------------------
@dataclass
class Manifest:
    """``manifest.json`` 的内存表示与读写 / diff 入口。

    Attributes:
        files: 文件版本表，键为 POSIX 相对路径（同 :attr:`FileVersion.filepath`）。
        corruption: :meth:`load` 触发损坏处置时的审计标记（备份目录、原因等），
            正常加载为 ``None``；不参与相等比较，4.2.2 全量冲突比对据此
            调用 ``request_full_conflict_rebuild``。
    """

    files: dict[str, FileVersion] = field(default_factory=dict)
    corruption: ManifestCorrupted | None = field(default=None, compare=False, repr=False)

    # ------------------------------------------------------------------
    # 集合操作
    # ------------------------------------------------------------------
    def get(self, filepath: str) -> FileVersion | None:
        """按路径取版本条目；不存在返回 ``None``。"""
        return self.files.get(filepath)

    def upsert(self, version: FileVersion) -> None:
        """写入 / 整体覆盖一个版本条目（LWW「整版本覆盖」语义）。"""
        self.files[version.filepath] = version

    def remove(self, filepath: str) -> FileVersion | None:
        """移除路径条目并返回之；不存在返回 ``None``。"""
        return self.files.pop(filepath, None)

    # ------------------------------------------------------------------
    # 序列化
    # ------------------------------------------------------------------
    def to_dict(self) -> dict[str, Any]:
        """序列化为 JSON 可写结构（``files`` 按键排序，输出确定）。"""
        return {
            "version": MANIFEST_FORMAT_VERSION,
            "files": {
                path: self.files[path].to_dict() for path in sorted(self.files)
            },
        }

    def to_bytes(self) -> bytes:
        """序列化为落盘字节（canonical 形式：sort_keys + indent=2 + 尾部换行）。

        同一内容永远产出同一字节流，保证 HMAC 输入确定、文件 diff 友好。
        """
        payload = json.dumps(self.to_dict(), ensure_ascii=False, indent=2, sort_keys=True)
        return (payload + "\n").encode("utf-8")

    @classmethod
    def from_dict(cls, doc: Any) -> Manifest:
        """解析并校验 JSON 文档；任何非法即抛 :class:`SyncError`（不返回部分数据）。"""
        if not isinstance(doc, dict):
            raise SyncError("manifest 格式非法：顶层必须是 JSON 对象")
        if doc.get("version") != MANIFEST_FORMAT_VERSION:
            raise SyncError(
                f"manifest 版本不支持：期望 version={MANIFEST_FORMAT_VERSION}，"
                f"实际 {doc.get('version')!r}；请确认引擎版本后重试"
            )
        files_doc = doc.get("files")
        if not isinstance(files_doc, dict):
            raise SyncError("manifest 格式非法：files 段缺失或不是对象")
        files: dict[str, FileVersion] = {}
        for path, entry in files_doc.items():
            if not isinstance(entry, dict):
                raise SyncError(
                    f"manifest 格式非法：文件 {path} 的版本条目必须是 JSON 对象"
                )
            try:
                files[path] = FileVersion(
                    filepath=path,
                    lamport=entry["lamport"],
                    deviceId=entry["deviceId"],
                    contentHash=entry["contentHash"],
                    modifiedAt=entry["modifiedAt"],
                )
            except KeyError as exc:
                raise SyncError(
                    f"manifest 格式非法：文件 {path} 的版本条目缺少字段 {exc}；"
                    "请不要手动编辑 .sync/ 目录"
                ) from exc
        return cls(files=files)

    @classmethod
    def from_bytes(cls, data: bytes) -> Manifest:
        """从序列化字节解析清单；JSON 损坏即抛 :class:`SyncError`。

        与 ``EMPTY_MANIFEST_BYTES`` 初始模式向后兼容（``{"version": 1,
        "files": {}}`` 解析为空清单）。
        """
        try:
            doc = json.loads(data.decode("utf-8"))
        except (UnicodeDecodeError, json.JSONDecodeError) as exc:
            raise SyncError(f"manifest 内容已损坏：JSON 解析失败——{exc}") from exc
        return cls.from_dict(doc)

    # ------------------------------------------------------------------
    # 落盘（HMAC 全程保护；损坏走 manifest_mac 既定处置）
    # ------------------------------------------------------------------
    def save(self, mk: bytes, data_dir: Path | None = None) -> Path:
        """原子写入 ``manifest.json`` 并以 MK 计算 HMAC 写入 ``manifest.json.sig``。

        写序固定「先清单后签名」（``manifest_mac`` 既定调用约定：HMAC 覆盖
        落盘的精确字节）。

        Args:
            mk: ``kdf.derive_subkeys`` 派生的 32 字节 MK 子密钥。
            data_dir: 数据目录；``None`` 时走 ``cli._data_dir()``。

        Returns:
            清单文件路径。

        Raises:
            SyncError: 清单写入失败（不残留临时文件）。
            ManifestIntegrityError: MK 非法或签名写入失败。
        """
        payload = self.to_bytes()
        path = manifest_path(data_dir)
        _atomic_write(path, payload)
        write_manifest_mac(payload, mk, data_dir)
        logger.debug("manifest 已原子写入并重签（%s，%d 个文件条目）", path, len(self.files))
        return path

    @classmethod
    def load(cls, mk: bytes, data_dir: Path | None = None) -> Manifest:
        """读取 ``manifest.json``：先验签后解析，验签失败走损坏处置。

        语义矩阵：

        * 清单不存在 → 返回空清单（全新设备语义，**不**触发损坏处置）；
        * 验签失败（篡改 / 签名缺失 / 签名损坏）→
          ``handle_corrupted_manifest`` 备份 + 重建空清单 + 重签，
          返回空清单且 ``corruption`` 字段携带处置标记；
        * 验签通过但 JSON / 字段非法 → 抛 :class:`SyncError`
          （验签通过的字节必是本模块写出的，此分支属内部缺陷或磁盘故障，
          不按「遭篡改」语义重建）。

        Args:
            mk: ``kdf.derive_subkeys`` 派生的 32 字节 MK 子密钥。
            data_dir: 数据目录；``None`` 时走 ``cli._data_dir()``。

        Raises:
            SyncError: 清单读取失败，或验签通过但内容非法。
            ManifestIntegrityError: MK 长度非法。
        """
        path = manifest_path(data_dir)
        if not path.exists():
            logger.debug("manifest 不存在，返回空清单（全新设备语义，%s）", path)
            return cls()
        try:
            raw = path.read_bytes()
        except OSError as exc:
            raise SyncError(f"manifest 读取失败（{path}）：{exc}") from exc
        try:
            verify_manifest_mac(raw, mk, data_dir)
        except ManifestIntegrityError as exc:
            corrupted = handle_corrupted_manifest(data_dir, mk=mk, reason=str(exc))
            return cls(corruption=corrupted)
        return cls.from_bytes(raw)

    # ------------------------------------------------------------------
    # diff：新增 / 变更 / 冲突 / 伪冲突 四分（语义见模块 docstring）
    # ------------------------------------------------------------------
    def diff(self, remote: Manifest) -> ManifestDiff:
        """以本清单为 local、``remote`` 为远端，计算四分差异。

        分类规则（同一文件双侧存在时）：

        1. ``contentHash`` 相同：元数据（lamport / deviceId / modifiedAt）
           全同 → 同步中，不进入任何分类；任一不同 → 伪冲突；
        2. ``contentHash`` 不同且 lamport 相等 → 冲突（并发分叉 / 时钟损坏，
           全序无法判定先后）；
        3. ``contentHash`` 不同且 lamport 不同 → 变更（LWW 自动收敛）。

        分类结果确定且与调用方向对称：``local.diff(remote)`` 的
        ``added_local`` 即 ``remote.diff(local)`` 的 ``added_remote``。
        """
        added_local: dict[str, FileVersion] = {}
        added_remote: dict[str, FileVersion] = {}
        changed: dict[str, VersionPair] = {}
        conflicts: dict[str, VersionPair] = {}
        pseudo: dict[str, VersionPair] = {}

        for path, local_version in self.files.items():
            remote_version = remote.files.get(path)
            if remote_version is None:
                added_local[path] = local_version
                continue
            pair = VersionPair(local=local_version, remote=remote_version)
            if local_version.contentHash == remote_version.contentHash:
                if (local_version.lamport, local_version.deviceId, local_version.modifiedAt) != (
                    remote_version.lamport,
                    remote_version.deviceId,
                    remote_version.modifiedAt,
                ):
                    pseudo[path] = pair
            elif local_version.lamport == remote_version.lamport:
                conflicts[path] = pair
            else:
                changed[path] = pair

        for path, remote_version in remote.files.items():
            if path not in self.files:
                added_remote[path] = remote_version

        return ManifestDiff(
            added_local=added_local,
            added_remote=added_remote,
            changed=changed,
            conflicts=conflicts,
            pseudo_conflicts=pseudo,
        )


# ---------------------------------------------------------------------------
# 扫描与构建（架构 §2.2 数据源约定）
# ---------------------------------------------------------------------------
def _base(data_dir: Path | None) -> Path:
    """解析数据目录：显式参数优先，否则走 ``cli._data_dir()`` 环境约定。"""
    return data_dir if data_dir is not None else _data_dir()


def scan_sync_files(data_dir: Path | None = None) -> list[str]:
    """枚举同步数据源文件（架构 §2.2 四类），返回排序后的 POSIX 相对路径。

    范围：``profile.json``、``search-settings.json``、
    ``projects/*/context.json``、``projects/*/conversations/*.json``；
    ``.sync/`` / ``.backups/`` / ``templates/`` / 隐藏目录（``.`` 开头）
    一律排除（路线图 §5.1）。不存在的文件 / 目录静默跳过（首轮同步前
    数据目录可能只有部分数据源）。纯枚举，不读文件内容。
    """
    root = _base(data_dir)
    candidates: list[Path] = []

    for name in SYNC_TOP_LEVEL_FILES:
        candidate = root / name
        if candidate.is_file():
            candidates.append(candidate)

    projects_root = root / PROJECTS_DIR_NAME
    if projects_root.is_dir():
        for project_dir in sorted(projects_root.iterdir()):
            if not project_dir.is_dir():
                continue
            context = project_dir / CONTEXT_FILENAME
            if context.is_file():
                candidates.append(context)
            conversations_dir = project_dir / CONVERSATIONS_DIR_NAME
            if conversations_dir.is_dir():
                for entry in sorted(conversations_dir.iterdir()):
                    if entry.is_file() and entry.suffix == ".json":
                        candidates.append(entry)

    scanned: list[str] = []
    for candidate in candidates:
        relative = candidate.relative_to(root)
        # 纵深防御：任何路径段命中排除目录或以 "." 开头（隐藏目录）即剔除
        if any(
            part in EXCLUDED_DIR_NAMES or part.startswith(".")
            for part in relative.parts[:-1]
        ):
            continue
        scanned.append(relative.as_posix())
    return sorted(scanned)


def hash_file_content(path: Path) -> str:
    """计算文件内容的 SHA-256（小写 hex，64 字符；分块流式读取）。

    与清单 ``contentHash`` 约定一致：对文件原始字节流一次性哈希——
    chunker 的整文件根哈希对同一字节流计算时将得到同一值。
    """
    digest = hashlib.sha256()
    with path.open("rb") as file_obj:
        for chunk in iter(lambda: file_obj.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def build_manifest(
    data_dir: Path | None = None,
    *,
    clock: LamportClock,
    base: Manifest | None = None,
) -> Manifest:
    """扫描 ``data_dir`` 数据源并构建本地清单（不验签、不落盘）。

    版本印记分配规则：

    * ``base`` 中已存在且 ``contentHash`` 不变的条目 → **原样保留**
      （含 lamport / deviceId / modifiedAt），避免无内容变化的版本膨胀
      与无谓的跨端元数据分歧；
    * 新增 / 内容变化条目 → ``clock.tick()`` 取新 lamport，deviceId 取
      时钟设备标识，``modifiedAt`` 取文件 mtime（UTC ISO 8601）；
    * ``base`` 中已从磁盘消失的条目 → 移除。

    注意：本函数不读取 ``manifest.json`` 也不写盘——「load → build(base=…)
    → diff → save」的完整编排属 4.2.2 worker 窗口，本轮只交付原语。

    Args:
        data_dir: 数据目录；``None`` 时走 ``cli._data_dir()``。
        clock: 本机 Lamport 时钟（新 / 变更条目打戳用；全部保留时
            时钟不前进）。
        base: 上一轮本地清单（增量保戳基准）；``None`` 视为全量新建。

    Returns:
        新构建的 :class:`Manifest`（内存对象，待 ``save`` 落盘）。

    Raises:
        SyncError: 数据源文件读取失败。
    """
    root = _base(data_dir)
    base_files = base.files if base is not None else {}
    files: dict[str, FileVersion] = {}

    for relative in scan_sync_files(data_dir):
        full_path = root / Path(relative)
        try:
            content_hash = hash_file_content(full_path)
            modified_at = datetime.fromtimestamp(
                full_path.stat().st_mtime, tz=timezone.utc
            ).isoformat()
        except OSError as exc:
            raise SyncError(f"同步数据源读取失败（{full_path}）：{exc}") from exc

        existing = base_files.get(relative)
        if existing is not None and existing.contentHash == content_hash:
            files[relative] = existing
        else:
            files[relative] = FileVersion(
                filepath=relative,
                lamport=clock.tick(),
                deviceId=clock.device_id,
                contentHash=content_hash,
                modifiedAt=modified_at,
            )

    logger.debug(
        "本地清单构建完成：%d 个文件条目（保留 %d / 新戳 %d）",
        len(files),
        sum(1 for path, v in files.items() if base_files.get(path) is v),
        sum(1 for path in files if base_files.get(path) is not files[path]),
    )
    return Manifest(files=files)


# ---------------------------------------------------------------------------
# 内部工具
# ---------------------------------------------------------------------------
def _atomic_write(path: Path, payload: bytes) -> None:
    """原子写入：同目录临时文件 + ``os.replace``（沿用 FileKeyStore 先例）。"""
    try:
        path.parent.mkdir(parents=True, exist_ok=True)
        fd, tmp_name = tempfile.mkstemp(
            dir=path.parent, prefix=".manifest-", suffix=".tmp"
        )
        try:
            with os.fdopen(fd, "wb") as tmp_file:
                tmp_file.write(payload)
            os.replace(tmp_name, path)
        except BaseException:
            # 替换失败时尽力清理临时文件，不留垃圾
            try:
                os.unlink(tmp_name)
            except OSError:
                pass
            raise
    except OSError as exc:
        raise SyncError(f"manifest 写入失败（{path}）：{exc}") from exc

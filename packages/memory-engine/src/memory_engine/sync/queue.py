"""离线队列 — 断网变更的 JSONL 追加存储与 FIFO 重放（路线图 §3.3 / §6）。

实现迭代计划 B4：``.sync/queue/`` 下以 JSONL（每行一条 JSON 记录）追加存储
待上传变更，延续项目「透明 JSON」哲学——用户可直接阅读、diff、手删重建。

**单文件选型**（``queue.jsonl``，而非每变更一文件）：

1. FIFO 顺序 = 文件内行序，无需文件名序号 / mtime 排序等额外元数据；
2. 容量上限合并本就是「读全量 → 去重 → 原子重写」，单文件一次
   ``os.replace`` 到位，多文件方案需多步删除、部分失败更易残留；
3. 上限 500 条使单文件尺寸恒可控（< 1MB），无切分收益。

崩溃连续性：每行独立 JSON，进程强杀至多撕裂最后一行；读取侧跳过损坏行
并 ``logging.warning`` 告警，绝不因单行损坏中断重放。追加与重写均在进程内
``threading.Lock`` 下完成（单引擎单进程假设；多进程并发不在本轮范围）。

容量上限 500 条（路线图 §6 既定方针）：超限触发「同文件合并」——同一路径
只留最新版本（位置取最后出现处，保持新近度 FIFO 序）；合并后仍超限
（各路径皆不同）则丢弃最旧记录。**最新变更绝不丢弃**，超限全程
``logging.warning`` 告警且不崩溃。

重放语义（4.2.2 worker 集成约定）：:func:`replay` **只读**返回 FIFO 快照，
不做任何修改；worker 上传成功后再调 :func:`clear` 清空——重放中途强杀
不丢任何记录（上传幂等由云端版本元数据兜底，属 4.2.2 / 4.2.3 范围）。

change 记录结构（JSONL 每行，camelCase 键与 ``SyncConfig`` JSON 及未来
``FileVersion`` 的约定对齐）::

    {"version": 1, "filepath": "projects/x/context.json", "lamport": 42,
     "deviceId": "<uuid4>", "contentHash": "<64-hex>", "op": "upsert",
     "enqueuedAt": "2026-07-21T03:00:00+00:00"}

``filepath / lamport / deviceId / contentHash`` 四字段与 4.2.2
``FileVersion`` 逐项同名同义，清单层可直接映射（``FileVersion.modifiedAt``
按落盘 mtime 记，队列不冗余携带）；``op`` 预留删除传播（本轮仅 ``upsert``
实际使用）。
"""

from __future__ import annotations

import json
import logging
import os
import re
import tempfile
import threading
from dataclasses import dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Literal, cast

from .errors import SyncError
from .paths import queue_dir

logger = logging.getLogger("memory_engine.sync.queue")

__all__ = [
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

QUEUE_CAPACITY = 500
"""队列容量上限（路线图 §6 既定方针）；超限触发同路径合并 + 告警。"""

QUEUE_FILENAME = "queue.jsonl"
"""队列单文件名（单文件选型理由见模块 docstring）。"""

QUEUE_RECORD_VERSION = 1
"""JSONL 记录格式版本；结构演进时递增并在 :meth:`QueuedChange.from_dict` 兼容。"""

ChangeOp = Literal["upsert", "delete"]
"""变更类型：``upsert`` 新增 / 修改；``delete`` 删除传播（4.2.2 预留）。"""

_SHA256_HEX_RE = re.compile(r"[0-9a-f]{64}")

_LOCK = threading.Lock()
"""进程内追加 / 读取 / 重写互斥锁（单引擎单进程假设；多进程并发不在本轮范围）。"""


def _utc_now_iso() -> str:
    """当前 UTC 时间的 ISO 8601 串（``enqueued_at`` 默认值工厂）。"""
    return datetime.now(timezone.utc).isoformat()


# ---------------------------------------------------------------------------
# change 记录
# ---------------------------------------------------------------------------
@dataclass(frozen=True)
class QueuedChange:
    """一条待同步变更（JSONL 记录的一行）。

    与 4.2.2 ``FileVersion`` 的对接约定：``filepath / lamport / device_id /
    content_hash`` 四项与 ``FileVersion.filepath / lamport / deviceId /
    contentHash`` 同名同义（JSON 侧沿用 camelCase），清单层可直接映射。

    Attributes:
        filepath: 相对数据目录的文件路径（POSIX 分隔符，如
            ``projects/demo/context.json``）。
        lamport: 变更发生时的 Lamport 时钟值（``sync.lamport`` 产出）。
        device_id: 变更来源设备（``.sync/config.json`` 的 ``deviceId``）。
        content_hash: 整文件 SHA-256（小写 hex，与 manifest ``contentHash``
            及 ``chunker.hash_file`` 的 ``content_hash`` 一致）；
            ``op="delete"`` 时为空串。
        op: 变更类型，默认 ``upsert``。
        enqueued_at: 入队时间（ISO 8601 UTC），默认取当前时间。
    """

    filepath: str
    lamport: int
    device_id: str
    content_hash: str
    op: ChangeOp = "upsert"
    enqueued_at: str = field(default_factory=_utc_now_iso)

    def to_dict(self) -> dict[str, Any]:
        """序列化为 JSONL 单行结构（camelCase 键，与 SyncConfig JSON 约定一致）。"""
        return {
            "version": QUEUE_RECORD_VERSION,
            "filepath": self.filepath,
            "lamport": self.lamport,
            "deviceId": self.device_id,
            "contentHash": self.content_hash,
            "op": self.op,
            "enqueuedAt": self.enqueued_at,
        }

    @classmethod
    def from_dict(cls, doc: Any) -> QueuedChange:
        """从 JSON 文档还原记录；任何字段非法即抛 :class:`ValueError`。

        读取侧（replay / peek / depth / 合并）捕获该异常并按「损坏行」
        跳过 + 告警，绝不因单行损坏中断重放。
        """
        _validate_document(doc)
        return cls(
            filepath=doc["filepath"],
            lamport=doc["lamport"],
            device_id=doc["deviceId"],
            content_hash=doc["contentHash"],
            op=cast(ChangeOp, doc.get("op", "upsert")),
            enqueued_at=doc["enqueuedAt"],
        )


def _validate_document(doc: Any) -> None:
    """校验 JSON 文档（``to_dict`` 结构）；非法即抛 :class:`ValueError`。

    入队侧将 :class:`ValueError` 包装为 :class:`SyncError`（调用方 bug 必须
    显式失败）；读取侧直接按损坏行跳过。
    """
    if not isinstance(doc, dict):
        raise ValueError("记录不是 JSON 对象")
    if doc.get("version") != QUEUE_RECORD_VERSION:
        raise ValueError(f"记录版本不支持：{doc.get('version')!r}")
    filepath = doc.get("filepath")
    if not isinstance(filepath, str) or not filepath.strip():
        raise ValueError("filepath 必须是非空字符串")
    if "\x00" in filepath:
        raise ValueError("filepath 含非法 NUL 字符")
    lamport = doc.get("lamport")
    if isinstance(lamport, bool) or not isinstance(lamport, int) or lamport < 0:
        raise ValueError("lamport 必须是非负整数")
    device_id = doc.get("deviceId")
    if not isinstance(device_id, str) or not device_id:
        raise ValueError("deviceId 必须是非空字符串")
    op = doc.get("op", "upsert")
    if op not in ("upsert", "delete"):
        raise ValueError(f"op 仅支持 upsert / delete（实际 {op!r}）")
    content_hash = doc.get("contentHash")
    if not isinstance(content_hash, str):
        raise ValueError("contentHash 必须是字符串")
    if op == "upsert" and _SHA256_HEX_RE.fullmatch(content_hash) is None:
        raise ValueError("upsert 记录的 contentHash 必须是 64 位小写 hex（SHA-256 摘要）")
    if op == "delete" and content_hash and _SHA256_HEX_RE.fullmatch(content_hash) is None:
        raise ValueError("delete 记录的 contentHash 应为空串或 64 位小写 hex")
    enqueued_at = doc.get("enqueuedAt")
    if not isinstance(enqueued_at, str) or not enqueued_at:
        raise ValueError("enqueuedAt 必须是非空 ISO 8601 字符串")


# ---------------------------------------------------------------------------
# 内部工具（调用方须已持有 _LOCK）
# ---------------------------------------------------------------------------
def _read_lines_locked(path: Path) -> tuple[list[QueuedChange], int]:
    """读取全部有效记录；返回 ``(有效记录列表, 损坏行数)``，损坏行跳过 + 告警。"""
    if not path.exists():
        return [], 0
    try:
        raw = path.read_text(encoding="utf-8")
    except OSError as exc:
        raise SyncError(f"离线队列读取失败（{path}）：{exc}") from exc
    records: list[QueuedChange] = []
    corrupted = 0
    for line in raw.splitlines():
        if not line.strip():
            continue
        try:
            records.append(QueuedChange.from_dict(json.loads(line)))
        except (json.JSONDecodeError, ValueError, TypeError):
            corrupted += 1
    if corrupted:
        logger.warning(
            "离线队列跳过 %d 行损坏记录（%s），保留 %d 条有效记录",
            corrupted,
            path,
            len(records),
        )
    return records, corrupted


def _rewrite_locked(path: Path, records: list[QueuedChange]) -> None:
    """原子重写队列文件：同目录临时文件 + ``os.replace``（沿用 FileKeyStore 先例）。"""
    payload = "".join(json.dumps(r.to_dict(), ensure_ascii=False) + "\n" for r in records)
    try:
        fd, tmp_name = tempfile.mkstemp(dir=path.parent, prefix=".queue-", suffix=".tmp")
        try:
            with os.fdopen(fd, "w", encoding="utf-8") as tmp_file:
                tmp_file.write(payload)
            os.replace(tmp_name, path)
        except BaseException:
            try:
                os.unlink(tmp_name)
            except OSError:
                pass
            raise
    except OSError as exc:
        raise SyncError(f"离线队列合并重写失败（{path}）：{exc}") from exc


def _compact_locked(path: Path) -> int:
    """容量超限处置：同路径合并（只留最新）→ 仍超限则丢弃最旧 → 原子重写。

    Returns:
        合并后的队列深度。
    """
    records, _ = _read_lines_locked(path)
    before = len(records)
    latest: dict[str, QueuedChange] = {}
    order: list[str] = []
    for record in records:
        if record.filepath in latest:
            order.remove(record.filepath)
        latest[record.filepath] = record
        order.append(record.filepath)
    merged = [latest[filepath] for filepath in order]
    dropped_oldest = 0
    if len(merged) > QUEUE_CAPACITY:
        dropped_oldest = len(merged) - QUEUE_CAPACITY
        merged = merged[dropped_oldest:]
    _rewrite_locked(path, merged)
    merged_same_path = before - dropped_oldest - len(merged)
    logger.warning(
        "离线队列超过容量上限 %d 条（当前 %d 条有效记录）：合并同路径变更 %d 条%s，"
        "队列深度降为 %d；最新变更均已保留",
        QUEUE_CAPACITY,
        before,
        merged_same_path,
        f"、丢弃最旧记录 {dropped_oldest} 条" if dropped_oldest else "",
        len(merged),
    )
    return len(merged)


# ---------------------------------------------------------------------------
# 公共 API
# ---------------------------------------------------------------------------
def queue_file_path(data_dir: Path | None = None) -> Path:
    """``.sync/queue/queue.jsonl`` — 队列单文件落点。"""
    return queue_dir(data_dir) / QUEUE_FILENAME


def enqueue(change: QueuedChange, data_dir: Path | None = None) -> int:
    """追加一条变更记录（JSONL 单行），返回入队后的队列深度。

    追加后深度超过 :data:`QUEUE_CAPACITY` 时自动触发同路径合并（详见模块
    docstring），最新变更绝不丢弃。

    Args:
        change: 待入队变更（字段非法即拒绝，不落盘）。
        data_dir: 数据目录；``None`` 时走 ``cli._data_dir()``
            （``REMEMBER_ME_DATA_DIR`` 环境变量覆盖）。

    Returns:
        入队后的队列深度（触发合并时为合并后深度）。

    Raises:
        SyncError: 记录字段非法，或底层写入 / 合并重写失败。
    """
    try:
        _validate_document(change.to_dict())
    except ValueError as exc:
        raise SyncError(f"离线队列变更记录非法：{exc}") from exc
    path = queue_file_path(data_dir)
    line = json.dumps(change.to_dict(), ensure_ascii=False) + "\n"
    with _LOCK:
        try:
            path.parent.mkdir(parents=True, exist_ok=True)
            with path.open("a", encoding="utf-8") as fh:
                fh.write(line)
        except OSError as exc:
            raise SyncError(f"离线队列写入失败（{path}）：{exc}") from exc
        records, _ = _read_lines_locked(path)
        if len(records) > QUEUE_CAPACITY:
            return _compact_locked(path)
        return len(records)


def peek(data_dir: Path | None = None) -> QueuedChange | None:
    """返回队首记录（FIFO 下一条待重放），**不出队**；空队列返回 ``None``。"""
    path = queue_file_path(data_dir)
    with _LOCK:
        records, _ = _read_lines_locked(path)
    return records[0] if records else None


def replay(data_dir: Path | None = None) -> list[QueuedChange]:
    """FIFO 顺序返回全部有效记录（**只读快照**，不修改队列文件）。

    崩溃安全约定：worker 重放上传成功后再调 :func:`clear`；重放中途进程
    强杀不丢任何记录，下次重放从头再来（上传幂等由云端版本元数据兜底）。
    """
    path = queue_file_path(data_dir)
    with _LOCK:
        records, _ = _read_lines_locked(path)
    return records


def depth(data_dir: Path | None = None) -> int:
    """当前队列深度（有效记录数；损坏行跳过 + 告警，不计入）。"""
    path = queue_file_path(data_dir)
    with _LOCK:
        records, _ = _read_lines_locked(path)
    return len(records)


def clear(data_dir: Path | None = None) -> None:
    """清空队列（删除队列文件；不存在时幂等）。

    供 worker 重放上传全部成功后调用；与 :func:`replay` 组成
    「只读快照 + 显式清空」的崩溃安全两段式语义。

    Raises:
        SyncError: 底层删除失败。
    """
    path = queue_file_path(data_dir)
    with _LOCK:
        try:
            path.unlink(missing_ok=True)
        except OSError as exc:
            raise SyncError(f"离线队列清空失败（{path}）：{exc}") from exc
    logger.debug("离线队列已清空（%s）", path)

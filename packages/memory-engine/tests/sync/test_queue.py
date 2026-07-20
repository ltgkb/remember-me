"""sync.queue 离线队列测试 — 对应迭代计划 B4 验收。

验收锚点（``plan/iteration-2026-07-21.md`` 六、B4 行）：
50 文件入队 FIFO 重放无丢失无重复；500 上限同路径合并 + 告警；
损坏行容错（跳过 + 告警）；并发追加不撕裂。
"""

from __future__ import annotations

import hashlib
import json
import logging
import os
import threading
from datetime import datetime
from pathlib import Path
from unittest import mock

import pytest

from memory_engine.sync import queue
from memory_engine.sync.errors import SyncError

_DEVICE_ID = "11111111-2222-3333-4444-555555555555"


def _change(filepath: str, lamport: int = 1, tag: str = "") -> queue.QueuedChange:
    """构造确定性 contentHash 的测试变更（enqueuedAt 自动打戳）。"""
    digest = hashlib.sha256(f"{filepath}:{lamport}:{tag}".encode("utf-8")).hexdigest()
    return queue.QueuedChange(
        filepath=filepath,
        lamport=lamport,
        device_id=_DEVICE_ID,
        content_hash=digest,
    )


def _warnings(caplog: pytest.LogCaptureFixture, needle: str) -> list[logging.LogRecord]:
    return [
        record
        for record in caplog.records
        if record.levelno >= logging.WARNING and needle in record.getMessage()
    ]


class TestRecordShape:
    """change 记录结构：camelCase 键、round-trip、自动打戳、op 语义。"""

    def test_to_dict_camel_case_keys(self) -> None:
        doc = _change("profile.json", lamport=7).to_dict()
        assert set(doc) == {
            "version",
            "filepath",
            "lamport",
            "deviceId",
            "contentHash",
            "op",
            "enqueuedAt",
        }
        assert doc["version"] == queue.QUEUE_RECORD_VERSION
        assert doc["op"] == "upsert"

    def test_round_trip(self) -> None:
        change = _change("projects/demo/context.json", lamport=42)
        assert queue.QueuedChange.from_dict(change.to_dict()) == change

    def test_enqueued_at_auto_stamp_utc(self) -> None:
        parsed = datetime.fromisoformat(_change("a.json").enqueued_at)
        assert parsed.tzinfo is not None

    def test_delete_op_allows_empty_content_hash(self) -> None:
        change = queue.QueuedChange(
            filepath="gone.json",
            lamport=3,
            device_id=_DEVICE_ID,
            content_hash="",
            op="delete",
        )
        assert queue.QueuedChange.from_dict(change.to_dict()) == change


class TestEnqueueValidation:
    """入队字段非法 → SyncError，不落盘（调用方 bug 显式失败）。"""

    def test_empty_filepath_rejected(self, tmp_data_dir: Path) -> None:
        with pytest.raises(SyncError, match="filepath"):
            queue.enqueue(_change(""))
        assert queue.depth() == 0

    def test_bad_content_hash_rejected(self, tmp_data_dir: Path) -> None:
        change = queue.QueuedChange(
            filepath="a.json", lamport=1, device_id=_DEVICE_ID, content_hash="not-hex"
        )
        with pytest.raises(SyncError, match="contentHash"):
            queue.enqueue(change)

    def test_negative_lamport_rejected(self, tmp_data_dir: Path) -> None:
        with pytest.raises(SyncError, match="lamport"):
            queue.enqueue(_change("a.json", lamport=-1))

    def test_upsert_with_empty_content_hash_rejected(self, tmp_data_dir: Path) -> None:
        change = queue.QueuedChange(
            filepath="a.json", lamport=1, device_id=_DEVICE_ID, content_hash=""
        )
        with pytest.raises(SyncError, match="contentHash"):
            queue.enqueue(change)


class TestBasics:
    """落点 / 空队列 / peek 不出队 / 入队返回深度。"""

    def test_queue_file_location(self, tmp_data_dir: Path) -> None:
        assert queue.queue_file_path() == tmp_data_dir / ".sync" / "queue" / "queue.jsonl"

    def test_empty_queue(self, tmp_data_dir: Path) -> None:
        assert queue.depth() == 0
        assert queue.peek() is None
        assert queue.replay() == []

    def test_peek_does_not_dequeue(self, tmp_data_dir: Path) -> None:
        first, second = _change("a.json", lamport=1), _change("b.json", lamport=2)
        assert queue.enqueue(first) == 1
        assert queue.enqueue(second) == 2
        assert queue.peek() == first
        assert queue.peek() == first
        assert queue.depth() == 2


class TestFifoReplay:
    """B4 验收：50 文件入队 FIFO 重放无丢失无重复。"""

    def test_fifty_files_fifo_replay_no_loss_no_dup(self, tmp_data_dir: Path) -> None:
        expected = [
            _change(f"projects/p{i:02d}/context.json", lamport=i + 1) for i in range(50)
        ]
        for change in expected:
            queue.enqueue(change)

        first = queue.replay()
        second = queue.replay()
        assert first == expected  # FIFO 顺序、无丢失、无重复
        assert second == expected  # replay 只读快照，可重复重放（崩溃安全两段式）
        assert queue.depth() == 50
        # 逐条核对顺序与内容（含 enqueuedAt 保真）
        assert [r.filepath for r in first] == [c.filepath for c in expected]
        assert all(r.enqueued_at == c.enqueued_at for r, c in zip(first, expected))

    def test_clear_after_replay(self, tmp_data_dir: Path) -> None:
        queue.enqueue(_change("a.json"))
        assert queue.replay() != []
        queue.clear()
        assert queue.depth() == 0
        assert queue.peek() is None
        assert queue.replay() == []
        queue.clear()  # 幂等


class TestCapacity:
    """B4 验收：500 上限同路径合并 + 告警；不崩溃、不丢最新变更。"""

    def test_capacity_merges_same_path_and_warns(
        self, tmp_data_dir: Path, caplog: pytest.LogCaptureFixture
    ) -> None:
        for i in range(queue.QUEUE_CAPACITY):
            assert queue.enqueue(_change(f"projects/p/f{i}.json", lamport=i)) == i + 1
        assert queue.depth() == 500

        newest = _change("projects/p/f0.json", lamport=999, tag="newest")
        with caplog.at_level(logging.WARNING, logger="memory_engine.sync.queue"):
            depth_after = queue.enqueue(newest)

        # 同路径合并：深度不增、告警触发、不崩溃
        assert depth_after == 500
        assert _warnings(caplog, "容量上限")

        records = queue.replay()
        assert len(records) == 500
        by_path = {r.filepath: r for r in records}
        # 不丢最新变更：最新 lamport / contentHash 保留
        assert by_path["projects/p/f0.json"].lamport == 999
        assert by_path["projects/p/f0.json"].content_hash == newest.content_hash
        # 合并后位置取最后出现处（FIFO 新近度）
        assert records[-1].filepath == "projects/p/f0.json"
        # 其余路径无丢失
        assert set(by_path) == {f"projects/p/f{i}.json" for i in range(500)}

    def test_capacity_distinct_paths_drops_oldest(
        self,
        tmp_data_dir: Path,
        caplog: pytest.LogCaptureFixture,
        monkeypatch: pytest.MonkeyPatch,
    ) -> None:
        """合并后仍超限（各路径皆不同）：丢弃最旧，最新全部保留。"""
        monkeypatch.setattr(queue, "QUEUE_CAPACITY", 5)
        with caplog.at_level(logging.WARNING, logger="memory_engine.sync.queue"):
            for i in range(7):
                queue.enqueue(_change(f"f{i}.json", lamport=i))

        assert queue.depth() == 5
        records = queue.replay()
        assert [r.filepath for r in records] == [f"f{i}.json" for i in range(2, 7)]
        assert _warnings(caplog, "丢弃最旧")


class TestCorruptedLines:
    """B4 验收：进程强杀撕裂行 / 手改坏行 → 跳过 + 告警，重放不中断。"""

    def test_corrupted_lines_skipped_with_warning(
        self, tmp_data_dir: Path, caplog: pytest.LogCaptureFixture
    ) -> None:
        good1, good2 = _change("a.json", lamport=1), _change("b.json", lamport=2)
        queue.enqueue(good1)
        queue.enqueue(good2)
        path = queue.queue_file_path()
        with path.open("a", encoding="utf-8") as fh:
            fh.write("这不是 JSON\n")
            fh.write('{"version": 99, "filepath": "evil.json"}\n')  # 版本不支持
            fh.write('{"version": 1, "filepath": 123, "lamport": 3}\n')  # 字段类型错
            fh.write('{"version": 1, "filepath": "truncated.json", "lam')  # 撕裂尾行

        with caplog.at_level(logging.WARNING, logger="memory_engine.sync.queue"):
            records = queue.replay()

        assert records == [good1, good2]
        assert _warnings(caplog, "损坏")
        # depth / peek 同样容错
        assert queue.depth() == 2
        assert queue.peek() == good1

    def test_leading_corrupted_line_does_not_hide_valid_head(
        self, tmp_data_dir: Path, caplog: pytest.LogCaptureFixture
    ) -> None:
        path = queue.queue_file_path()
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text("garbage-line\n\n", encoding="utf-8")  # 坏行 + 空行
        good = _change("head.json", lamport=1)
        queue.enqueue(good)

        with caplog.at_level(logging.WARNING, logger="memory_engine.sync.queue"):
            assert queue.peek() == good
            assert queue.depth() == 1  # 空行静默跳过，坏行计入告警
        assert _warnings(caplog, "损坏")

    def test_compaction_purges_corrupted_lines(
        self, tmp_data_dir: Path, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        """容量合并重写顺带清除损坏行（重写只保留有效记录）。"""
        monkeypatch.setattr(queue, "QUEUE_CAPACITY", 3)
        queue.enqueue(_change("dup.json", lamport=1, tag="old"))
        path = queue.queue_file_path()
        with path.open("a", encoding="utf-8") as fh:
            fh.write("corrupted\n")
        queue.enqueue(_change("dup.json", lamport=2, tag="new"))
        queue.enqueue(_change("x.json", lamport=3))
        queue.enqueue(_change("y.json", lamport=4))  # 触发合并

        raw_lines = [
            line
            for line in path.read_text(encoding="utf-8").splitlines()
            if line.strip()
        ]
        assert len(raw_lines) == 3  # 损坏行已被重写清除
        assert all(json.loads(line)["version"] == 1 for line in raw_lines)

    def test_replay_on_missing_queue_is_empty(self, tmp_data_dir: Path) -> None:
        assert queue.replay() == []


class TestConcurrency:
    """B4 验收：多线程并发追加不撕裂（全部记录可解析、无丢失）。"""

    def test_concurrent_enqueue_no_torn_lines(self, tmp_data_dir: Path) -> None:
        def worker(tid: int) -> None:
            for i in range(25):
                queue.enqueue(_change(f"projects/p/t{tid}-f{i}.json", lamport=i))

        threads = [threading.Thread(target=worker, args=(tid,)) for tid in range(8)]
        for thread in threads:
            thread.start()
        for thread in threads:
            thread.join()

        assert queue.depth() == 8 * 25
        records = queue.replay()
        assert {r.filepath for r in records} == {
            f"projects/p/t{tid}-f{i}.json" for tid in range(8) for i in range(25)
        }


class TestDocumentValidation:
    """from_dict 逐字段防御分支（读取侧损坏行判定的完整矩阵）。"""

    @staticmethod
    def _valid_doc() -> dict[str, object]:
        return _change("a.json", lamport=1).to_dict()

    def test_non_dict_document_rejected(self) -> None:
        with pytest.raises(ValueError, match="JSON 对象"):
            queue.QueuedChange.from_dict("not-a-dict")

    def test_filepath_with_nul_rejected(self) -> None:
        doc = self._valid_doc()
        doc["filepath"] = "a\x00b.json"
        with pytest.raises(ValueError, match="NUL"):
            queue.QueuedChange.from_dict(doc)

    def test_empty_device_id_rejected(self) -> None:
        doc = self._valid_doc()
        doc["deviceId"] = ""
        with pytest.raises(ValueError, match="deviceId"):
            queue.QueuedChange.from_dict(doc)

    def test_non_string_device_id_rejected(self) -> None:
        doc = self._valid_doc()
        doc["deviceId"] = 123
        with pytest.raises(ValueError, match="deviceId"):
            queue.QueuedChange.from_dict(doc)

    def test_unknown_op_rejected(self) -> None:
        doc = self._valid_doc()
        doc["op"] = "replace"
        with pytest.raises(ValueError, match="op"):
            queue.QueuedChange.from_dict(doc)

    def test_non_string_content_hash_rejected(self) -> None:
        doc = self._valid_doc()
        doc["contentHash"] = 123
        with pytest.raises(ValueError, match="contentHash"):
            queue.QueuedChange.from_dict(doc)

    def test_delete_op_with_invalid_hash_rejected(self) -> None:
        doc = self._valid_doc()
        doc["op"] = "delete"
        doc["contentHash"] = "not-hex"
        with pytest.raises(ValueError, match="delete"):
            queue.QueuedChange.from_dict(doc)

    def test_empty_enqueued_at_rejected(self) -> None:
        doc = self._valid_doc()
        doc["enqueuedAt"] = ""
        with pytest.raises(ValueError, match="enqueuedAt"):
            queue.QueuedChange.from_dict(doc)

    def test_missing_enqueued_at_rejected(self) -> None:
        doc = self._valid_doc()
        del doc["enqueuedAt"]
        with pytest.raises(ValueError, match="enqueuedAt"):
            queue.QueuedChange.from_dict(doc)

    def test_lamport_bool_rejected(self) -> None:
        """bool 是 int 子类，必须排除（与 SyncConfig lamport 校验同款）。"""
        doc = self._valid_doc()
        doc["lamport"] = True
        with pytest.raises(ValueError, match="lamport"):
            queue.QueuedChange.from_dict(doc)


class TestIoErrors:
    """底层 IO 失败一律包装为 SyncError（不穿透、临时文件尽力清理）。"""

    def test_read_failure_wrapped(
        self, tmp_data_dir: Path, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        queue.enqueue(_change("a.json"))

        def boom_read_text(self: Path, *args: object, **kwargs: object) -> str:
            raise OSError("模拟读取失败")

        monkeypatch.setattr(Path, "read_text", boom_read_text)
        with pytest.raises(SyncError, match="读取失败"):
            queue.replay()

    def test_append_failure_wrapped(
        self, tmp_data_dir: Path, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        def boom_open(self: Path, *args: object, **kwargs: object) -> object:
            raise OSError("模拟打开失败")

        monkeypatch.setattr(Path, "open", boom_open)
        with pytest.raises(SyncError, match="写入失败"):
            queue.enqueue(_change("a.json"))

    def test_compact_rewrite_failure_wrapped(
        self, tmp_data_dir: Path, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        """合并重写失败 → SyncError；临时文件清理失败属尽力而为；原队列不丢。"""
        monkeypatch.setattr(queue, "QUEUE_CAPACITY", 2)
        queue.enqueue(_change("f0.json", lamport=0))
        queue.enqueue(_change("f1.json", lamport=1))

        def boom_replace(*args: object, **kwargs: object) -> None:
            raise OSError("模拟替换失败")

        def boom_unlink(*args: object, **kwargs: object) -> None:
            raise OSError("模拟清理也失败")

        # 用 mock.patch 上下文而非 monkeypatch.undo()：后者会连坐撤销
        # conftest tmp_data_dir 的 REMEMBER_ME_DATA_DIR 环境变量（同一实例）
        with mock.patch.object(os, "replace", boom_replace), mock.patch.object(
            os, "unlink", boom_unlink
        ):
            with pytest.raises(SyncError, match="合并重写失败"):
                queue.enqueue(_change("f2.json", lamport=2))

        # IO 恢复后：已追加的 3 条记录仍在（不崩溃、不丢）
        assert queue.depth() == 3

    def test_clear_failure_wrapped(
        self, tmp_data_dir: Path, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        queue.enqueue(_change("a.json"))

        def boom_unlink(self: Path, *args: object, **kwargs: object) -> None:
            raise OSError("模拟删除失败")

        monkeypatch.setattr(Path, "unlink", boom_unlink)
        with pytest.raises(SyncError, match="清空失败"):
            queue.clear()

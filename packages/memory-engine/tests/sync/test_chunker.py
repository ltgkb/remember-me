"""sync.chunker 4KB 块级哈希树测试 — 对应迭代计划 B3 验收。

验收锚点（``plan/iteration-2026-07-21.md`` 六、B3 行）：
1MB 文件二次哈希仅尾部变更 → 变更块数 < 总块数 20%；
空文件 / 不足 4KB / 恰 4KB 整数倍 / 尾块边界正确；流式读取内存可控。
"""

from __future__ import annotations

import hashlib
from pathlib import Path
from random import Random
from typing import Any

import pytest

from memory_engine.sync import chunker
from memory_engine.sync.errors import SyncError

ONE_MB = 1024 * 1024


def _data(size: int, seed: int = 20260721) -> bytes:
    """确定性伪随机内容（Mersenne Twister 跨进程稳定，测试可复现）。"""
    return Random(seed).randbytes(size)


class TestChunkBoundaries:
    """边界三例 + 参数化扫描：空文件 / 不足 4KB / 恰整数倍 / 尾块。"""

    @pytest.mark.parametrize(
        ("size", "expected_chunks"),
        [
            (0, 0),  # 空文件：零块
            (1, 1),
            (4095, 1),  # 不足 4KB：单块
            (4096, 1),  # 恰 4KB：单块，无空尾块
            (4097, 2),  # 1 字节尾块
            (8192, 2),  # 恰 4KB 整数倍：无空尾块
            (8193, 3),  # 非整数倍尾块
        ],
    )
    def test_chunk_count_and_size(self, tmp_path: Path, size: int, expected_chunks: int) -> None:
        target = tmp_path / "data.bin"
        target.write_bytes(_data(size))
        result = chunker.hash_file(target)
        assert len(result.chunk_hashes) == expected_chunks
        assert result.file_size == size
        # hash_bytes 与 hash_file 逐字段一致
        assert result == chunker.hash_bytes(target.read_bytes())

    def test_empty_file_root_is_sha256_of_empty(self) -> None:
        """空文件：零块，根哈希 = SHA-256 空输入（模块 docstring 既定语义）。"""
        result = chunker.hash_bytes(b"")
        assert result.chunk_hashes == ()
        assert result.root_hash == hashlib.sha256(b"").hexdigest()
        assert result.content_hash == hashlib.sha256(b"").hexdigest()

    def test_sub_4kb_single_chunk_matches_flat_hash(self) -> None:
        """单块文件：唯一块哈希 = 整文件 flat SHA-256。"""
        data = b"remember-me" * 10
        result = chunker.hash_bytes(data)
        assert result.chunk_hashes == (hashlib.sha256(data).hexdigest(),)

    def test_exact_multiple_has_no_empty_tail_block(self) -> None:
        """恰 4KB 整数倍：不产生空尾块（末块恰满 4096 字节）。"""
        data = _data(chunker.CHUNK_SIZE * 4)
        result = chunker.hash_bytes(data)
        assert len(result.chunk_hashes) == 4
        assert result.chunk_hashes[-1] == hashlib.sha256(data[-chunker.CHUNK_SIZE :]).hexdigest()


class TestHashAlgorithms:
    """根哈希算法钉死（Merkle 式）+ 整文件 flat hash 对接约定。"""

    def test_root_hash_is_merkle_style_over_raw_digests(self) -> None:
        """root = SHA-256(各块 32 字节原始摘要按序拼接)，且 ≠ flat hash。"""
        data = _data(chunker.CHUNK_SIZE * 2 + 10, seed=3)
        result = chunker.hash_bytes(data)
        raw_digests = b"".join(bytes.fromhex(h) for h in result.chunk_hashes)
        assert result.root_hash == hashlib.sha256(raw_digests).hexdigest()
        assert result.root_hash != result.content_hash

    def test_content_hash_is_flat_sha256(self) -> None:
        """content_hash = 整文件 flat SHA-256（与 FileVersion.contentHash 对齐）。"""
        data = _data(chunker.CHUNK_SIZE * 3 + 7, seed=5)
        result = chunker.hash_bytes(data)
        assert result.content_hash == hashlib.sha256(data).hexdigest()

    def test_block_hashes_match_per_block_sha256(self) -> None:
        data = _data(chunker.CHUNK_SIZE + 100, seed=11)
        result = chunker.hash_bytes(data)
        expected = (
            hashlib.sha256(data[: chunker.CHUNK_SIZE]).hexdigest(),
            hashlib.sha256(data[chunker.CHUNK_SIZE :]).hexdigest(),
        )
        assert result.chunk_hashes == expected


class TestChangedChunks:
    """changed_chunks 变更块识别（含 B3 验收：1MB 尾部变更 < 20%）。"""

    def test_identical_lists_no_changes(self) -> None:
        hashes = ("aa" * 32, "bb" * 32)
        assert chunker.changed_chunks(hashes, hashes) == []

    def test_both_empty_no_changes(self) -> None:
        assert chunker.changed_chunks((), ()) == []

    def test_local_longer_tail_indices_are_new(self) -> None:
        """本地更长：多出尾部块全部视为新增变更。"""
        local = ("aa" * 32, "bb" * 32, "cc" * 32, "dd" * 32)
        remote = ("aa" * 32, "bb" * 32)
        assert chunker.changed_chunks(local, remote) == [2, 3]

    def test_remote_longer_no_indices_beyond_local(self) -> None:
        """远端更长（本地截断）：不返回超出本地长度的索引。"""
        local = ("aa" * 32, "bb" * 32)
        remote = ("aa" * 32, "ff" * 32, "ee" * 32)
        assert chunker.changed_chunks(local, remote) == [1]

    def test_mid_file_single_block_change(self, tmp_path: Path) -> None:
        """改写中间某块 → 仅该索引变更。"""
        data = bytearray(_data(chunker.CHUNK_SIZE * 8, seed=17))
        target = tmp_path / "mid.bin"
        target.write_bytes(bytes(data))
        before = chunker.hash_file(target)
        data[chunker.CHUNK_SIZE * 3 : chunker.CHUNK_SIZE * 3 + 16] = b"tampered-block-16b"[:16]
        target.write_bytes(bytes(data))
        after = chunker.hash_file(target)
        assert chunker.changed_chunks(after.chunk_hashes, before.chunk_hashes) == [3]

    def test_one_mb_tail_change_under_20_percent(self, tmp_path: Path) -> None:
        """B3 验收：1MB 文件二次哈希仅尾部变更 → 变更块数 < 总块数 20%。"""
        data = bytearray(_data(ONE_MB))
        target = tmp_path / "history.json"
        target.write_bytes(bytes(data))
        before = chunker.hash_file(target)
        assert len(before.chunk_hashes) == ONE_MB // chunker.CHUNK_SIZE  # 256 块

        # 二次同步前仅尾部 100 字节被改写
        data[-100:] = _data(100, seed=99)
        target.write_bytes(bytes(data))
        after = chunker.hash_file(target)

        changed = chunker.changed_chunks(after.chunk_hashes, before.chunk_hashes)
        assert changed == [255]
        assert len(changed) < len(before.chunk_hashes) * 0.2
        assert after.root_hash != before.root_hash
        assert after.content_hash != before.content_hash

    def test_appended_data_yields_new_tail_index(self) -> None:
        """追加内容：尾部索引出现变更（新增块）。"""
        base = _data(chunker.CHUNK_SIZE * 2, seed=23)
        grown = base + b"appended"
        before = chunker.hash_bytes(base)
        after = chunker.hash_bytes(grown)
        assert chunker.changed_chunks(after.chunk_hashes, before.chunk_hashes) == [2]


class TestStreaming:
    """流式验证：任何单次 read 不超过 CHUNK_SIZE（≥1MB 大文件内存可控）。"""

    def test_reads_are_bounded_by_chunk_size(
        self, monkeypatch: pytest.MonkeyPatch, tmp_path: Path
    ) -> None:
        data = _data(ONE_MB + 123, seed=7)
        target = tmp_path / "big.bin"
        target.write_bytes(data)

        requested: list[int] = []
        real_open = Path.open

        def tracking_open(self: Path, *args: Any, **kwargs: Any) -> Any:
            fh = real_open(self, *args, **kwargs)

            class _Proxy:
                def read(self, size: int = -1) -> bytes:
                    requested.append(size)
                    return fh.read(size)

                def __enter__(self) -> _Proxy:
                    return self

                def __exit__(self, *exc: object) -> None:
                    fh.close()

            return _Proxy()

        monkeypatch.setattr(Path, "open", tracking_open)
        result = chunker.hash_file(target)

        assert requested, "未发生任何读取"
        # 不存在一次性全量读入（read(-1) / read() 无参）或超块读取
        assert all(0 < size <= chunker.CHUNK_SIZE for size in requested)
        # 结果仍正确（与一次性内存算法逐字段一致）
        assert result == chunker.hash_bytes(data)


class TestErrors:
    """IO 失败一律包装为 SyncError（中文友好提示）。"""

    def test_missing_file_raises_sync_error(self, tmp_path: Path) -> None:
        with pytest.raises(SyncError, match="文件分块哈希失败"):
            chunker.hash_file(tmp_path / "missing.bin")

    def test_directory_raises_sync_error(self, tmp_path: Path) -> None:
        with pytest.raises(SyncError, match="文件分块哈希失败"):
            chunker.hash_file(tmp_path)

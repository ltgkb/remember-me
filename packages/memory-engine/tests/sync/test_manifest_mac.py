"""sync.manifest_mac HMAC 完整性原语测试 — 对应迭代计划 A3 验收矩阵。

覆盖：签名 / 验签 round-trip、1 bit 篡改必检出（清单与签名两侧）、
签名文件缺失 / 损坏 / 格式非法、MK 域分离（DEK 无法验签）、
损坏备份 + 空清单重建闭环、时间戳撞名后缀、4.2.2 接口占位、
MK / 清单内容零日志。
"""

from __future__ import annotations

import json
import logging
import os
import shutil
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import pytest

from memory_engine.crypto.kdf import derive_subkeys
from memory_engine.sync.errors import ManifestIntegrityError
from memory_engine.sync.manifest_mac import (
    EMPTY_MANIFEST_BYTES,
    ManifestCorrupted,
    handle_corrupted_manifest,
    request_full_conflict_rebuild,
    verify_manifest_mac,
    write_manifest_mac,
)
from memory_engine.sync.paths import corrupted_backup_dir, manifest_mac_path, manifest_path

MANIFEST = json.dumps(
    {"version": 1, "files": {"profile.json": {"lamport": 3, "deviceId": "dev-a"}}},
    ensure_ascii=False,
    indent=2,
).encode("utf-8")
"""测试用 manifest 序列化字节（签名 / 验签的输入）。"""

MASTER_KEY = bytes(range(32))
"""测试用主密钥（固定值，仅用于派生子密钥）。"""

TS = datetime(2026, 7, 21, 10, 30, 0, tzinfo=timezone.utc)
"""注入用固定时间戳，保证损坏备份目录名可断言。"""


@pytest.fixture()
def mk() -> bytes:
    """MK 子密钥（derive_subkeys 域分离输出）。"""
    return derive_subkeys(MASTER_KEY).mk


@pytest.fixture()
def dek() -> bytes:
    """DEK 子密钥（域分离反证用）。"""
    return derive_subkeys(MASTER_KEY).dek


def _seed_manifest(mk: bytes, data_dir: Path | None = None) -> None:
    """落一份带合法签名的 manifest（损坏处置用例的现成现场）。"""
    manifest_path(data_dir).parent.mkdir(parents=True, exist_ok=True)
    manifest_path(data_dir).write_bytes(MANIFEST)
    write_manifest_mac(MANIFEST, mk, data_dir)


class TestSignAndVerify:
    """签名 / 验签 round-trip 与文件格式。"""

    def test_round_trip(self, tmp_data_dir: Path, mk: bytes) -> None:
        sig = write_manifest_mac(MANIFEST, mk)
        assert sig == manifest_mac_path()
        assert sig.is_file()
        verify_manifest_mac(MANIFEST, mk)  # 不抛即通过

    def test_sig_file_format(self, tmp_data_dir: Path, mk: bytes) -> None:
        write_manifest_mac(MANIFEST, mk)
        doc = json.loads(manifest_mac_path().read_text(encoding="utf-8"))
        assert doc["version"] == 1
        assert doc["alg"] == "HMAC-SHA256"
        assert len(doc["mac"]) == 64  # 32 字节 MAC 的 hex

    def test_empty_manifest_round_trip(self, tmp_data_dir: Path, mk: bytes) -> None:
        write_manifest_mac(b"", mk)
        verify_manifest_mac(b"", mk)

    def test_explicit_data_dir(self, tmp_path: Path, mk: bytes) -> None:
        write_manifest_mac(MANIFEST, mk, tmp_path)
        assert manifest_mac_path(tmp_path).is_file()
        verify_manifest_mac(MANIFEST, mk, tmp_path)


class TestTamperDetection:
    """篡改必检出（A3 验收第 1 条）：清单 1 bit、签名 1 bit、域分离反证。"""

    def test_one_bit_manifest_tamper_detected(self, tmp_data_dir: Path, mk: bytes) -> None:
        write_manifest_mac(MANIFEST, mk)
        tampered = bytearray(MANIFEST)
        tampered[10] ^= 0x01
        with pytest.raises(ManifestIntegrityError, match="HMAC 不匹配"):
            verify_manifest_mac(bytes(tampered), mk)

    def test_one_bit_sig_tamper_detected(self, tmp_data_dir: Path, mk: bytes) -> None:
        write_manifest_mac(MANIFEST, mk)
        doc = json.loads(manifest_mac_path().read_text(encoding="utf-8"))
        mac = bytearray.fromhex(doc["mac"])
        mac[0] ^= 0x01
        doc["mac"] = mac.hex()
        manifest_mac_path().write_text(json.dumps(doc), encoding="utf-8")
        with pytest.raises(ManifestIntegrityError, match="HMAC 不匹配"):
            verify_manifest_mac(MANIFEST, mk)

    def test_mk_domain_separation(
        self, tmp_data_dir: Path, mk: bytes, dek: bytes
    ) -> None:
        """MK 域分离：DEK 无法验签（HKDF info 域分离既定，A3 验收第 3 条）。"""
        write_manifest_mac(MANIFEST, mk)
        with pytest.raises(ManifestIntegrityError, match="HMAC 不匹配"):
            verify_manifest_mac(MANIFEST, dek)

    def test_wrong_mk_length_rejected(self, tmp_data_dir: Path, mk: bytes) -> None:
        with pytest.raises(ManifestIntegrityError, match="MK 长度必须为 32 字节"):
            write_manifest_mac(MANIFEST, b"\x00" * 16)
        write_manifest_mac(MANIFEST, mk)
        with pytest.raises(ManifestIntegrityError, match="MK 长度必须为 32 字节"):
            verify_manifest_mac(MANIFEST, b"\x00" * 16)


class TestSigFileProblems:
    """签名文件缺失 / 损坏 / 格式非法一律拒绝。"""

    def test_missing_sig_raises(self, tmp_data_dir: Path, mk: bytes) -> None:
        with pytest.raises(ManifestIntegrityError, match="签名文件不存在"):
            verify_manifest_mac(MANIFEST, mk)

    def test_sig_invalid_json(self, tmp_data_dir: Path, mk: bytes) -> None:
        manifest_mac_path().parent.mkdir(parents=True, exist_ok=True)
        manifest_mac_path().write_text("这不是 JSON {{{", encoding="utf-8")
        with pytest.raises(ManifestIntegrityError, match="JSON 解析失败"):
            verify_manifest_mac(MANIFEST, mk)

    def test_sig_mac_non_hex(self, tmp_data_dir: Path, mk: bytes) -> None:
        manifest_mac_path().parent.mkdir(parents=True, exist_ok=True)
        doc = {"version": 1, "alg": "HMAC-SHA256", "mac": "zz-not-hex"}
        manifest_mac_path().write_text(json.dumps(doc), encoding="utf-8")
        with pytest.raises(ManifestIntegrityError, match="不是合法 hex"):
            verify_manifest_mac(MANIFEST, mk)

    @pytest.mark.parametrize(
        "doc",
        [
            pytest.param(
                {"version": 2, "alg": "HMAC-SHA256", "mac": "00" * 32}, id="bad-version"
            ),
            pytest.param({"version": 1, "alg": "HMAC-MD5", "mac": "00" * 32}, id="bad-alg"),
            pytest.param({"version": 1, "alg": "HMAC-SHA256"}, id="missing-mac"),
            pytest.param(
                {"version": 1, "alg": "HMAC-SHA256", "mac": 123}, id="mac-not-str"
            ),
            pytest.param(["not", "a", "dict"], id="not-a-dict"),
        ],
    )
    def test_invalid_sig_structure(
        self, tmp_data_dir: Path, mk: bytes, doc: Any
    ) -> None:
        manifest_mac_path().parent.mkdir(parents=True, exist_ok=True)
        manifest_mac_path().write_text(json.dumps(doc), encoding="utf-8")
        with pytest.raises(ManifestIntegrityError, match="格式非法或版本不支持"):
            verify_manifest_mac(MANIFEST, mk)


class TestCorruptedHandling:
    """损坏处置：备份 + 空清单重建 + 状态标记（A3 验收第 2 条）。"""

    def test_backup_and_rebuild_with_resign(self, tmp_data_dir: Path, mk: bytes) -> None:
        _seed_manifest(mk)
        result = handle_corrupted_manifest(mk=mk, reason="HMAC 不匹配", now=TS)

        # 状态标记字段
        assert isinstance(result, ManifestCorrupted)
        assert result.backup_dir == corrupted_backup_dir("20260721T103000Z")
        assert result.backed_up_files == ("manifest.json", "manifest.json.sig")
        assert result.rebuilt_at == TS.isoformat()
        assert result.reason == "HMAC 不匹配"

        # 损坏现场完整备份
        assert (result.backup_dir / "manifest.json").read_bytes() == MANIFEST
        assert (result.backup_dir / "manifest.json.sig").is_file()

        # 原地重建空清单且立即重签，验签通过
        assert result.manifest_path == manifest_path()
        assert result.sig_path == manifest_mac_path()
        assert manifest_path().read_bytes() == EMPTY_MANIFEST_BYTES
        verify_manifest_mac(manifest_path().read_bytes(), mk)

    def test_rebuild_without_mk_removes_stale_sig(self, tmp_data_dir: Path, mk: bytes) -> None:
        _seed_manifest(mk)
        result = handle_corrupted_manifest(now=TS)  # 不提供 mk
        assert result.sig_path is None
        assert not manifest_mac_path().exists()  # 旧签名已移除（避免反复判损坏）
        assert (result.backup_dir / "manifest.json.sig").is_file()  # 现场仍在备份中
        assert manifest_path().read_bytes() == EMPTY_MANIFEST_BYTES

    def test_rebuild_when_nothing_exists(self, tmp_data_dir: Path, mk: bytes) -> None:
        """清单与签名都不存在 → 空备份 + 空清单重建（全新设备语义）。"""
        result = handle_corrupted_manifest(mk=mk, now=TS)
        assert result.backed_up_files == ()
        assert manifest_path().read_bytes() == EMPTY_MANIFEST_BYTES
        verify_manifest_mac(manifest_path().read_bytes(), mk)

    def test_timestamp_collision_gets_suffix(self, tmp_data_dir: Path, mk: bytes) -> None:
        _seed_manifest(mk)
        first = handle_corrupted_manifest(now=TS)
        _seed_manifest(mk)
        second = handle_corrupted_manifest(now=TS)
        assert first.backup_dir.name == "corrupted-20260721T103000Z"
        assert second.backup_dir.name == "corrupted-20260721T103000Z-2"
        assert first.backup_dir.is_dir()
        assert second.backup_dir.is_dir()

    def test_tamper_to_rebuild_full_flow(self, tmp_data_dir: Path, mk: bytes) -> None:
        """篡改 → 验签失败 → 处置 → 空清单可验签 的完整闭环。"""
        _seed_manifest(mk)
        with pytest.raises(ManifestIntegrityError):
            verify_manifest_mac(MANIFEST + b"\n# tampered", mk)
        result = handle_corrupted_manifest(mk=mk, reason="篡改注入", now=TS)
        assert result.reason == "篡改注入"
        verify_manifest_mac(manifest_path().read_bytes(), mk)

    def test_full_conflict_rebuild_placeholder(self, tmp_data_dir: Path, mk: bytes) -> None:
        result = handle_corrupted_manifest(mk=mk, now=TS)
        with pytest.raises(NotImplementedError, match="4.2.2"):
            request_full_conflict_rebuild(result)


class TestWriteFailure:
    """底层 IO 失败统一包装，临时文件不残留。"""

    def test_sig_write_failure_wrapped_and_tmp_cleaned(
        self, tmp_data_dir: Path, mk: bytes, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        def _boom_replace(src: str, dst: str) -> None:
            raise OSError("模拟替换失败")

        monkeypatch.setattr(os, "replace", _boom_replace)
        with pytest.raises(ManifestIntegrityError, match="写入失败"):
            write_manifest_mac(MANIFEST, mk)
        assert list(manifest_mac_path().parent.glob(".mac-*.tmp")) == []

    def test_write_failure_with_unlink_failure_still_raises(
        self, tmp_data_dir: Path, mk: bytes, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        def _boom(*args: object) -> None:
            raise OSError("模拟文件系统失败")

        monkeypatch.setattr(os, "replace", _boom)
        monkeypatch.setattr(os, "unlink", _boom)
        with pytest.raises(ManifestIntegrityError, match="写入失败"):
            write_manifest_mac(MANIFEST, mk)
        monkeypatch.undo()
        for leftover in manifest_mac_path().parent.glob(".mac-*.tmp"):
            leftover.unlink()

    def test_sig_read_os_error_wrapped(
        self, tmp_data_dir: Path, mk: bytes, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        write_manifest_mac(MANIFEST, mk)

        def _boom_read_text(self: Path, *args: object, **kwargs: object) -> str:
            raise OSError("模拟读取失败")

        monkeypatch.setattr(Path, "read_text", _boom_read_text)
        with pytest.raises(ManifestIntegrityError, match="读取失败"):
            verify_manifest_mac(MANIFEST, mk)

    def test_backup_copy_failure_wrapped(
        self, tmp_data_dir: Path, mk: bytes, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        _seed_manifest(mk)

        def _boom_copy2(src: object, dst: object) -> None:
            raise OSError("模拟复制失败")

        monkeypatch.setattr(shutil, "copy2", _boom_copy2)
        with pytest.raises(ManifestIntegrityError, match="损坏备份失败"):
            handle_corrupted_manifest(mk=mk, now=TS)

    def test_stale_sig_unlink_failure_wrapped(
        self, tmp_data_dir: Path, mk: bytes, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        _seed_manifest(mk)

        def _boom_unlink(self: Path, *args: object) -> None:
            raise OSError("模拟删除失败")

        monkeypatch.setattr(Path, "unlink", _boom_unlink)
        with pytest.raises(ManifestIntegrityError, match="移除失败"):
            handle_corrupted_manifest(now=TS)  # 不提供 mk → 走旧签名移除分支


class TestLogRedLine:
    """MK / 清单内容零日志（A3 红线，caplog 断言）。"""

    def test_no_mk_or_manifest_content_in_logs(
        self, tmp_data_dir: Path, mk: bytes, caplog: pytest.LogCaptureFixture
    ) -> None:
        with caplog.at_level(logging.DEBUG):
            write_manifest_mac(MANIFEST, mk)
            verify_manifest_mac(MANIFEST, mk)
            handle_corrupted_manifest(mk=mk, reason="日志红线测试", now=TS)

        for record in caplog.records:
            msg = record.getMessage()
            assert mk.hex() not in msg
            assert MANIFEST.decode("utf-8") not in msg
            assert "profile.json" not in msg  # 清单内容片段

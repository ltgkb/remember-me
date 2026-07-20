"""sync.config 配置基座测试 — 对应迭代计划 A1 验收：原子写 round-trip + 字段校验。

覆盖：默认值语义（不落盘 vs load_or_create 落盘）、deviceId 稳定性、
KDF 参数成对校验、全字段 round-trip、损坏 / 非法结构拒绝、写盘失败包装。
"""

from __future__ import annotations

import json
import os
import uuid
from collections.abc import Callable
from pathlib import Path
from typing import Any

import pytest

from memory_engine.sync.config import (
    CONFIG_FORMAT_VERSION,
    SyncConfig,
    load_config,
    load_or_create_config,
    save_config,
)
from memory_engine.sync.errors import SyncConfigError
from memory_engine.sync.paths import config_path

VALID_DOC: dict[str, object] = {
    "version": 1,
    "deviceId": "12345678-1234-5678-1234-567812345678",
    "sync": {"enabled": False},
    "kdf": None,
    "lamport": 0,
}
"""结构合法的最小配置文档（各损坏用例在其上变异）。"""


def _write_raw(payload: str, data_dir: Path | None = None) -> Path:
    """把原始字符串写入 config.json（含父目录创建），返回路径。"""
    path = config_path(data_dir)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(payload, encoding="utf-8")
    return path


class TestLoadDefaults:
    """文件不存在时的「内存默认值」语义（不落盘、deviceId 临时）。"""

    def test_missing_file_returns_memory_default(self, tmp_data_dir: Path) -> None:
        cfg = load_config()
        assert cfg.sync_enabled is False
        assert cfg.kdf_method is None
        assert cfg.kdf_salt_hex is None
        assert cfg.kdf_salt() is None
        assert cfg.lamport == 0
        uuid.UUID(cfg.device_id)  # deviceId 为合法 UUID
        assert not config_path().exists()  # 不落盘

    def test_missing_file_default_device_id_is_temporary(self, tmp_data_dir: Path) -> None:
        """未落盘的默认配置每次生成新 deviceId（稳定标识须走 load_or_create）。"""
        assert load_config().device_id != load_config().device_id


class TestLoadOrCreate:
    """load_or_create：首次落盘 + deviceId 跨进程稳定（A1 既定语义）。"""

    def test_creates_file_and_device_id_stable(self, tmp_data_dir: Path) -> None:
        first = load_or_create_config()
        assert config_path().exists()
        assert load_or_create_config().device_id == first.device_id
        assert load_config().device_id == first.device_id

    def test_explicit_data_dir(self, tmp_path: Path) -> None:
        cfg = load_or_create_config(tmp_path)
        assert config_path(tmp_path).exists()
        assert load_config(tmp_path).device_id == cfg.device_id

    def test_created_file_is_pretty_json_with_null_kdf(self, tmp_data_dir: Path) -> None:
        load_or_create_config()
        doc = json.loads(config_path().read_text(encoding="utf-8"))
        assert doc["version"] == CONFIG_FORMAT_VERSION
        assert doc["kdf"] is None
        assert doc["sync"] == {"enabled": False}
        assert doc["lamport"] == 0


class TestRoundTrip:
    """原子写 round-trip 冒烟（A1 验收第 3 条）。"""

    def test_full_field_round_trip(self, tmp_data_dir: Path) -> None:
        cfg = load_or_create_config()
        cfg.sync_enabled = True
        cfg.set_kdf_params("argon2id", b"\x01" * 16)
        cfg.lamport = 42
        save_config(cfg)

        loaded = load_config()
        assert loaded.device_id == cfg.device_id
        assert loaded.sync_enabled is True
        assert loaded.kdf_method == "argon2id"
        assert loaded.kdf_salt() == b"\x01" * 16
        assert loaded.lamport == 42

    def test_atomic_write_leaves_no_tmp_files(self, tmp_data_dir: Path) -> None:
        save_config(load_or_create_config())
        assert list(config_path().parent.glob(".config-*.tmp")) == []

    def test_save_overwrite_keeps_device_id(self, tmp_data_dir: Path) -> None:
        cfg = load_or_create_config()
        cfg.sync_enabled = True
        save_config(cfg)
        assert load_config().device_id == cfg.device_id

    def test_pbkdf2_method_round_trip(self, tmp_data_dir: Path) -> None:
        cfg = load_or_create_config()
        cfg.set_kdf_params("pbkdf2", b"\xff" * 16)
        save_config(cfg)
        loaded = load_config()
        assert loaded.kdf_method == "pbkdf2"
        assert loaded.kdf_salt() == b"\xff" * 16


class TestKdfParams:
    """KDF 参数成对约束与 salt 编解码。"""

    def test_set_kdf_params_rejects_short_salt(self) -> None:
        cfg = SyncConfig(device_id=str(uuid.uuid4()))
        with pytest.raises(SyncConfigError, match="salt 长度不足"):
            cfg.set_kdf_params("argon2id", b"\x00" * 8)

    def test_kdf_salt_invalid_hex_raises(self) -> None:
        cfg = SyncConfig(
            device_id=str(uuid.uuid4()), kdf_method="argon2id", kdf_salt_hex="zz"
        )
        with pytest.raises(SyncConfigError, match="不是合法 hex"):
            cfg.kdf_salt()

    def test_save_rejects_unpaired_kdf_params(self, tmp_data_dir: Path) -> None:
        only_method = SyncConfig(device_id=str(uuid.uuid4()), kdf_method="pbkdf2")
        with pytest.raises(SyncConfigError, match="成对"):
            save_config(only_method)
        only_salt = SyncConfig(device_id=str(uuid.uuid4()), kdf_salt_hex="00" * 16)
        with pytest.raises(SyncConfigError, match="成对"):
            save_config(only_salt)


class TestCorruptionAndValidation:
    """损坏 / 非法结构一律拒绝且绝不返回部分数据。"""

    def test_invalid_json_rejected(self, tmp_data_dir: Path) -> None:
        _write_raw("这不是 JSON {{{")
        with pytest.raises(SyncConfigError, match="JSON 解析失败"):
            load_config()

    @pytest.mark.parametrize(
        ("mutate", "match"),
        [
            pytest.param(lambda d: d.update(version=2), "版本不支持", id="bad-version"),
            pytest.param(lambda d: d.pop("deviceId"), "deviceId", id="missing-device-id"),
            pytest.param(
                lambda d: d.update(deviceId="not-a-uuid"), "UUID", id="device-id-not-uuid"
            ),
            pytest.param(lambda d: d.pop("sync"), "sync 段", id="missing-sync"),
            pytest.param(lambda d: d.update(sync="yes"), "sync 段", id="sync-not-dict"),
            pytest.param(
                lambda d: d.update(sync={"enabled": "yes"}), "布尔", id="enabled-not-bool"
            ),
            pytest.param(lambda d: d.update(kdf="argon2id"), "kdf 段", id="kdf-not-dict"),
            pytest.param(
                lambda d: d.update(kdf={"method": "scrypt", "salt": "00" * 16}),
                "kdf.method 仅支持",
                id="unknown-method",
            ),
            pytest.param(
                lambda d: d.update(kdf={"method": "argon2id"}), "成对出现", id="salt-missing"
            ),
            pytest.param(
                lambda d: d.update(kdf={"method": "argon2id", "salt": "zz"}),
                "不是合法 hex",
                id="salt-non-hex",
            ),
            pytest.param(
                lambda d: d.update(kdf={"method": "argon2id", "salt": "00" * 8}),
                "长度不足",
                id="salt-too-short",
            ),
            pytest.param(lambda d: d.update(lamport=-1), "非负整数", id="lamport-negative"),
            pytest.param(lambda d: d.update(lamport=True), "非负整数", id="lamport-bool"),
            pytest.param(lambda d: d.update(lamport="5"), "非负整数", id="lamport-str"),
        ],
    )
    def test_invalid_structure_rejected(
        self, tmp_data_dir: Path, mutate: Callable[[dict[str, Any]], None], match: str
    ) -> None:
        doc: dict[str, Any] = json.loads(json.dumps(VALID_DOC))
        mutate(doc)
        _write_raw(json.dumps(doc, ensure_ascii=False))
        with pytest.raises(SyncConfigError, match=match):
            load_config()

    def test_top_level_not_dict_rejected(self, tmp_data_dir: Path) -> None:
        _write_raw(json.dumps(["not", "a", "dict"]))
        with pytest.raises(SyncConfigError, match="顶层必须是 JSON 对象"):
            load_config()

    def test_missing_lamport_defaults_to_zero(self, tmp_data_dir: Path) -> None:
        doc = json.loads(json.dumps(VALID_DOC))
        doc.pop("lamport")
        _write_raw(json.dumps(doc))
        assert load_config().lamport == 0

    def test_kdf_empty_object_treated_as_unset(self, tmp_data_dir: Path) -> None:
        doc = json.loads(json.dumps(VALID_DOC))
        doc["kdf"] = {}
        _write_raw(json.dumps(doc))
        cfg = load_config()
        assert cfg.kdf_method is None
        assert cfg.kdf_salt_hex is None


class TestWriteAndReadFailures:
    """底层 IO 失败统一包装为 SyncConfigError，临时文件不残留。"""

    def test_write_failure_wrapped_and_tmp_cleaned(
        self, tmp_data_dir: Path, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        def _boom_replace(src: str, dst: str) -> None:
            raise OSError("模拟替换失败")

        monkeypatch.setattr(os, "replace", _boom_replace)
        cfg = SyncConfig(device_id=str(uuid.uuid4()))
        with pytest.raises(SyncConfigError, match="写入失败"):
            save_config(cfg)
        assert list(config_path().parent.glob(".config-*.tmp")) == []

    def test_write_failure_with_unlink_failure_still_raises(
        self, tmp_data_dir: Path, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        def _boom(*args: object) -> None:
            raise OSError("模拟文件系统失败")

        monkeypatch.setattr(os, "replace", _boom)
        monkeypatch.setattr(os, "unlink", _boom)
        cfg = SyncConfig(device_id=str(uuid.uuid4()))
        with pytest.raises(SyncConfigError, match="写入失败"):
            save_config(cfg)
        monkeypatch.undo()
        for leftover in config_path().parent.glob(".config-*.tmp"):
            leftover.unlink()

    def test_read_os_error_wrapped(
        self, tmp_data_dir: Path, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        load_or_create_config()

        def _boom_read_text(self: Path, *args: object, **kwargs: object) -> str:
            raise OSError("模拟读取失败")

        monkeypatch.setattr(Path, "read_text", _boom_read_text)
        with pytest.raises(SyncConfigError, match="读取失败"):
            load_config()

"""sync.manifest FileVersion 清单测试 — 对应迭代计划 B2 验收矩阵。

覆盖：FileVersion 字段与架构 §3.2 逐项对齐（命名 / 类型 / frozen）；
序列化 round-trip 与 EMPTY_MANIFEST_BYTES 向后兼容；读写全程 HMAC 保护
（1 bit 篡改 → 损坏处置 + 空清单重建 + 重签闭环）；diff 新增 / 变更 /
冲突 / 伪冲突四分矩阵全覆盖；scan 对约定四类文件正确枚举并排除
.backups/ 与 templates/；build 的保戳 / 打戳 / 移除语义。

fixture 自包含（conftest 由主协调代理统一整合，本文件不依赖、不修改）。
"""

from __future__ import annotations

import dataclasses
import hashlib
import json
import os
from datetime import datetime
from pathlib import Path

import pytest

from memory_engine.crypto.kdf import derive_subkeys
from memory_engine.sync.errors import SyncError
from memory_engine.sync.lamport import LamportClock
from memory_engine.sync.manifest import (
    MANIFEST_FORMAT_VERSION,
    FileVersion,
    Manifest,
    build_manifest,
    hash_file_content,
    scan_sync_files,
)
from memory_engine.sync.manifest_mac import (
    EMPTY_MANIFEST_BYTES,
    ManifestCorrupted,
    verify_manifest_mac,
    write_manifest_mac,
)
from memory_engine.sync.paths import manifest_mac_path, manifest_path

MASTER_KEY = bytes(range(32))
"""测试用主密钥（固定值，仅用于派生 MK）。"""

TS_A = "2026-07-21T10:30:00+00:00"
TS_B = "2026-07-21T11:00:00+00:00"
"""两个合法的 ISO 8601 UTC 时间戳（伪冲突构造用）。"""


@pytest.fixture()
def mk() -> bytes:
    """MK 子密钥（derive_subkeys 域分离输出）。"""
    return derive_subkeys(MASTER_KEY).mk


def _v(
    filepath: str,
    lamport: int = 1,
    device_id: str = "dev-a",
    hash_seed: str = "content-a",
    modified_at: str = TS_A,
) -> FileVersion:
    """构造合法 FileVersion（contentHash 为 seed 的真实 SHA-256）。"""
    return FileVersion(
        filepath=filepath,
        lamport=lamport,
        deviceId=device_id,
        contentHash=hashlib.sha256(hash_seed.encode("utf-8")).hexdigest(),
        modifiedAt=modified_at,
    )


def _plant(root: Path, relative: str, content: bytes = b"{}") -> Path:
    """在数据目录落一个文件（含父目录创建），返回路径。"""
    target = root / Path(relative)
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_bytes(content)
    return target


def _write_signed(payload: bytes, mk: bytes, data_dir: Path) -> None:
    """落一份带合法签名的原始字节（验签通过但内容非法的用例现场）。"""
    manifest_path(data_dir).parent.mkdir(parents=True, exist_ok=True)
    manifest_path(data_dir).write_bytes(payload)
    write_manifest_mac(payload, mk, data_dir)


class TestFileVersionModel:
    """FileVersion 与架构 §3.2 数据模型逐项对齐（B2 验收第 2 条）。"""

    def test_fields_align_with_architecture(self) -> None:
        """字段名 / 顺序与架构 §3.2 TypeScript 接口逐字一致。"""
        assert [f.name for f in dataclasses.fields(FileVersion)] == [
            "filepath",
            "lamport",
            "deviceId",
            "contentHash",
            "modifiedAt",
        ]

    def test_frozen(self) -> None:
        version = _v("profile.json")
        with pytest.raises(dataclasses.FrozenInstanceError):
            version.lamport = 99  # type: ignore[misc]

    def test_stamp(self) -> None:
        assert _v("profile.json", lamport=7, device_id="dev-x").stamp() == (7, "dev-x")

    def test_to_dict_entry_shape(self) -> None:
        entry = _v("profile.json", lamport=3).to_dict()
        assert set(entry) == {"lamport", "deviceId", "contentHash", "modifiedAt"}
        assert entry["lamport"] == 3
        assert len(entry["contentHash"]) == 64  # SHA-256 hex

    @pytest.mark.parametrize(
        ("kwargs", "match"),
        [
            pytest.param({"filepath": ""}, "filepath", id="empty-filepath"),
            pytest.param({"filepath": "/abs/profile.json"}, "filepath", id="absolute-path"),
            pytest.param({"filepath": "projects\\a.json"}, "filepath", id="backslash"),
            pytest.param({"filepath": "../escape.json"}, "filepath", id="dotdot"),
            pytest.param({"lamport": -1}, "lamport", id="negative-lamport"),
            pytest.param({"lamport": True}, "lamport", id="bool-lamport"),
            pytest.param({"device_id": ""}, "deviceId", id="empty-device-id"),
            pytest.param({"modified_at": 123}, "ISO 8601 字符串", id="non-str-ts"),
            pytest.param({"modified_at": "not-a-date"}, "ISO 8601", id="bad-iso"),
            pytest.param({"modified_at": "2026-07-21T10:30:00"}, "UTC 偏移", id="naive-ts"),
        ],
    )
    def test_invalid_fields_rejected(self, kwargs: dict[str, object], match: str) -> None:
        base: dict[str, object] = {
            "filepath": "profile.json",
            "lamport": 1,
            "device_id": "dev-a",
            "hash_seed": "x",
            "modified_at": TS_A,
        }
        base.update(kwargs)
        with pytest.raises(SyncError, match=match):
            _v(**base)  # type: ignore[arg-type]

    @pytest.mark.parametrize(
        "bad_hash",
        [
            pytest.param("zz" * 32, id="non-hex"),
            pytest.param("ab" * 16, id="too-short"),
            pytest.param("AB" * 32, id="uppercase"),
            pytest.param("", id="empty"),
        ],
    )
    def test_invalid_content_hash_rejected(self, bad_hash: str) -> None:
        with pytest.raises(SyncError, match="contentHash"):
            FileVersion(
                filepath="profile.json",
                lamport=1,
                deviceId="dev-a",
                contentHash=bad_hash,
                modifiedAt=TS_A,
            )


class TestSerialization:
    """序列化 round-trip 与初始模式向后兼容。"""

    def test_round_trip(self) -> None:
        manifest = Manifest(
            files={
                "profile.json": _v("profile.json", lamport=3),
                "projects/p/context.json": _v("projects/p/context.json", lamport=4),
            }
        )
        restored = Manifest.from_bytes(manifest.to_bytes())
        assert restored.files == manifest.files

    def test_to_bytes_canonical_and_deterministic(self) -> None:
        manifest = Manifest(
            files={"b.json": _v("b.json"), "a.json": _v("a.json")}
        )
        first, second = manifest.to_bytes(), manifest.to_bytes()
        assert first == second  # 同内容同字节（HMAC 输入确定）
        assert first.endswith(b"\n")
        doc = json.loads(first.decode("utf-8"))
        assert doc["version"] == MANIFEST_FORMAT_VERSION
        assert list(doc["files"]) == ["a.json", "b.json"]  # 键排序

    def test_empty_manifest_bytes_backward_compatible(self) -> None:
        """EMPTY_MANIFEST_BYTES（{"version": 1, "files": {}}）解析为空清单。"""
        assert Manifest.from_bytes(EMPTY_MANIFEST_BYTES).files == {}
        assert Manifest.from_dict({"version": 1, "files": {}}).files == {}

    def test_from_bytes_invalid_json(self) -> None:
        with pytest.raises(SyncError, match="JSON 解析失败"):
            Manifest.from_bytes("这不是 JSON {{{".encode("utf-8"))
        with pytest.raises(SyncError, match="JSON 解析失败"):
            Manifest.from_bytes(b"\xff\xfe invalid utf-8")

    @pytest.mark.parametrize(
        ("doc", "match"),
        [
            pytest.param(["not", "dict"], "顶层", id="top-not-dict"),
            pytest.param({"version": 2, "files": {}}, "版本不支持", id="bad-version"),
            pytest.param({"version": 1}, "files 段", id="missing-files"),
            pytest.param({"version": 1, "files": []}, "files 段", id="files-not-dict"),
            pytest.param(
                {"version": 1, "files": {"a.json": "oops"}}, "JSON 对象", id="entry-not-dict"
            ),
        ],
    )
    def test_from_dict_invalid_structure(self, doc: object, match: str) -> None:
        with pytest.raises(SyncError, match=match):
            Manifest.from_dict(doc)

    def test_from_dict_entry_missing_field(self) -> None:
        entry = _v("a.json").to_dict()
        del entry["modifiedAt"]
        doc = {"version": 1, "files": {"a.json": entry}}
        with pytest.raises(SyncError, match="缺少字段"):
            Manifest.from_dict(doc)

    def test_collection_operations(self) -> None:
        manifest = Manifest()
        version = _v("profile.json", lamport=2)
        manifest.upsert(version)
        assert manifest.get("profile.json") == version
        assert manifest.remove("profile.json") == version
        assert manifest.get("profile.json") is None
        assert manifest.remove("missing.json") is None

    def test_corruption_excluded_from_equality(self, tmp_path: Path, mk: bytes) -> None:
        intact = Manifest(files={"a.json": _v("a.json")})
        corrupted = Manifest(files={"a.json": _v("a.json")})
        corrupted.corruption = ManifestCorrupted(
            backup_dir=tmp_path,
            backed_up_files=(),
            manifest_path=tmp_path / "m",
            sig_path=None,
            rebuilt_at=TS_A,
            reason="测试",
        )
        assert intact == corrupted  # corruption 不参与相等比较


class TestSaveLoadHmac:
    """读写全程 HMAC 保护（B2 任务描述第 3 条）。"""

    def _seed_manifest(self) -> Manifest:
        return Manifest(
            files={
                "profile.json": _v("profile.json", lamport=3),
                "projects/p/context.json": _v("projects/p/context.json", lamport=4),
            }
        )

    def test_save_writes_manifest_and_sig(self, tmp_path: Path, mk: bytes) -> None:
        path = self._seed_manifest().save(mk, tmp_path)
        assert path == manifest_path(tmp_path)
        assert manifest_mac_path(tmp_path).is_file()
        verify_manifest_mac(manifest_path(tmp_path).read_bytes(), mk, tmp_path)

    def test_load_round_trip(self, tmp_path: Path, mk: bytes) -> None:
        manifest = self._seed_manifest()
        manifest.save(mk, tmp_path)
        loaded = Manifest.load(mk, tmp_path)
        assert loaded.files == manifest.files
        assert loaded.corruption is None

    def test_load_missing_returns_empty_without_corruption(
        self, tmp_path: Path, mk: bytes
    ) -> None:
        loaded = Manifest.load(mk, tmp_path)
        assert loaded.files == {}
        assert loaded.corruption is None  # 全新设备语义，不触发损坏处置

    def test_one_bit_tamper_triggers_rebuild(self, tmp_path: Path, mk: bytes) -> None:
        """篡改 manifest.json 1 bit → 备份 + 空清单重建 + 重签 完整闭环。"""
        self._seed_manifest().save(mk, tmp_path)
        raw = bytearray(manifest_path(tmp_path).read_bytes())
        raw[-10] ^= 0x01  # 篡改清单内容 1 bit（落在 JSON 区域内）
        manifest_path(tmp_path).write_bytes(bytes(raw))

        loaded = Manifest.load(mk, tmp_path)
        assert loaded.files == {}  # 空清单重建
        assert loaded.corruption is not None
        corruption = loaded.corruption
        assert corruption.backed_up_files == ("manifest.json", "manifest.json.sig")
        assert (corruption.backup_dir / "manifest.json").read_bytes() == bytes(raw)
        # 重建的空清单已重签：验签通过，再次 load 为空且无新处置
        verify_manifest_mac(manifest_path(tmp_path).read_bytes(), mk, tmp_path)
        reloaded = Manifest.load(mk, tmp_path)
        assert reloaded.files == {}
        assert reloaded.corruption is None

    def test_missing_sig_triggers_rebuild(self, tmp_path: Path, mk: bytes) -> None:
        self._seed_manifest().save(mk, tmp_path)
        manifest_mac_path(tmp_path).unlink()  # 签名丢失视同完整性无法证明
        loaded = Manifest.load(mk, tmp_path)
        assert loaded.files == {}
        assert loaded.corruption is not None
        assert "签名文件不存在" in loaded.corruption.reason

    def test_signed_but_invalid_json_raises(self, tmp_path: Path, mk: bytes) -> None:
        """验签通过但内容非法 → SyncError（不按篡改语义静默重建）。"""
        _write_signed("这不是 JSON {{{".encode("utf-8"), mk, tmp_path)
        with pytest.raises(SyncError, match="JSON 解析失败"):
            Manifest.load(mk, tmp_path)

    def test_signed_but_bad_structure_raises(self, tmp_path: Path, mk: bytes) -> None:
        payload = json.dumps({"version": 2, "files": {}}).encode("utf-8")
        _write_signed(payload, mk, tmp_path)
        with pytest.raises(SyncError, match="版本不支持"):
            Manifest.load(mk, tmp_path)

    def test_env_var_resolution(
        self, monkeypatch: pytest.MonkeyPatch, tmp_path: Path, mk: bytes
    ) -> None:
        """data_dir=None 时走 REMEMBER_ME_DATA_DIR 约定。"""
        monkeypatch.setenv("REMEMBER_ME_DATA_DIR", str(tmp_path))
        self._seed_manifest().save(mk)
        assert manifest_path(tmp_path).is_file()
        assert Manifest.load(mk).files == self._seed_manifest().files

    def test_save_failure_wrapped_and_tmp_cleaned(
        self, tmp_path: Path, mk: bytes, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        def _boom_replace(src: str, dst: str) -> None:
            raise OSError("模拟替换失败")

        monkeypatch.setattr(os, "replace", _boom_replace)
        with pytest.raises(SyncError, match="写入失败"):
            self._seed_manifest().save(mk, tmp_path)
        assert list(manifest_path(tmp_path).parent.glob(".manifest-*.tmp")) == []

    def test_save_failure_with_unlink_failure_still_raises(
        self, tmp_path: Path, mk: bytes, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        """替换失败且临时文件清理也失败：仍抛 SyncError（清理尽力而为）。"""

        def _boom(*args: object) -> None:
            raise OSError("模拟文件系统失败")

        monkeypatch.setattr(os, "replace", _boom)
        monkeypatch.setattr(os, "unlink", _boom)
        with pytest.raises(SyncError, match="写入失败"):
            self._seed_manifest().save(mk, tmp_path)
        monkeypatch.undo()
        for leftover in manifest_path(tmp_path).parent.glob(".manifest-*.tmp"):
            leftover.unlink()

    def test_load_read_failure_wrapped(
        self, tmp_path: Path, mk: bytes, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        self._seed_manifest().save(mk, tmp_path)

        def _boom_read_bytes(self: Path, *args: object) -> bytes:
            raise OSError("模拟读取失败")

        monkeypatch.setattr(Path, "read_bytes", _boom_read_bytes)
        with pytest.raises(SyncError, match="读取失败"):
            Manifest.load(mk, tmp_path)


class TestDiff:
    """diff 新增 / 变更 / 冲突 / 伪冲突 四分矩阵（B2 验收第 1 条）。"""

    def test_added_both_directions(self) -> None:
        local = Manifest(files={"only-local.json": _v("only-local.json")})
        remote = Manifest(files={"only-remote.json": _v("only-remote.json")})
        diff = local.diff(remote)
        assert set(diff.added_local) == {"only-local.json"}
        assert set(diff.added_remote) == {"only-remote.json"}
        assert diff.changed == {} and diff.conflicts == {} and diff.pseudo_conflicts == {}
        assert not diff.clean

    def test_changed_local_wins_by_lamport(self) -> None:
        local = Manifest(files={"f.json": _v("f.json", lamport=5, hash_seed="new")})
        remote = Manifest(files={"f.json": _v("f.json", lamport=2, hash_seed="old")})
        diff = local.diff(remote)
        assert set(diff.changed) == {"f.json"}
        assert diff.conflicts == {}
        pair = diff.changed["f.json"]
        assert pair.lww_winner == pair.local  # lamport 大者胜（5 > 2）

    def test_changed_remote_wins_by_lamport(self) -> None:
        local = Manifest(files={"f.json": _v("f.json", lamport=2, hash_seed="old")})
        remote = Manifest(files={"f.json": _v("f.json", lamport=6, hash_seed="new")})
        diff = local.diff(remote)
        assert set(diff.changed) == {"f.json"}
        assert diff.changed["f.json"].lww_winner == diff.changed["f.json"].remote

    def test_conflict_concurrent_same_lamport(self) -> None:
        """真冲突：lamport 相等（并发分叉）+ deviceId 不同 + contentHash 不同。"""
        local = Manifest(
            files={"f.json": _v("f.json", lamport=3, device_id="dev-a", hash_seed="x")}
        )
        remote = Manifest(
            files={"f.json": _v("f.json", lamport=3, device_id="dev-b", hash_seed="y")}
        )
        diff = local.diff(remote)
        assert set(diff.conflicts) == {"f.json"}
        assert diff.changed == {}  # 不可自动收敛，不进 changed
        pair = diff.conflicts["f.json"]
        assert pair.lww_winner == pair.remote  # 字典序决胜：dev-a < dev-b，确定

    def test_conflict_same_device_same_lamport(self) -> None:
        """同 deviceId 同 lamport 但 contentHash 不同（时钟损坏形态）→ 仍判冲突。"""
        local = Manifest(files={"f.json": _v("f.json", lamport=3, hash_seed="x")})
        remote = Manifest(files={"f.json": _v("f.json", lamport=3, hash_seed="y")})
        diff = local.diff(remote)
        assert set(diff.conflicts) == {"f.json"}
        assert diff.changed == {}

    def test_pseudo_conflict_same_hash(self) -> None:
        """伪冲突：contentHash 相同，但 lamport / modifiedAt 不同（架构 §3.2）。"""
        local = Manifest(files={"f.json": _v("f.json", lamport=2, modified_at=TS_A)})
        remote = Manifest(
            files={"f.json": _v("f.json", lamport=7, device_id="dev-b", modified_at=TS_B)}
        )
        diff = local.diff(remote)
        assert set(diff.pseudo_conflicts) == {"f.json"}
        assert diff.conflicts == {} and diff.changed == {}
        pair = diff.pseudo_conflicts["f.json"]
        assert pair.local.contentHash == pair.remote.contentHash
        assert pair.lww_winner == pair.remote  # 元数据以 lamport 大者为准

    def test_pseudo_conflict_only_timestamp_differs(self) -> None:
        """最纯粹的伪冲突：仅 modifiedAt 不同（架构 §3.2 原始定义）。"""
        local = Manifest(files={"f.json": _v("f.json", modified_at=TS_A)})
        remote = Manifest(files={"f.json": _v("f.json", modified_at=TS_B)})
        diff = local.diff(remote)
        assert set(diff.pseudo_conflicts) == {"f.json"}

    def test_in_sync_not_classified(self) -> None:
        version = _v("f.json", lamport=4)
        diff = Manifest(files={"f.json": version}).diff(Manifest(files={"f.json": version}))
        assert diff.clean
        assert diff.total == 0

    def test_full_matrix(self) -> None:
        """四分矩阵同场合唱：每个分类恰好命中预期文件。"""
        local = Manifest(
            files={
                "only-local.json": _v("only-local.json"),
                "changed.json": _v("changed.json", lamport=5, hash_seed="new"),
                "conflict.json": _v(
                    "conflict.json", lamport=3, device_id="dev-a", hash_seed="x"
                ),
                "pseudo.json": _v("pseudo.json", lamport=2, modified_at=TS_A),
                "insync.json": _v("insync.json", lamport=4),
            }
        )
        remote = Manifest(
            files={
                "only-remote.json": _v("only-remote.json"),
                "changed.json": _v("changed.json", lamport=2, hash_seed="old"),
                "conflict.json": _v(
                    "conflict.json", lamport=3, device_id="dev-b", hash_seed="y"
                ),
                "pseudo.json": _v("pseudo.json", lamport=7, modified_at=TS_B),
                "insync.json": _v("insync.json", lamport=4),
            }
        )
        diff = local.diff(remote)
        assert set(diff.added_local) == {"only-local.json"}
        assert set(diff.added_remote) == {"only-remote.json"}
        assert set(diff.changed) == {"changed.json"}
        assert set(diff.conflicts) == {"conflict.json"}
        assert set(diff.pseudo_conflicts) == {"pseudo.json"}
        assert diff.total == 5
        assert not diff.clean

    def test_diff_direction_symmetry(self) -> None:
        """方向对称：local.diff(remote) 的 added_local 即反向的 added_remote。"""
        local = Manifest(
            files={"a.json": _v("a.json"), "c.json": _v("c.json", lamport=5, hash_seed="new")}
        )
        remote = Manifest(
            files={"b.json": _v("b.json"), "c.json": _v("c.json", lamport=2, hash_seed="old")}
        )
        forward = local.diff(remote)
        backward = remote.diff(local)
        assert set(forward.added_local) == set(backward.added_remote) == {"a.json"}
        assert set(forward.added_remote) == set(backward.added_local) == {"b.json"}
        assert set(forward.changed) == set(backward.changed) == {"c.json"}

    def test_empty_manifests_clean(self) -> None:
        assert Manifest().diff(Manifest()).clean


class TestScan:
    """scan 对架构 §2.2 约定四类文件正确枚举，排除 .backups/ 与 templates/。"""

    def test_full_layout_with_decoys(self, tmp_path: Path) -> None:
        _plant(tmp_path, "profile.json")
        _plant(tmp_path, "search-settings.json")
        _plant(tmp_path, "projects/alpha/context.json")
        _plant(tmp_path, "projects/alpha/conversations/c1.json")
        _plant(tmp_path, "projects/alpha/conversations/c2.json")
        _plant(tmp_path, "projects/beta/context.json")
        # 以下全部为诱饵，必须排除
        _plant(tmp_path, "random.json")  # 顶层非约定文件
        _plant(tmp_path, "projects/alpha/other.json")  # 项目目录非约定文件
        _plant(tmp_path, "projects/alpha/conversations/note.txt")  # 非 .json
        _plant(tmp_path, ".backups/profile.json")  # 本地版本备份（路线图 §5.1）
        _plant(tmp_path, "templates/t.json")  # 本地模板资产（路线图 §5.1）
        _plant(tmp_path, ".sync/manifest.json")  # 同步产物自身
        _plant(tmp_path, "projects/alpha/.backups/old.json")  # 项目内备份
        _plant(tmp_path, "projects/.hidden/context.json")  # 隐藏项目目录
        _plant(tmp_path, "projects/templates/context.json")  # 项目名命中排除表
        (tmp_path / "projects/alpha/conversations/subdir.json").mkdir()  # 目录非文件

        assert scan_sync_files(tmp_path) == [
            "profile.json",
            "projects/alpha/context.json",
            "projects/alpha/conversations/c1.json",
            "projects/alpha/conversations/c2.json",
            "projects/beta/context.json",
            "search-settings.json",
        ]

    def test_empty_data_dir(self, tmp_path: Path) -> None:
        assert scan_sync_files(tmp_path) == []

    def test_partial_layout(self, tmp_path: Path) -> None:
        """projects 缺失 / conversations 缺失 / 非常规条目均静默跳过。"""
        _plant(tmp_path, "profile.json")
        _plant(tmp_path, "projects/no-conversations/context.json")
        _plant(tmp_path, "projects/empty/context.json")
        (tmp_path / "projects/empty/conversations").mkdir()
        _plant(tmp_path, "projects/stray-file", content=b"x")  # projects 下的文件
        assert scan_sync_files(tmp_path) == [
            "profile.json",
            "projects/empty/context.json",
            "projects/no-conversations/context.json",
        ]

    def test_env_var_resolution(
        self, monkeypatch: pytest.MonkeyPatch, tmp_path: Path
    ) -> None:
        monkeypatch.setenv("REMEMBER_ME_DATA_DIR", str(tmp_path))
        _plant(tmp_path, "profile.json")
        assert scan_sync_files() == ["profile.json"]


class TestBuild:
    """build 从 data_dir 构建本地清单：打戳 / 保戳 / 移除语义。"""

    def _seed_data(self, root: Path) -> dict[str, bytes]:
        contents = {
            "profile.json": b'{"name": "user"}',
            "projects/p/context.json": b'{"project": "p"}',
            "projects/p/conversations/c1.json": b'[{"msg": "hi"}]',
        }
        for relative, content in contents.items():
            _plant(root, relative, content)
        return contents

    def test_build_all_new(self, tmp_path: Path) -> None:
        contents = self._seed_data(tmp_path)
        clock = LamportClock(tmp_path)
        manifest = build_manifest(tmp_path, clock=clock)

        assert set(manifest.files) == set(contents)
        for relative, version in manifest.files.items():
            expected = hashlib.sha256(contents[relative]).hexdigest()
            assert version.contentHash == expected  # 整文件 SHA-256
            assert version.deviceId == clock.device_id
            assert version.filepath == relative
            parsed = datetime.fromisoformat(version.modifiedAt)
            assert parsed.tzinfo is not None  # ISO 8601 带 UTC 偏移
        # lamport 依扫描顺序递增（profile.json < projects/... 字典序）
        lamports = [manifest.files[p].lamport for p in sorted(manifest.files)]
        assert lamports == [1, 2, 3]
        assert clock.value == 3

    def test_rebuild_unchanged_preserves_stamps(self, tmp_path: Path) -> None:
        """内容不变 → 原版本印记完整保留，时钟不前进（无版本膨胀）。"""
        self._seed_data(tmp_path)
        clock = LamportClock(tmp_path)
        first = build_manifest(tmp_path, clock=clock)
        second = build_manifest(tmp_path, clock=clock, base=first)
        assert clock.value == 3
        assert second.files == first.files
        assert second.files["profile.json"] is first.files["profile.json"]

    def test_modify_one_file_gets_new_stamp(self, tmp_path: Path) -> None:
        self._seed_data(tmp_path)
        clock = LamportClock(tmp_path)
        first = build_manifest(tmp_path, clock=clock)
        _plant(tmp_path, "projects/p/conversations/c1.json", b'[{"msg": "edited"}]')
        second = build_manifest(tmp_path, clock=clock, base=first)

        changed = second.files["projects/p/conversations/c1.json"]
        assert changed.lamport == 4  # 新事件打新戳
        assert changed.contentHash != first.files["projects/p/conversations/c1.json"].contentHash
        # 未变文件原样保留
        assert second.files["profile.json"] is first.files["profile.json"]
        assert second.files["projects/p/context.json"] is first.files["projects/p/context.json"]
        assert clock.value == 4  # 只有一个新事件

    def test_deleted_file_removed(self, tmp_path: Path) -> None:
        self._seed_data(tmp_path)
        clock = LamportClock(tmp_path)
        first = build_manifest(tmp_path, clock=clock)
        (tmp_path / "profile.json").unlink()
        second = build_manifest(tmp_path, clock=clock, base=first)
        assert set(second.files) == {
            "projects/p/context.json",
            "projects/p/conversations/c1.json",
        }

    def test_build_without_base_equals_empty_base(self, tmp_path: Path) -> None:
        contents = self._seed_data(tmp_path)
        clock = LamportClock(tmp_path)
        none_base = build_manifest(tmp_path, clock=clock, base=None)
        empty_base = build_manifest(tmp_path, clock=clock, base=Manifest())
        assert set(none_base.files) == set(empty_base.files) == set(contents)
        for path, version in none_base.files.items():
            assert version.contentHash == empty_base.files[path].contentHash
            assert version.deviceId == empty_base.files[path].deviceId

    def test_read_failure_wrapped(
        self, tmp_path: Path, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        self._seed_data(tmp_path)
        clock = LamportClock(tmp_path)

        real_open = Path.open

        def _boom_open(self: Path, *args: object, **kwargs: object) -> object:
            if self.name == "profile.json":
                raise OSError("模拟读取失败")
            return real_open(self, *args, **kwargs)  # type: ignore[arg-type]

        monkeypatch.setattr(Path, "open", _boom_open)
        with pytest.raises(SyncError, match="同步数据源读取失败"):
            build_manifest(tmp_path, clock=clock)

    def test_identical_content_two_devices_only_pseudo(self, tmp_path: Path) -> None:
        """双设备同内容集成：contentHash 一致 → 无变更无冲突，仅伪冲突。"""
        dir_a, dir_b = tmp_path / "a", tmp_path / "b"
        for root in (dir_a, dir_b):
            _plant(root, "profile.json", b'{"name": "user"}')
            _plant(root, "projects/p/context.json", b'{"project": "p"}')
        manifest_a = build_manifest(dir_a, clock=LamportClock(dir_a))
        manifest_b = build_manifest(dir_b, clock=LamportClock(dir_b))

        diff = manifest_a.diff(manifest_b)
        assert diff.changed == {} and diff.conflicts == {}
        assert diff.added_local == {} and diff.added_remote == {}
        # 内容一致但时钟 / 设备标识不同 → 全部落入伪冲突（自动收敛，不传内容）
        assert set(diff.pseudo_conflicts) == {"profile.json", "projects/p/context.json"}
        for version in manifest_a.files.values():
            assert version.contentHash == manifest_b.files[version.filepath].contentHash

    def test_hash_file_content_matches_stdlib(self, tmp_path: Path) -> None:
        target = _plant(tmp_path, "profile.json", b"x" * (3 * 1024 * 1024))  # 3MB 分块
        assert hash_file_content(target) == hashlib.sha256(b"x" * (3 * 1024 * 1024)).hexdigest()

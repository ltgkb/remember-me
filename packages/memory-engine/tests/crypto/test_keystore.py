"""KeyStore 抽象契约与双后端测试 — 对应迭代计划 C1 第 5 项。

覆盖：
* 内存 fake 后端（InMemoryKeyStore）验证 KeyStore ABC 四方法契约；
* FileKeyStore 降级文件全链路（REMEMBER_ME_DATA_DIR 隔离到 tmp 目录）、
  坏口令、文件损坏（截断 / 非法 JSON / 结构非法）、AAD 防错配；
* KeyringKeyStore 本机实测（skipif 条件跳过）+ mock 后端错误包装；
* get_keystore 工厂的后端选择逻辑。
"""

from __future__ import annotations

import json
import os
import uuid
from collections.abc import Callable, Iterator
from pathlib import Path

import keyring
import keyring.errors
import pytest

from memory_engine.crypto.errors import KeyStoreError
from memory_engine.crypto.keystore import (
    FileKeyStore,
    KeyringKeyStore,
    KeyStore,
    _check_key_length,
    get_keystore,
)

TEST_PASSPHRASE = "降级文件测试口令-456"
"""FileKeyStore 测试用口令。"""


def _unique_key_id() -> str:
    """生成全局唯一的测试 key_id，避免污染真实密钥环中的既有条目。"""
    return f"pytest-{uuid.uuid4().hex[:12]}"


requires_keyring = pytest.mark.skipif(
    not KeyringKeyStore.is_available(),
    reason="当前环境无可用系统密钥环后端（无桌面会话 / 策略限制），按 CI 约定条件跳过",
)


class InMemoryKeyStore(KeyStore):
    """内存 fake 后端：dict 存储，用于验证 KeyStore 抽象契约四方法行为。"""

    def __init__(self) -> None:
        self._data: dict[str, bytes] = {}

    def store(self, key_id: str, key: bytes) -> None:
        """存入密钥；复用模块级长度校验以贴近真实后端的契约。"""
        _check_key_length(key)
        self._data[key_id] = key

    def load(self, key_id: str) -> bytes:
        """读回密钥；key_id 缺失抛 KeyStoreError。"""
        try:
            return self._data[key_id]
        except KeyError as exc:
            raise KeyStoreError(f"内存后端中不存在密钥（key_id={key_id!r}）") from exc

    def delete(self, key_id: str) -> None:
        """删除密钥；key_id 不存在时为幂等空操作。"""
        self._data.pop(key_id, None)

    def exists(self, key_id: str) -> bool:
        """判断 key_id 是否已托管。"""
        return key_id in self._data


class TestAbstractContract:
    """KeyStore ABC 的抽象约束与 InMemoryKeyStore 的四方法契约行为。"""

    def test_abstract_methods_enforced(self) -> None:
        """缺少抽象方法实现的子类在实例化阶段即报 TypeError。"""

        class IncompleteKeyStore(KeyStore):
            pass

        with pytest.raises(TypeError):
            IncompleteKeyStore()

    @pytest.fixture()
    def store(self) -> InMemoryKeyStore:
        """每个用例一枚全新的内存后端。"""
        return InMemoryKeyStore()

    def test_store_load_round_trip(self, store: InMemoryKeyStore, random_key: bytes) -> None:
        """store 后 load 逐字节读回同一密钥。"""
        store.store("master", random_key)
        assert store.load("master") == random_key

    def test_load_missing_key_id_raises(self, store: InMemoryKeyStore) -> None:
        """load 不存在的 key_id 抛 KeyStoreError。"""
        with pytest.raises(KeyStoreError):
            store.load("missing")

    def test_exists_reflects_state(self, store: InMemoryKeyStore, random_key: bytes) -> None:
        """exists 在 store 前后分别返回 False / True。"""
        assert store.exists("master") is False
        store.store("master", random_key)
        assert store.exists("master") is True

    def test_delete_idempotent(self, store: InMemoryKeyStore, random_key: bytes) -> None:
        """delete 对已存在 / 不存在的 key_id 均可重复调用且幂等。"""
        store.store("master", random_key)
        store.delete("master")
        assert store.exists("master") is False
        store.delete("master")
        store.delete("never-existed")

    def test_store_overwrites_same_key_id(
        self, store: InMemoryKeyStore, key_factory: Callable[[int], bytes]
    ) -> None:
        """同 key_id 覆盖写后 load 返回最新值。"""
        store.store("master", key_factory(32))
        latest = key_factory(32)
        store.store("master", latest)
        assert store.load("master") == latest

    def test_accepts_16_and_32_byte_keys(
        self, store: InMemoryKeyStore, key_factory: Callable[[int], bytes]
    ) -> None:
        """契约允许托管 16 / 32 字节密钥。"""
        store.store("k16", key_factory(16))
        store.store("k32", key_factory(32))
        assert len(store.load("k16")) == 16
        assert len(store.load("k32")) == 32

    @pytest.mark.parametrize("bad_length", [0, 15, 17, 31, 33])
    def test_rejects_invalid_key_length(
        self, store: InMemoryKeyStore, key_factory: Callable[[int], bytes], bad_length: int
    ) -> None:
        """非法长度密钥在 store 入口即被拒绝。"""
        with pytest.raises(KeyStoreError):
            store.store("bad", key_factory(bad_length))


@pytest.fixture()
def file_store(tmp_data_dir: Path) -> FileKeyStore:
    """经 REMEMBER_ME_DATA_DIR 隔离到 pytest 临时目录的 FileKeyStore。"""
    return FileKeyStore(passphrase=TEST_PASSPHRASE)


class TestFileKeyStore:
    """FileKeyStore 降级后端全链路、坏口令与文件损坏语义。"""

    def test_store_load_exists_delete_full_flow(
        self, file_store: FileKeyStore, random_key: bytes
    ) -> None:
        """store → exists → load → delete → exists 全链路行为正确。"""
        assert file_store.exists("master") is False
        file_store.store("master", random_key)
        assert file_store.exists("master") is True
        assert file_store.load("master") == random_key
        file_store.delete("master")
        assert file_store.exists("master") is False

    def test_keystore_file_location(
        self, file_store: FileKeyStore, tmp_data_dir: Path, random_key: bytes
    ) -> None:
        """密钥文件落在 {data_dir}/.sync/keystore.enc。"""
        file_store.store("master", random_key)
        expected = tmp_data_dir / ".sync" / "keystore.enc"
        assert file_store.path == expected
        assert expected.is_file()

    def test_explicit_data_dir_bypasses_env(self, tmp_path: Path, random_key: bytes) -> None:
        """显式 data_dir 参数直接决定密钥文件位置（不依赖环境变量）。"""
        store = FileKeyStore(passphrase=TEST_PASSPHRASE, data_dir=tmp_path)
        store.store("master", random_key)
        assert store.path == tmp_path / ".sync" / "keystore.enc"
        assert store.load("master") == random_key

    def test_16_byte_key_supported(
        self, file_store: FileKeyStore, key_factory: Callable[[int], bytes]
    ) -> None:
        """16 字节密钥（AES-128 级）同样可托管。"""
        key = key_factory(16)
        file_store.store("k16", key)
        assert file_store.load("k16") == key

    def test_multiple_entries_coexist(
        self, file_store: FileKeyStore, key_factory: Callable[[int], bytes]
    ) -> None:
        """多个条目互不干扰，可独立读写删。"""
        key_a, key_b = key_factory(32), key_factory(32)
        file_store.store("a", key_a)
        file_store.store("b", key_b)
        file_store.delete("a")
        assert file_store.exists("a") is False
        assert file_store.load("b") == key_b

    def test_store_overwrites_entry(
        self, file_store: FileKeyStore, key_factory: Callable[[int], bytes]
    ) -> None:
        """同 key_id 覆盖写后读回最新密钥。"""
        file_store.store("master", key_factory(32))
        latest = key_factory(32)
        file_store.store("master", latest)
        assert file_store.load("master") == latest

    def test_empty_passphrase_rejected(self, tmp_data_dir: Path) -> None:
        """空口令构造 FileKeyStore 直接抛 KeyStoreError。"""
        with pytest.raises(KeyStoreError, match="非空口令"):
            FileKeyStore(passphrase="")

    @pytest.mark.parametrize("bad_length", [0, 15, 17, 31, 33])
    def test_store_rejects_invalid_key_length(
        self, file_store: FileKeyStore, key_factory: Callable[[int], bytes], bad_length: int
    ) -> None:
        """非法长度密钥在 store 入口即被拒绝。"""
        with pytest.raises(KeyStoreError):
            file_store.store("bad", key_factory(bad_length))

    def test_load_without_file_raises(self, file_store: FileKeyStore) -> None:
        """密钥文件不存在时 load 抛 KeyStoreError。"""
        with pytest.raises(KeyStoreError, match="尚未托管任何密钥"):
            file_store.load("master")

    def test_exists_without_file_is_false(self, file_store: FileKeyStore) -> None:
        """密钥文件不存在时 exists 返回 False。"""
        assert file_store.exists("master") is False

    def test_delete_idempotent(self, file_store: FileKeyStore, random_key: bytes) -> None:
        """delete 对无文件 / 无条目 / 已删除场景均为幂等空操作。"""
        file_store.delete("ghost")
        file_store.store("master", random_key)
        file_store.delete("ghost")
        file_store.delete("master")
        file_store.delete("master")
        assert file_store.exists("master") is False

    def test_wrong_passphrase_raises(
        self, file_store: FileKeyStore, tmp_data_dir: Path, random_key: bytes
    ) -> None:
        """坏口令读回时解密认证失败，统一包装为 KeyStoreError 而非 CipherError。"""
        file_store.store("master", random_key)
        attacker = FileKeyStore(passphrase="错误口令")
        with pytest.raises(KeyStoreError, match="口令错误或文件已损坏"):
            attacker.load("master")

    def test_corrupted_file_invalid_json(
        self, file_store: FileKeyStore, random_key: bytes
    ) -> None:
        """密钥文件被改写为非法 JSON 时 load / exists 均抛 KeyStoreError。"""
        file_store.store("master", random_key)
        file_store.path.write_text("这不是 JSON {{{", encoding="utf-8")
        with pytest.raises(KeyStoreError, match="JSON 解析失败"):
            file_store.load("master")
        with pytest.raises(KeyStoreError, match="JSON 解析失败"):
            file_store.exists("master")

    def test_corrupted_file_truncated(
        self, file_store: FileKeyStore, random_key: bytes
    ) -> None:
        """密钥文件被截断（半截 JSON）时抛 KeyStoreError。"""
        file_store.store("master", random_key)
        raw = file_store.path.read_text(encoding="utf-8")
        file_store.path.write_text(raw[: len(raw) // 2], encoding="utf-8")
        with pytest.raises(KeyStoreError):
            file_store.load("master")

    @pytest.mark.parametrize(
        "bad_doc",
        [
            pytest.param({"version": 2, "salt": "00" * 16, "entries": {}}, id="bad-version"),
            pytest.param({"version": 1, "entries": {}}, id="missing-salt"),
            pytest.param({"version": 1, "salt": "00" * 16}, id="missing-entries"),
            pytest.param(["not", "a", "dict"], id="not-a-dict"),
        ],
    )
    def test_invalid_file_structure_rejected(
        self, file_store: FileKeyStore, bad_doc: object
    ) -> None:
        """顶层结构非法或版本不支持的密钥文件被拒绝，绝不返回部分数据。"""
        file_store.path.parent.mkdir(parents=True, exist_ok=True)
        file_store.path.write_text(json.dumps(bad_doc), encoding="utf-8")
        with pytest.raises(KeyStoreError, match="格式非法或版本不支持"):
            file_store.load("master")

    def test_corrupted_entry_non_hex(self, file_store: FileKeyStore) -> None:
        """条目密文不是合法 hex 时抛 KeyStoreError。"""
        doc = {"version": 1, "salt": "00" * 16, "entries": {"master": "zz-not-hex"}}
        file_store.path.parent.mkdir(parents=True, exist_ok=True)
        file_store.path.write_text(json.dumps(doc), encoding="utf-8")
        with pytest.raises(KeyStoreError, match="不是合法 hex"):
            file_store.load("master")

    def test_corrupted_salt_non_hex(self, file_store: FileKeyStore) -> None:
        """文件内 salt 不是合法 hex 时抛 KeyStoreError。"""
        doc = {"version": 1, "salt": "zz", "entries": {"master": "00" * 28}}
        file_store.path.parent.mkdir(parents=True, exist_ok=True)
        file_store.path.write_text(json.dumps(doc), encoding="utf-8")
        with pytest.raises(KeyStoreError, match="salt 不是合法 hex"):
            file_store.load("master")

    def test_entry_ciphertext_bound_to_key_id(
        self, file_store: FileKeyStore, random_key: bytes
    ) -> None:
        """条目密文被搬移到其他 key_id 下即解密失败（AAD 绑定防错配）。"""
        file_store.store("key-a", random_key)
        doc = json.loads(file_store.path.read_text(encoding="utf-8"))
        doc["entries"]["key-b"] = doc["entries"]["key-a"]
        file_store.path.write_text(json.dumps(doc), encoding="utf-8")
        with pytest.raises(KeyStoreError, match="口令错误或文件已损坏"):
            file_store.load("key-b")

    def test_missing_entry_in_existing_file(
        self, file_store: FileKeyStore, random_key: bytes
    ) -> None:
        """文件存在但条目缺失时 load 抛 KeyStoreError。"""
        file_store.store("other", random_key)
        with pytest.raises(KeyStoreError, match="不存在密钥"):
            file_store.load("master")

    def test_write_failure_wrapped_and_tmp_cleaned(
        self, file_store: FileKeyStore, monkeypatch: pytest.MonkeyPatch, random_key: bytes
    ) -> None:
        """os.replace 失败时包装为 KeyStoreError，且不残留临时文件。"""
        def _boom_replace(src: str, dst: str) -> None:
            raise OSError("模拟替换失败")

        monkeypatch.setattr(os, "replace", _boom_replace)
        with pytest.raises(KeyStoreError, match="写入失败"):
            file_store.store("master", random_key)
        assert list(file_store.path.parent.glob(".keystore-*.tmp")) == []

    def test_write_failure_with_unlink_failure_still_raises(
        self, file_store: FileKeyStore, monkeypatch: pytest.MonkeyPatch, random_key: bytes
    ) -> None:
        """替换与临时文件清理同时失败时仍抛 KeyStoreError（清理属尽力而为）。"""
        def _boom(*args: object) -> None:
            raise OSError("模拟文件系统失败")

        monkeypatch.setattr(os, "replace", _boom)
        monkeypatch.setattr(os, "unlink", _boom)
        with pytest.raises(KeyStoreError, match="写入失败"):
            file_store.store("master", random_key)
        monkeypatch.undo()
        for leftover in file_store.path.parent.glob(".keystore-*.tmp"):
            leftover.unlink()

    def test_chmod_failure_is_best_effort(
        self, file_store: FileKeyStore, monkeypatch: pytest.MonkeyPatch, random_key: bytes
    ) -> None:
        """chmod 收紧权限失败仅记日志，不影响 store 成功（尽力而为语义）。"""
        def _boom_chmod(path: str, mode: int) -> None:
            raise OSError("模拟 chmod 失败")

        monkeypatch.setattr(os, "chmod", _boom_chmod)
        file_store.store("master", random_key)
        assert file_store.load("master") == random_key

    def test_read_os_error_wrapped(
        self, file_store: FileKeyStore, monkeypatch: pytest.MonkeyPatch, random_key: bytes
    ) -> None:
        """文件读取 OSError 包装为 KeyStoreError。"""
        file_store.store("master", random_key)

        def _boom_read_text(self: Path, *args: object, **kwargs: object) -> str:
            raise OSError("模拟读取失败")

        monkeypatch.setattr(Path, "read_text", _boom_read_text)
        with pytest.raises(KeyStoreError, match="读取失败"):
            file_store.load("master")


@requires_keyring
class TestKeyringKeyStore:
    """KeyringKeyStore 真实后端全链路（本机可用时执行，finally 清理测试凭据）。"""

    def test_full_flow_with_cleanup(self, random_key: bytes) -> None:
        """store → exists → load → delete 全链路，finally 确保凭据清理。"""
        store = KeyringKeyStore()
        key_id = _unique_key_id()
        try:
            assert store.exists(key_id) is False
            store.store(key_id, random_key)
            assert store.exists(key_id) is True
            assert store.load(key_id) == random_key
            store.delete(key_id)
            assert store.exists(key_id) is False
        finally:
            store.delete(key_id)

    def test_16_byte_key(self, key_factory: Callable[[int], bytes]) -> None:
        """16 字节密钥同样可写入 / 读回系统密钥环。"""
        store = KeyringKeyStore()
        key_id = _unique_key_id()
        key = key_factory(16)
        try:
            store.store(key_id, key)
            assert store.load(key_id) == key
        finally:
            store.delete(key_id)

    def test_load_missing_raises(self) -> None:
        """读不存在的条目抛 KeyStoreError。"""
        with pytest.raises(KeyStoreError, match="不存在密钥"):
            KeyringKeyStore().load(_unique_key_id())

    def test_delete_idempotent(self, random_key: bytes) -> None:
        """delete 对不存在的条目幂等（覆盖真实后端的 PasswordDeleteError 路径）。"""
        store = KeyringKeyStore()
        key_id = _unique_key_id()
        store.delete(key_id)
        try:
            store.store(key_id, random_key)
            store.delete(key_id)
            store.delete(key_id)
        finally:
            store.delete(key_id)

    @pytest.mark.parametrize("bad_length", [0, 15, 17, 31, 33])
    def test_store_rejects_invalid_key_length(
        self, key_factory: Callable[[int], bytes], bad_length: int
    ) -> None:
        """非法长度密钥在 store 入口即被拒绝（不触碰密钥环）。"""
        with pytest.raises(KeyStoreError):
            KeyringKeyStore().store(_unique_key_id(), key_factory(bad_length))


class TestKeyringKeyStoreErrorWrapping:
    """KeyringKeyStore 底层异常统一收敛为 KeyStoreError（mock 后端，不依赖真实密钥环）。"""

    def test_store_backend_failure_wrapped(
        self, monkeypatch: pytest.MonkeyPatch, random_key: bytes
    ) -> None:
        """set_password 抛错时包装为 KeyStoreError。"""
        def _boom(*args: object) -> None:
            raise RuntimeError("模拟密钥环不可用")

        monkeypatch.setattr(keyring, "set_password", _boom)
        with pytest.raises(KeyStoreError, match="写入系统密钥环失败"):
            KeyringKeyStore().store("k", random_key)

    def test_load_backend_failure_wrapped(self, monkeypatch: pytest.MonkeyPatch) -> None:
        """get_password 抛错时包装为 KeyStoreError。"""
        def _boom(*args: object) -> None:
            raise RuntimeError("模拟密钥环不可用")

        monkeypatch.setattr(keyring, "get_password", _boom)
        with pytest.raises(KeyStoreError, match="从系统密钥环读取失败"):
            KeyringKeyStore().load("k")

    def test_load_non_hex_entry_wrapped(self, monkeypatch: pytest.MonkeyPatch) -> None:
        """条目内容不是合法 hex 时判定损坏并抛 KeyStoreError。"""
        monkeypatch.setattr(keyring, "get_password", lambda *args: "zz-not-hex")
        with pytest.raises(KeyStoreError, match="不是合法 hex"):
            KeyringKeyStore().load("k")

    def test_load_wrong_length_entry_wrapped(self, monkeypatch: pytest.MonkeyPatch) -> None:
        """条目 hex 解码后长度非法时判定损坏并抛 KeyStoreError。"""
        monkeypatch.setattr(keyring, "get_password", lambda *args: (b"\x00" * 8).hex())
        with pytest.raises(KeyStoreError, match="内容损坏"):
            KeyringKeyStore().load("k")

    def test_delete_backend_failure_wrapped(self, monkeypatch: pytest.MonkeyPatch) -> None:
        """delete_password 抛非 PasswordDeleteError 时包装为 KeyStoreError。"""
        def _boom(*args: object) -> None:
            raise RuntimeError("模拟密钥环不可用")

        monkeypatch.setattr(keyring, "delete_password", _boom)
        with pytest.raises(KeyStoreError, match="从系统密钥环删除失败"):
            KeyringKeyStore().delete("k")

    def test_delete_missing_entry_idempotent(self, monkeypatch: pytest.MonkeyPatch) -> None:
        """delete_password 抛 PasswordDeleteError 时视为幂等空操作。"""
        def _missing(*args: object) -> None:
            raise keyring.errors.PasswordDeleteError("条目不存在")

        monkeypatch.setattr(keyring, "delete_password", _missing)
        KeyringKeyStore().delete("k")

    def test_exists_backend_failure_is_false(self, monkeypatch: pytest.MonkeyPatch) -> None:
        """get_password 抛错时 exists 按 False 处理并记日志。"""
        def _boom(*args: object) -> None:
            raise RuntimeError("模拟密钥环不可用")

        monkeypatch.setattr(keyring, "get_password", _boom)
        assert KeyringKeyStore().exists("k") is False


@pytest.fixture()
def _preserve_keyring_cache() -> Iterator[None]:
    """保存并恢复 is_available 的进程级缓存，避免探测用例污染其他测试。"""
    saved = KeyringKeyStore._available_cache
    yield
    KeyringKeyStore._available_cache = saved


class TestKeyringAvailabilityProbe:
    """is_available 探测逻辑：异常与读回不符均判定不可用，结果被进程内缓存。"""

    def test_probe_exception_marks_unavailable(
        self, monkeypatch: pytest.MonkeyPatch, _preserve_keyring_cache: None
    ) -> None:
        """探测写入抛错时判定后端不可用。"""
        def _boom(*args: object) -> None:
            raise RuntimeError("模拟无桌面环境")

        monkeypatch.setattr(keyring, "set_password", _boom)
        KeyringKeyStore._available_cache = None
        assert KeyringKeyStore.is_available() is False

    def test_probe_readback_mismatch_marks_unavailable(
        self, monkeypatch: pytest.MonkeyPatch, _preserve_keyring_cache: None
    ) -> None:
        """探测读回值不符时判定后端不可用。"""
        monkeypatch.setattr(keyring, "set_password", lambda *args: None)
        monkeypatch.setattr(keyring, "get_password", lambda *args: "different")
        monkeypatch.setattr(keyring, "delete_password", lambda *args: None)
        KeyringKeyStore._available_cache = None
        assert KeyringKeyStore.is_available() is False

    def test_probe_success_marks_available(
        self, monkeypatch: pytest.MonkeyPatch, _preserve_keyring_cache: None
    ) -> None:
        """探测写 / 读 / 删全通过时判定可用，且结果被进程内缓存。"""
        monkeypatch.setattr(keyring, "set_password", lambda *args: None)
        monkeypatch.setattr(keyring, "get_password", lambda *args: "probe")
        monkeypatch.setattr(keyring, "delete_password", lambda *args: None)
        KeyringKeyStore._available_cache = None
        assert KeyringKeyStore.is_available() is True
        assert KeyringKeyStore._available_cache is True


class TestGetKeystoreFactory:
    """get_keystore 工厂的后端选择逻辑。"""

    def test_prefer_file_with_passphrase_returns_file_store(self, tmp_data_dir: Path) -> None:
        """prefer_keyring=False + 口令 → FileKeyStore，文件落在隔离目录。"""
        store = get_keystore(prefer_keyring=False, fallback_passphrase=TEST_PASSPHRASE)
        assert isinstance(store, FileKeyStore)
        assert store.path == tmp_data_dir / ".sync" / "keystore.enc"

    def test_prefer_file_without_passphrase_raises(self) -> None:
        """prefer_keyring=False 且无口令 → KeyStoreError。"""
        with pytest.raises(KeyStoreError, match="未提供降级口令"):
            get_keystore(prefer_keyring=False)

    def test_keyring_unavailable_falls_back_to_file(
        self, monkeypatch: pytest.MonkeyPatch, tmp_data_dir: Path
    ) -> None:
        """keyring 探测不可用 + 有口令 → 降级 FileKeyStore。"""
        monkeypatch.setattr(KeyringKeyStore, "is_available", classmethod(lambda cls: False))
        store = get_keystore(fallback_passphrase=TEST_PASSPHRASE)
        assert isinstance(store, FileKeyStore)

    def test_keyring_unavailable_without_passphrase_raises(
        self, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        """keyring 不可用且无口令 → KeyStoreError。"""
        monkeypatch.setattr(KeyringKeyStore, "is_available", classmethod(lambda cls: False))
        with pytest.raises(KeyStoreError, match="未提供降级口令"):
            get_keystore()

    def test_explicit_data_dir_passed_to_file_store(self, tmp_path: Path) -> None:
        """工厂透传 data_dir 给 FileKeyStore。"""
        store = get_keystore(
            prefer_keyring=False, fallback_passphrase=TEST_PASSPHRASE, data_dir=tmp_path
        )
        assert isinstance(store, FileKeyStore)
        assert store.path == tmp_path / ".sync" / "keystore.enc"

    @requires_keyring
    def test_keyring_available_returns_keyring_store(self) -> None:
        """keyring 可用时默认返回 KeyringKeyStore。"""
        assert isinstance(get_keystore(), KeyringKeyStore)

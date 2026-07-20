"""crypto.bootstrap 首次绑定与解锁流程测试 — 对应迭代计划 A2 验收矩阵。

落点说明（父任务允许自选 tests/sync 或 tests/crypto）：bootstrap 是 crypto
原语与 sync 配置基座的整合闭环，用例需同时使用 ``sync.config`` /
``sync.paths`` 与 tests/sync 的隔离 fixture，故放 tests/sync/；
``crypto/bootstrap.py`` 的覆盖率仍经 ``--cov=memory_engine.crypto`` 计入
crypto 包，不受影响。

安全红线（与 tests/crypto 同一考量）：bootstrap 使用固定 ``key_id``
（``"master"`` / ``"recovery"``），全部用例一律 mock keyring
（``force_file_keystore`` / ``fake_keyring``），绝不触碰真实系统密钥环。
"""

from __future__ import annotations

import logging
import os
import re
import subprocess
import sys
from pathlib import Path

import pytest

from memory_engine.crypto.bootstrap import (
    MASTER_KEY_ID,
    RECOVERY_KEY_ID,
    bootstrap_first_run,
    unlock,
    unlock_with_recovery,
)
from memory_engine.crypto.errors import (
    CryptoError,
    KeyDerivationError,
    KeyStoreError,
    RecoveryError,
)
from memory_engine.crypto.kdf import derive_master_key
from memory_engine.crypto.keystore import FileKeyStore, get_keystore
from memory_engine.crypto.recovery import from_recovery_code
from memory_engine.sync.config import load_config, save_config
from memory_engine.sync.errors import SyncConfigError
from memory_engine.sync.paths import config_path, keystore_path

TEST_PASSPHRASE = "bootstrap 测试口令-789"
WRONG_PASSPHRASE = "错误口令-000"


class TestFirstRunFileBackend:
    """FileKeyStore 降级后端（强制 keyring 不可用）下的首启流程。"""

    def test_full_chain_master_key_byte_identical(
        self, tmp_data_dir: Path, force_file_keystore: None
    ) -> None:
        """首启 → 解锁 → 恢复码重建全链路逐字节一致（A2 核心验收）。"""
        result = bootstrap_first_run(TEST_PASSPHRASE)

        # method + salt 已持久化至 .sync/config.json
        cfg = load_config()
        assert cfg.kdf_method == result.method
        salt = cfg.kdf_salt()
        assert salt is not None and len(salt) >= 16

        # 主密钥已托管，读回逐字节一致
        store = FileKeyStore(passphrase=TEST_PASSPHRASE)
        assert store.load(MASTER_KEY_ID) == result.master_key
        assert len(result.master_key) == 32

        # 恢复码 12 词；恢复码路径主密钥已托管且与恢复码逐字节对应
        assert len(result.recovery_words) == 12
        recovery_key = from_recovery_code(result.recovery_words)
        assert store.load(RECOVERY_KEY_ID) == recovery_key

        # 常规解锁：托管读回，逐字节一致
        unlocked = unlock(TEST_PASSPHRASE)
        assert unlocked.master_key == result.master_key
        assert unlocked.source == "keystore"

        # 恢复码重建：与恢复码逐字节一致，且重新托管成功
        recovered = unlock_with_recovery(
            result.recovery_words, fallback_passphrase=TEST_PASSPHRASE
        )
        assert recovered.master_key == recovery_key
        assert recovered.restored is True
        assert store.load(RECOVERY_KEY_ID) == recovered.master_key

        # 口令经持久化 method+salt 重派生，逐字节一致
        assert derive_master_key(TEST_PASSPHRASE, salt, result.method) == result.master_key

    def test_result_fields_and_file_locations(
        self, tmp_data_dir: Path, force_file_keystore: None
    ) -> None:
        result = bootstrap_first_run(TEST_PASSPHRASE)
        assert result.keystore_backend == "file"
        assert result.downgraded is False
        assert result.method == "argon2id"
        assert result.device_id == load_config().device_id
        assert keystore_path().is_file()
        assert config_path().is_file()

    def test_downgrade_path_persists_pbkdf2(
        self, tmp_data_dir: Path, force_file_keystore: None
    ) -> None:
        """假时钟触发 Argon2id 超时 → 自动降级 PBKDF2 且 method 持久化。"""
        ticks = iter([0.0, 99.0])  # 探测耗时 99 秒 → 超过 3 秒阈值
        result = bootstrap_first_run(TEST_PASSPHRASE, clock=lambda: next(ticks))
        assert result.downgraded is True
        assert result.method == "pbkdf2"
        assert load_config().kdf_method == "pbkdf2"

        # 删除托管条目后，口令沿持久化的 pbkdf2 方法重派生，逐字节一致
        FileKeyStore(passphrase=TEST_PASSPHRASE).delete(MASTER_KEY_ID)
        unlocked = unlock(TEST_PASSPHRASE)
        assert unlocked.source == "passphrase"
        assert unlocked.master_key == result.master_key

    def test_double_bootstrap_blocked_by_config(
        self, tmp_data_dir: Path, force_file_keystore: None
    ) -> None:
        bootstrap_first_run(TEST_PASSPHRASE)
        with pytest.raises(CryptoError, match="已完成首次绑定"):
            bootstrap_first_run(TEST_PASSPHRASE)

    def test_double_bootstrap_blocked_by_keystore_entry(
        self, tmp_data_dir: Path, force_file_keystore: None
    ) -> None:
        """配置被抹掉 KDF 参数但托管条目仍在 → 仍被托管防护拦截。"""
        bootstrap_first_run(TEST_PASSPHRASE)
        cfg = load_config()
        cfg.kdf_method = None
        cfg.kdf_salt_hex = None
        save_config(cfg)
        with pytest.raises(CryptoError, match="已存在主密钥"):
            bootstrap_first_run(TEST_PASSPHRASE)


class TestUnlockFileBackend:
    """FileKeyStore 降级后端下的常规解锁矩阵。"""

    def test_unlock_rederives_when_entry_deleted(
        self, tmp_data_dir: Path, force_file_keystore: None
    ) -> None:
        result = bootstrap_first_run(TEST_PASSPHRASE)
        FileKeyStore(passphrase=TEST_PASSPHRASE).delete(MASTER_KEY_ID)

        unlocked = unlock(TEST_PASSPHRASE)
        assert unlocked.source == "passphrase"
        assert unlocked.master_key == result.master_key  # 逐字节一致
        # 已重新托管：再次解锁走 keystore 读回
        assert unlock(TEST_PASSPHRASE).source == "keystore"

    def test_unlock_rederives_when_keystore_file_missing(
        self, tmp_data_dir: Path, force_file_keystore: None
    ) -> None:
        """keystore.enc 整个丢失（模拟换机 / 托管损坏删除）→ 口令重派生。"""
        result = bootstrap_first_run(TEST_PASSPHRASE)
        keystore_path().unlink()

        unlocked = unlock(TEST_PASSPHRASE)
        assert unlocked.source == "passphrase"
        assert unlocked.master_key == result.master_key

    def test_unlock_without_passphrase_raises(
        self, tmp_data_dir: Path, force_file_keystore: None
    ) -> None:
        """keyring 不可用且未提供口令 → 工厂层拒绝（沿用 keystore 既定错误）。"""
        with pytest.raises(KeyStoreError, match="未提供降级口令"):
            unlock()

    def test_unlock_without_first_run_raises(
        self, tmp_data_dir: Path, force_file_keystore: None
    ) -> None:
        """无配置无托管 → 口令重派生缺少持久化参数，显式失败。"""
        with pytest.raises(KeyStoreError, match="尚未完成首次绑定"):
            unlock(TEST_PASSPHRASE)

    def test_unlock_with_corrupted_config_raises(
        self, tmp_data_dir: Path, force_file_keystore: None
    ) -> None:
        bootstrap_first_run(TEST_PASSPHRASE)
        FileKeyStore(passphrase=TEST_PASSPHRASE).delete(MASTER_KEY_ID)
        config_path().write_text("这不是 JSON", encoding="utf-8")
        with pytest.raises(SyncConfigError):
            unlock(TEST_PASSPHRASE)

    def test_unlock_with_corrupted_keystore_file_raises(
        self, tmp_data_dir: Path, force_file_keystore: None
    ) -> None:
        """keystore.enc 损坏 → 显式失败，绝不静默重派生覆盖。"""
        bootstrap_first_run(TEST_PASSPHRASE)
        keystore_path().write_text("这不是 JSON {{{", encoding="utf-8")
        with pytest.raises(KeyStoreError, match="JSON 解析失败"):
            unlock(TEST_PASSPHRASE)

    def test_unlock_wrong_passphrase_never_rederives(
        self, tmp_data_dir: Path, force_file_keystore: None
    ) -> None:
        """条目存在但口令错误 → 原异常传播，绝不静默重派生（防错误密钥覆盖托管）。"""
        result = bootstrap_first_run(TEST_PASSPHRASE)
        with pytest.raises(KeyStoreError, match="口令错误或文件已损坏"):
            unlock(WRONG_PASSPHRASE)
        # 托管未被篡改：正确口令仍可逐字节读回
        assert unlock(TEST_PASSPHRASE).master_key == result.master_key


class TestKeyringBackend:
    """KeyringKeyStore 后端（dict 假密钥环）下的流程。"""

    def test_empty_passphrase_rejected(
        self, tmp_data_dir: Path, fake_keyring: dict[tuple[str, str], str]
    ) -> None:
        with pytest.raises(KeyDerivationError, match="口令不能为空"):
            bootstrap_first_run("")

    def test_full_chain_on_keyring(
        self, tmp_data_dir: Path, fake_keyring: dict[tuple[str, str], str]
    ) -> None:
        result = bootstrap_first_run(TEST_PASSPHRASE)
        assert result.keystore_backend == "keyring"

        # 系统密钥环免密读回（无需口令）
        unlocked = unlock()
        assert unlocked.source == "keystore"
        assert unlocked.master_key == result.master_key
        assert unlocked.keystore_backend == "keyring"

        # 恢复码重建免密重新托管
        recovered = unlock_with_recovery(result.recovery_words)
        assert recovered.keystore_backend == "keyring"
        assert recovered.master_key == from_recovery_code(result.recovery_words)

        # 假密钥环中两个条目均已写入（hex 编码）
        assert ("remember-me", MASTER_KEY_ID) in fake_keyring
        assert ("remember-me", RECOVERY_KEY_ID) in fake_keyring

    def test_unlock_rederives_on_keyring_when_entry_missing(
        self, tmp_data_dir: Path, fake_keyring: dict[tuple[str, str], str]
    ) -> None:
        result = bootstrap_first_run(TEST_PASSPHRASE)
        get_keystore().delete(MASTER_KEY_ID)

        unlocked = unlock(TEST_PASSPHRASE)
        assert unlocked.source == "passphrase"
        assert unlocked.master_key == result.master_key
        assert unlocked.keystore_backend == "keyring"

    def test_unlock_missing_entry_without_passphrase_raises(
        self, tmp_data_dir: Path, fake_keyring: dict[tuple[str, str], str]
    ) -> None:
        with pytest.raises(KeyStoreError, match="未提供口令"):
            unlock()

    def test_recovery_rejects_invalid_words(
        self, tmp_data_dir: Path, fake_keyring: dict[tuple[str, str], str]
    ) -> None:
        with pytest.raises(RecoveryError, match="恢复码应由 12 个单词组成"):
            unlock_with_recovery(["abandon"] * 11)


class TestRecoveryFlow:
    """恢复码重建专项。"""

    def test_recovery_requires_fallback_passphrase_on_file_backend(
        self, tmp_data_dir: Path, force_file_keystore: None
    ) -> None:
        """BIP39 官方向量（全零熵）恢复码合法，但 FileKeyStore 需降级口令。"""
        words = ["abandon"] * 11 + ["about"]
        with pytest.raises(KeyStoreError, match="未提供降级口令"):
            unlock_with_recovery(words)

    def test_recovery_official_vector_round_trip(
        self, tmp_data_dir: Path, force_file_keystore: None
    ) -> None:
        """官方向量重建 → 重新托管 → 再次重建逐字节一致。"""
        words = ["abandon"] * 11 + ["about"]
        expected = from_recovery_code(words)
        first = unlock_with_recovery(words, fallback_passphrase=TEST_PASSPHRASE)
        assert first.master_key == expected == b"\x00" * 16
        second = unlock_with_recovery(words, fallback_passphrase=TEST_PASSPHRASE)
        assert second.master_key == first.master_key
        assert FileKeyStore(passphrase=TEST_PASSPHRASE).load(RECOVERY_KEY_ID) == expected


class TestCrossProcessRederivation:
    """method+salt 持久化后跨进程重派生逐字节一致（A2 验收，子进程实证）。"""

    def test_subprocess_rederives_identical_master_key(
        self, tmp_data_dir: Path, force_file_keystore: None
    ) -> None:
        result = bootstrap_first_run(TEST_PASSPHRASE)
        code = (
            "import os;"
            "from memory_engine.sync.config import load_config;"
            "from memory_engine.crypto.kdf import derive_master_key;"
            "cfg = load_config();"
            "key = derive_master_key(os.environ['RM_PP'], cfg.kdf_salt(), cfg.kdf_method);"
            "print('MK=' + key.hex())"
        )
        env = dict(
            os.environ,
            REMEMBER_ME_DATA_DIR=str(tmp_data_dir),
            RM_PP=TEST_PASSPHRASE,
            PYTHONIOENCODING="utf-8",
        )
        proc = subprocess.run(
            [sys.executable, "-c", code],
            capture_output=True,
            env=env,
            check=True,
            timeout=180,
        )
        assert f"MK={result.master_key.hex()}" in proc.stdout.decode("utf-8")


class TestLogAndDiskRedLine:
    """恢复码 / 主密钥零日志、零落盘（A2 红线，caplog + 磁盘扫描断言）。"""

    def test_no_secret_material_in_logs(
        self,
        tmp_data_dir: Path,
        force_file_keystore: None,
        caplog: pytest.LogCaptureFixture,
    ) -> None:
        with caplog.at_level(logging.DEBUG):
            result = bootstrap_first_run(TEST_PASSPHRASE)
            unlock(TEST_PASSPHRASE)
            unlock_with_recovery(result.recovery_words, fallback_passphrase=TEST_PASSPHRASE)

        recovery_key = from_recovery_code(result.recovery_words)
        for record in caplog.records:
            msg = record.getMessage()
            # 主密钥 / 恢复码密钥的任何 hex 形态绝不出现在日志
            assert result.master_key.hex() not in msg
            assert recovery_key.hex() not in msg
            # 恢复码完整短语绝不出现；单条日志命中 ≥3 个恢复码单词即判泄露
            # （单词级逐一断言会误伤 key_id='master' 等合法日志——BIP39 词表
            # 含常见英文单词，故以 3 词共现为阈值，泄露整句必然触发）
            hits = sum(1 for w in result.recovery_words if re.search(rf"\b{w}\b", msg))
            assert hits < 3, f"日志疑似泄露恢复码片段：{msg!r}"

    def test_no_secret_material_on_disk(
        self, tmp_data_dir: Path, force_file_keystore: None
    ) -> None:
        result = bootstrap_first_run(TEST_PASSPHRASE)
        recovery_key = from_recovery_code(result.recovery_words)
        phrase = " ".join(result.recovery_words).encode("utf-8")
        word_pair = " ".join(result.recovery_words[:2]).encode("utf-8")

        blobs = [f.read_bytes() for f in tmp_data_dir.rglob("*") if f.is_file()]
        assert blobs, "首启后应已落盘 config 与 keystore"
        for blob in blobs:
            assert phrase not in blob
            assert word_pair not in blob
            assert result.master_key not in blob
            assert result.master_key.hex().encode("ascii") not in blob
            assert recovery_key not in blob
            assert recovery_key.hex().encode("ascii") not in blob

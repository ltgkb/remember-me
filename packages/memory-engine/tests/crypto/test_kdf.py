"""KDF 双路径与 HKDF 子密钥派生测试 — 对应迭代计划 C1 第 4 项。

覆盖：确定性（同输入同输出）、双路径互不相同、输入校验、注入假时钟
确定性触发 >3s 慢派生降级、底层库错误统一包装、HKDF 子密钥域分离。
"""

from __future__ import annotations

import logging
from collections.abc import Iterator

import pytest
from argon2.exceptions import Argon2Error

from memory_engine.crypto import kdf
from memory_engine.crypto.errors import KeyDerivationError
from memory_engine.crypto.kdf import (
    AutoKdfResult,
    derive_master_key,
    derive_master_key_auto,
    derive_subkeys,
    generate_salt,
)

PASSPHRASE = "测试口令-correct-horse-battery-staple"
"""测试用固定口令：确定性用例要求同输入可复现。"""

FIXED_SALT = bytes(range(16))
"""测试用固定 salt（16 字节）：确定性用例的另一半输入。"""


class FakeClock:
    """按脚本依次返回固定读数的假时钟，用于确定性触发慢派生降级路径。"""

    def __init__(self, readings: list[float]) -> None:
        self._readings: Iterator[float] = iter(readings)

    def __call__(self) -> float:
        return next(self._readings)


@pytest.fixture(scope="module")
def reference_keys() -> dict[str, bytes]:
    """模块级基准：同一口令 + salt 双路径各派生一次，供多个用例比对复用。"""
    return {
        "argon2id": derive_master_key(PASSPHRASE, FIXED_SALT, method="argon2id"),
        "pbkdf2": derive_master_key(PASSPHRASE, FIXED_SALT, method="pbkdf2"),
    }


class TestGenerateSalt:
    """generate_salt 的输出契约。"""

    def test_length_is_16_bytes(self) -> None:
        """生成的 salt 恒为 16 字节（128 bit）。"""
        assert len(generate_salt()) == kdf.SALT_LENGTH == 16

    def test_two_calls_produce_different_salts(self) -> None:
        """两次生成的 salt 不同（密码学随机性）。"""
        assert generate_salt() != generate_salt()


class TestDeriveMasterKey:
    """derive_master_key 双路径确定性、输入校验与慢派生告警。"""

    def test_argon2id_deterministic(self, reference_keys: dict[str, bytes]) -> None:
        """同口令同 salt 重复走 Argon2id 路径，输出逐字节一致。"""
        again = derive_master_key(PASSPHRASE, FIXED_SALT, method="argon2id")
        assert again == reference_keys["argon2id"]

    def test_pbkdf2_deterministic(self, reference_keys: dict[str, bytes]) -> None:
        """同口令同 salt 重复走 PBKDF2 路径，输出逐字节一致。"""
        again = derive_master_key(PASSPHRASE, FIXED_SALT, method="pbkdf2")
        assert again == reference_keys["pbkdf2"]

    def test_key_length_is_32_bytes(self, reference_keys: dict[str, bytes]) -> None:
        """双路径输出均为 32 字节（256 bit）主密钥。"""
        assert len(reference_keys["argon2id"]) == kdf.MASTER_KEY_LENGTH == 32
        assert len(reference_keys["pbkdf2"]) == kdf.MASTER_KEY_LENGTH == 32

    def test_dual_paths_differ(self, reference_keys: dict[str, bytes]) -> None:
        """同输入下 Argon2id 与 PBKDF2 两路径产出互不相同。"""
        assert reference_keys["argon2id"] != reference_keys["pbkdf2"]

    def test_default_method_is_argon2id(self, reference_keys: dict[str, bytes]) -> None:
        """缺省 method 与显式 argon2id 结果一致。"""
        assert derive_master_key(PASSPHRASE, FIXED_SALT) == reference_keys["argon2id"]

    @pytest.mark.parametrize("bad_salt", [b"", b"\x00" * 8, b"\x00" * 15])
    def test_short_salt_rejected(self, bad_salt: bytes) -> None:
        """salt 不足 16 字节时抛 KeyDerivationError。"""
        with pytest.raises(KeyDerivationError, match="salt 长度不足"):
            derive_master_key(PASSPHRASE, bad_salt)

    def test_empty_passphrase_rejected(self) -> None:
        """空口令直接拒绝，抛 KeyDerivationError。"""
        with pytest.raises(KeyDerivationError, match="口令不能为空"):
            derive_master_key("", FIXED_SALT)

    def test_unknown_method_rejected(self) -> None:
        """未知派生方法抛 KeyDerivationError。"""
        with pytest.raises(KeyDerivationError, match="未知的 KDF 方法"):
            derive_master_key(PASSPHRASE, FIXED_SALT, method="scrypt")

    def test_slow_argon2id_still_returns_argon2id_result(
        self, reference_keys: dict[str, bytes], caplog: pytest.LogCaptureFixture
    ) -> None:
        """假时钟模拟 >3s 慢派生：仍返回 Argon2id 结果，仅记录 WARNING 告警。"""
        clock = FakeClock([0.0, 4.0])
        with caplog.at_level(logging.WARNING, logger="memory_engine.crypto.kdf"):
            key = derive_master_key(PASSPHRASE, FIXED_SALT, method="argon2id", clock=clock)
        assert key == reference_keys["argon2id"]
        warnings = [r for r in caplog.records if r.levelno >= logging.WARNING]
        assert any("超过阈值" in r.getMessage() for r in warnings)


class TestDeriveMasterKeyAuto:
    """derive_master_key_auto 的探测式自动选择与降级逻辑。"""

    def test_fast_probe_keeps_argon2id(self, reference_keys: dict[str, bytes]) -> None:
        """探测耗时低于阈值时不降级：method=argon2id 且 key 与纯 Argon2id 一致。"""
        result = derive_master_key_auto(PASSPHRASE, FIXED_SALT, clock=FakeClock([0.0, 0.5]))
        assert isinstance(result, AutoKdfResult)
        assert result.method == "argon2id"
        assert result.downgraded is False
        assert result.elapsed_seconds == 0.5
        assert result.key == reference_keys["argon2id"]

    def test_boundary_exactly_at_threshold_no_downgrade(
        self, reference_keys: dict[str, bytes]
    ) -> None:
        """耗时恰好等于 3s 阈值时不触发降级（判定为严格大于）。"""
        result = derive_master_key_auto(PASSPHRASE, FIXED_SALT, clock=FakeClock([0.0, 3.0]))
        assert result.method == "argon2id"
        assert result.downgraded is False
        assert result.elapsed_seconds == 3.0
        assert result.key == reference_keys["argon2id"]

    def test_slow_probe_downgrades_to_pbkdf2(
        self, reference_keys: dict[str, bytes], caplog: pytest.LogCaptureFixture
    ) -> None:
        """假时钟（0 → 4.0）确定性触发 >3s 降级：key 与纯 PBKDF2 逐字节一致。"""
        with caplog.at_level(logging.WARNING, logger="memory_engine.crypto.kdf"):
            result = derive_master_key_auto(PASSPHRASE, FIXED_SALT, clock=FakeClock([0.0, 4.0]))
        assert result.method == "pbkdf2"
        assert result.downgraded is True
        assert result.elapsed_seconds == 4.0
        assert result.key == reference_keys["pbkdf2"]
        assert any("自动降级" in r.getMessage() for r in caplog.records)

    def test_input_validation(self) -> None:
        """空口令与短 salt 在 auto 入口同样被拒绝。"""
        with pytest.raises(KeyDerivationError):
            derive_master_key_auto("", FIXED_SALT)
        with pytest.raises(KeyDerivationError):
            derive_master_key_auto(PASSPHRASE, b"\x00" * 8)


class TestBackendFailureWrapping:
    """底层库失败统一包装为 KeyDerivationError，绝不穿透第三方异常类型。"""

    def test_argon2id_backend_error_wrapped(self, monkeypatch: pytest.MonkeyPatch) -> None:
        """argon2-cffi 抛 Argon2Error 时包装为 KeyDerivationError。"""

        def _boom(**kwargs: object) -> bytes:
            raise Argon2Error("模拟底层失败")

        monkeypatch.setattr(kdf, "hash_secret_raw", _boom)
        with pytest.raises(KeyDerivationError, match="Argon2id 主密钥派生失败"):
            derive_master_key(PASSPHRASE, FIXED_SALT, method="argon2id")

    def test_pbkdf2_backend_error_wrapped(self, monkeypatch: pytest.MonkeyPatch) -> None:
        """cryptography PBKDF2 派生抛错时包装为 KeyDerivationError。"""

        class _BoomKdf:
            def __init__(self, **kwargs: object) -> None:
                pass

            def derive(self, key_material: bytes) -> bytes:
                raise RuntimeError("模拟底层失败")

        monkeypatch.setattr(kdf, "PBKDF2HMAC", _BoomKdf)
        with pytest.raises(KeyDerivationError, match="PBKDF2 主密钥派生失败"):
            derive_master_key(PASSPHRASE, FIXED_SALT, method="pbkdf2")


class TestDeriveSubkeys:
    """HKDF 子密钥派生的确定性、长度契约与域分离。"""

    MASTER_KEY = bytes(range(32))
    """固定主密钥：子密钥派生确定性用例输入。"""

    def test_deterministic(self) -> None:
        """同一主密钥两次派生得到完全相同的 DEK 与 MK。"""
        first = derive_subkeys(self.MASTER_KEY)
        second = derive_subkeys(self.MASTER_KEY)
        assert first == second
        assert first.dek == second.dek
        assert first.mk == second.mk

    def test_output_lengths(self) -> None:
        """DEK 与 MK 均为 32 字节。"""
        subkeys = derive_subkeys(self.MASTER_KEY)
        assert len(subkeys.dek) == 32
        assert len(subkeys.mk) == 32

    def test_domain_separation(self) -> None:
        """DEK 与 MK 因 HKDF info 域分离而互不相同。"""
        subkeys = derive_subkeys(self.MASTER_KEY)
        assert subkeys.dek != subkeys.mk

    def test_different_master_keys_give_different_subkeys(self) -> None:
        """不同主密钥派生出不同子密钥。"""
        assert derive_subkeys(self.MASTER_KEY) != derive_subkeys(b"\xff" * 32)

    @pytest.mark.parametrize("bad_length", [0, 16, 31, 33, 64])
    def test_wrong_master_key_length_rejected(self, bad_length: int) -> None:
        """主密钥非 32 字节时抛 KeyDerivationError。"""
        with pytest.raises(KeyDerivationError, match="主密钥长度必须为"):
            derive_subkeys(b"\x00" * bad_length)

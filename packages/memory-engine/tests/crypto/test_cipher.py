"""AES-256-GCM 加解密测试 — 对应迭代计划 C1 第 1/2/3 项。

覆盖：round-trip（含空输入与 1MB 大输入边界）、篡改检测（1 bit 翻转 /
AAD 改动 / 截断）、IV 随机性、密钥长度校验。篡改场景一律断言
CipherError 且 ``__cause__`` 为 InvalidTag（认证失败语义不丢）。
"""

from __future__ import annotations

import os
from collections.abc import Callable

import pytest
from cryptography.exceptions import InvalidTag

from memory_engine.crypto.cipher import (
    IV_LENGTH,
    MIN_CIPHERTEXT_LENGTH,
    TAG_LENGTH,
    decrypt_file,
    encrypt_file,
)
from memory_engine.crypto.errors import CipherError

FILEPATH = "profile.json"
"""测试用文件相对路径（参与 AAD 计算）。"""

VERSION = 1
"""测试用文件版本号（参与 AAD 计算）。"""


def flip_bit(data: bytes, byte_index: int) -> bytes:
    """将 data 第 byte_index 个字节的最低位翻转，模拟 1 bit 篡改。"""
    buffer = bytearray(data)
    buffer[byte_index] ^= 0x01
    return bytes(buffer)


class TestRoundTrip:
    """encrypt_file → decrypt_file 还原明文（计划 C1 第 1 项）。"""

    @pytest.mark.parametrize(
        "plaintext",
        [
            pytest.param(b"", id="empty"),
            pytest.param(b"hello remember-me", id="short-ascii"),
            pytest.param("你好，世界。Remember Me 中文混排。".encode(), id="utf8-chinese"),
            pytest.param(bytes(range(256)), id="all-byte-values"),
            pytest.param(os.urandom(1024 * 1024), id="1mb-random"),
        ],
    )
    def test_round_trip_restores_plaintext(self, random_key: bytes, plaintext: bytes) -> None:
        """加密后再解密，逐字节还原明文（含空输入与 1MB 大输入边界）。"""
        ciphertext = encrypt_file(plaintext, random_key, FILEPATH, VERSION)
        assert decrypt_file(ciphertext, random_key, FILEPATH, VERSION) == plaintext

    def test_ciphertext_layout(self, random_key: bytes) -> None:
        """密文布局为 IV(12B) || ciphertext || tag(16B)，总长 = 明文 + 28。"""
        plaintext = b"layout-check"
        ciphertext = encrypt_file(plaintext, random_key, FILEPATH, VERSION)
        assert len(ciphertext) == IV_LENGTH + len(plaintext) + TAG_LENGTH
        assert len(ciphertext[:IV_LENGTH]) == 12
        assert len(ciphertext[-TAG_LENGTH:]) == 16

    def test_empty_plaintext_ciphertext_min_length(self, random_key: bytes) -> None:
        """空明文密文长度恰为最小合法长度 28 字节（IV + tag）。"""
        ciphertext = encrypt_file(b"", random_key, FILEPATH, VERSION)
        assert len(ciphertext) == MIN_CIPHERTEXT_LENGTH == 28


class TestTamperDetection:
    """篡改检测：任何改动必抛 CipherError，绝不返回部分明文（计划 C1 第 2 项）。"""

    PLAINTEXT = b"tamper-detection-target"
    """篡改用例的固定明文。"""

    @pytest.mark.parametrize(
        "position",
        [
            pytest.param(0, id="iv-first-byte"),
            pytest.param(11, id="iv-last-byte"),
            pytest.param(12, id="ciphertext-first-byte"),
            pytest.param(-1, id="tag-last-byte"),
        ],
    )
    def test_single_bit_flip_raises_cipher_error(
        self, random_key: bytes, position: int
    ) -> None:
        """密文任意区域（IV / 密文体 / tag）翻转 1 bit，解密必抛 CipherError。"""
        ciphertext = encrypt_file(self.PLAINTEXT, random_key, FILEPATH, VERSION)
        tampered = flip_bit(ciphertext, position)
        with pytest.raises(CipherError) as exc_info:
            decrypt_file(tampered, random_key, FILEPATH, VERSION)
        assert isinstance(exc_info.value.__cause__, InvalidTag)

    def test_tampered_filepath_aad_raises(self, random_key: bytes) -> None:
        """AAD 中 filepath 改动（密文搬运到其他路径）解密必失败。"""
        ciphertext = encrypt_file(self.PLAINTEXT, random_key, FILEPATH, VERSION)
        with pytest.raises(CipherError) as exc_info:
            decrypt_file(ciphertext, random_key, "other/path.json", VERSION)
        assert isinstance(exc_info.value.__cause__, InvalidTag)

    def test_tampered_version_aad_raises(self, random_key: bytes) -> None:
        """AAD 中 version 改动（回滚到旧版本的重放攻击）解密必失败。"""
        ciphertext = encrypt_file(self.PLAINTEXT, random_key, FILEPATH, VERSION)
        with pytest.raises(CipherError) as exc_info:
            decrypt_file(ciphertext, random_key, FILEPATH, VERSION + 1)
        assert isinstance(exc_info.value.__cause__, InvalidTag)

    @pytest.mark.parametrize("bad_length", [0, 1, 12, 27])
    def test_truncated_ciphertext_raises(self, random_key: bytes, bad_length: int) -> None:
        """截断密文（< 28B 最小长度）解密必抛 CipherError，不触碰 AESGCM。"""
        ciphertext = encrypt_file(self.PLAINTEXT, random_key, FILEPATH, VERSION)
        with pytest.raises(CipherError, match="密文长度不足"):
            decrypt_file(ciphertext[:bad_length], random_key, FILEPATH, VERSION)

    def test_min_length_but_tampered_raises(self, random_key: bytes) -> None:
        """长度恰为 28B 但 tag 被篡改：越过长度检查，由 GCM 认证拦截。"""
        ciphertext = encrypt_file(b"", random_key, FILEPATH, VERSION)
        tampered = flip_bit(ciphertext, -1)
        assert len(tampered) == MIN_CIPHERTEXT_LENGTH
        with pytest.raises(CipherError) as exc_info:
            decrypt_file(tampered, random_key, FILEPATH, VERSION)
        assert isinstance(exc_info.value.__cause__, InvalidTag)

    def test_wrong_key_raises(
        self, random_key: bytes, key_factory: Callable[[int], bytes]
    ) -> None:
        """用另一枚合法长度的错误密钥解密必抛 CipherError。"""
        ciphertext = encrypt_file(self.PLAINTEXT, random_key, FILEPATH, VERSION)
        with pytest.raises(CipherError) as exc_info:
            decrypt_file(ciphertext, key_factory(32), FILEPATH, VERSION)
        assert isinstance(exc_info.value.__cause__, InvalidTag)


class TestKeyValidation:
    """密钥长度校验：非 32 字节一律抛 CipherError。"""

    @pytest.mark.parametrize("bad_length", [0, 16, 31, 33, 64])
    def test_encrypt_rejects_bad_key_length(
        self, key_factory: Callable[[int], bytes], bad_length: int
    ) -> None:
        """encrypt_file 拒绝非 32 字节密钥。"""
        with pytest.raises(CipherError, match="密钥长度必须为"):
            encrypt_file(b"x", key_factory(bad_length), FILEPATH, VERSION)

    @pytest.mark.parametrize("bad_length", [0, 16, 31, 33, 64])
    def test_decrypt_rejects_bad_key_length(
        self, key_factory: Callable[[int], bytes], bad_length: int
    ) -> None:
        """decrypt_file 拒绝非 32 字节密钥。"""
        with pytest.raises(CipherError, match="密钥长度必须为"):
            decrypt_file(b"\x00" * MIN_CIPHERTEXT_LENGTH, key_factory(bad_length), FILEPATH, 1)


class TestIvRandomness:
    """IV 随机性：同明文同密钥两次加密，IV 与整体密文均不同（计划 C1 第 3 项）。"""

    def test_same_input_produces_different_iv_and_ciphertext(self, random_key: bytes) -> None:
        """两次加密的前 12 字节 IV 不同，整体密文也不同。"""
        plaintext = b"same plaintext for iv randomness"
        first = encrypt_file(plaintext, random_key, FILEPATH, VERSION)
        second = encrypt_file(plaintext, random_key, FILEPATH, VERSION)
        assert first[:IV_LENGTH] != second[:IV_LENGTH]
        assert first != second

    def test_both_ciphertexts_still_decrypt(self, random_key: bytes) -> None:
        """两份随机 IV 密文各自都能正确解密回同一明文。"""
        plaintext = b"decryptable despite random iv"
        for _ in range(2):
            ciphertext = encrypt_file(plaintext, random_key, FILEPATH, VERSION)
            assert decrypt_file(ciphertext, random_key, FILEPATH, VERSION) == plaintext

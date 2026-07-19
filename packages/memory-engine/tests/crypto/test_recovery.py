"""BIP39 恢复码测试 — 对应迭代计划 C1 第 6 项。

覆盖：生成 / 重建一致性（多轮随机 + 官方测试向量）、非法恢复码拒绝
（11/13 词、词表外词、空词、校验位错）、大小写与多余空白归一化、
to_recovery_code 非 16 字节熵拒绝。
"""

from __future__ import annotations

import pytest

from memory_engine.crypto.errors import (
    CipherError,
    CryptoError,
    KeyDerivationError,
    KeyStoreError,
    RecoveryError,
)
from memory_engine.crypto.recovery import (
    ENTROPY_BYTES,
    RECOVERY_WORD_COUNT,
    from_recovery_code,
    generate_master_key,
    generate_recovery,
    to_recovery_code,
)

ZERO_ENTROPY_WORDS = ["abandon"] * 11 + ["about"]
"""BIP39 官方测试向量：16 字节全零熵对应的 12 个助记词。"""

REVERSED_ZERO_ENTROPY_WORDS = ["about"] + ["abandon"] * 11
"""词序颠倒的全零熵向量（已实测校验位非法，作确定性反例，零 flaky）。"""


class TestGenerateMasterKey:
    """恢复码路径主密钥生成。"""

    def test_length_is_16_bytes(self) -> None:
        """主密钥熵恒为 16 字节（128 bit）。"""
        assert len(generate_master_key()) == ENTROPY_BYTES == 16

    def test_two_calls_produce_different_keys(self) -> None:
        """两次生成的主密钥不同（密码学随机性）。"""
        assert generate_master_key() != generate_master_key()


class TestRoundTrip:
    """生成 → 编码 → 重建一致性（验收硬指标：主密钥逐字节相等）。"""

    def test_multiple_random_rounds(self) -> None:
        """多轮随机生成-重建，主密钥逐字节一致。"""
        for _ in range(10):
            master_key = generate_master_key()
            words = to_recovery_code(master_key)
            assert len(words) == RECOVERY_WORD_COUNT == 12
            assert from_recovery_code(words) == master_key

    def test_generate_recovery_one_step(self) -> None:
        """generate_recovery 一步产出后可直接重建回原主密钥。"""
        master_key, words = generate_recovery()
        assert len(master_key) == 16
        assert len(words) == 12
        assert from_recovery_code(words) == master_key

    def test_known_bip39_vector(self) -> None:
        """全零熵编码结果与 BIP39 官方测试向量一致（abandon×11 + about）。"""
        words = to_recovery_code(bytes(16))
        assert words == ZERO_ENTROPY_WORDS
        assert from_recovery_code(words) == bytes(16)

    def test_words_are_lowercase_ascii(self) -> None:
        """生成的助记词均为小写 ASCII 英文单词，不含空白。"""
        _, words = generate_recovery()
        for word in words:
            assert word.isascii()
            assert word == word.lower()
            assert " " not in word


class TestToRecoveryCodeValidation:
    """to_recovery_code 的熵长度校验。"""

    @pytest.mark.parametrize("bad_length", [0, 8, 15, 17, 31, 32, 64])
    def test_non_16_byte_entropy_rejected(self, bad_length: int) -> None:
        """非 16 字节熵一律抛 RecoveryError。"""
        with pytest.raises(RecoveryError, match="128 bit"):
            to_recovery_code(bytes(bad_length))


class TestFromRecoveryCodeRejection:
    """非法恢复码拒绝：词数、词表、校验位三层校验。"""

    def test_eleven_words_rejected(self) -> None:
        """11 词（缺一词）抛 RecoveryError。"""
        with pytest.raises(RecoveryError, match="12 个单词"):
            from_recovery_code(ZERO_ENTROPY_WORDS[:11])

    def test_thirteen_words_rejected(self) -> None:
        """13 词（多一词）抛 RecoveryError。"""
        with pytest.raises(RecoveryError, match="12 个单词"):
            from_recovery_code(ZERO_ENTROPY_WORDS + ["abandon"])

    def test_empty_sequence_rejected(self) -> None:
        """空词表输入抛 RecoveryError。"""
        with pytest.raises(RecoveryError):
            from_recovery_code([])

    def test_out_of_vocabulary_word_rejected(self) -> None:
        """词表外单词（如拼写错误）抛 RecoveryError 并提示非法词。"""
        words = ZERO_ENTROPY_WORDS.copy()
        words[3] = "notaword"
        with pytest.raises(RecoveryError, match="非法单词"):
            from_recovery_code(words)

    def test_empty_word_rejected(self) -> None:
        """空白词（归一化后为空串）抛 RecoveryError。"""
        words = ZERO_ENTROPY_WORDS.copy()
        words[5] = "  "
        with pytest.raises(RecoveryError, match="非法单词"):
            from_recovery_code(words)

    def test_checksum_mismatch_rejected(self) -> None:
        """12 个合法词但校验位不匹配（abandon×12）抛 RecoveryError。"""
        with pytest.raises(RecoveryError, match="校验位不匹配"):
            from_recovery_code(["abandon"] * 12)

    def test_swapped_word_order_breaks_checksum(self) -> None:
        """词序颠倒的合法词序列校验位非法，重建被拒绝。"""
        with pytest.raises(RecoveryError, match="校验位不匹配"):
            from_recovery_code(REVERSED_ZERO_ENTROPY_WORDS)


class TestNormalization:
    """大小写与多余空白归一化。"""

    def test_uppercase_and_whitespace_normalized(self) -> None:
        """大写 + 首尾空白的恢复码归一化后重建结果与原熵一致。"""
        master_key, words = generate_recovery()
        messy = [f"  {w.upper()}\t" for w in words]
        assert from_recovery_code(messy) == master_key

    def test_known_vector_mixed_case(self) -> None:
        """官方向量的大小写混杂 + 空白版本重建出同一全零熵。"""
        messy = [" ABANDON ", "Abandon", "abandon "] + ["abandon"] * 8 + [" ABOUT "]
        assert from_recovery_code(messy) == bytes(16)

    def test_tuple_input_accepted(self) -> None:
        """任意 Sequence 输入（如 tuple）均可重建。"""
        assert from_recovery_code(tuple(ZERO_ENTROPY_WORDS)) == bytes(16)


class TestErrorHierarchy:
    """errors 异常族分层契约：上层可按 CryptoError 统一捕获。"""

    def test_all_crypto_errors_share_base(self) -> None:
        """四个具体异常均为 CryptoError 子类，CryptoError 为 RuntimeError 子类。"""
        for exc_type in (CipherError, KeyDerivationError, KeyStoreError, RecoveryError):
            assert issubclass(exc_type, CryptoError)
        assert issubclass(CryptoError, RuntimeError)

    def test_recovery_error_catchable_as_crypto_error(self) -> None:
        """RecoveryError 可按 CryptoError 族捕获（分层捕获惯例）。"""
        with pytest.raises(CryptoError):
            from_recovery_code(["abandon"] * 12)

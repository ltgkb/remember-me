"""BIP39 恢复码模块 — 主密钥的离线备份、校验与跨设备重建。

基于 ``mnemonic`` 库（BIP39 标准参考实现），将 128 bit 主密钥熵编码为
12 个英文助记词，供用户离线抄写保存；需要时从助记词逐字节重建主密钥。

架构依据：``docs/design/cloud-sync-architecture-2026-07-16.md`` §6 风险表
（恢复码机制：12 词 BIP39 助记词，用户离线保存）。

* **验收硬指标**：跨进程 / 跨设备重建一致性 —— 同一主密钥经过
  ``生成 → 编码 → 重建`` 后，结果必须与原主密钥**逐字节相等**
  （路线图 ``cloud-sync-roadmap-2026-07-18.md`` §3.2 验收标准 5）。
* **密钥获取路径**：KDF（口令派生）得到的 32 字节主密钥与本模块恢复码
  路径的主密钥是两条独立获取路径；恢复码路径的主密钥即 128 bit 熵
  本身，不做二次派生。
* **安全红线**：恢复码与主密钥均属敏感信息，日志中**绝不**打印完整
  恢复码或主密钥内容（前 4 字节 hex 之类的指纹也建议省略）；本模块
  仅记录字节长度与操作结果。
"""

from __future__ import annotations

import logging
import os
from typing import Sequence

from mnemonic import Mnemonic

from .errors import RecoveryError

logger = logging.getLogger("memory_engine.crypto.recovery")

# ---------------------------------------------------------------------------
# 常量
# ---------------------------------------------------------------------------
ENTROPY_BYTES = 16
"""恢复码路径主密钥熵长度（字节）：128 bit 熵 + 4 bit 校验 ↔ 12 词。"""

RECOVERY_WORD_COUNT = 12
"""BIP39 恢复码固定词数。"""

# 模块级单例：加载英文词表（2048 词），避免每次调用重复读盘。
_MNEMONIC = Mnemonic("english")
_WORD_SET: frozenset[str] = frozenset(_MNEMONIC.wordlist)


def generate_master_key() -> bytes:
    """生成恢复码路径的主密钥（128 bit 加密安全随机熵）。

    注意：KDF 派生的 32 字节主密钥与本函数生成的恢复码主密钥是两条
    独立获取路径；恢复码路径的主密钥即 128 bit 熵本身，不再二次派生。

    Returns:
        16 字节（128 bit）主密钥熵，取自 ``os.urandom``。
    """
    master_key = os.urandom(ENTROPY_BYTES)
    logger.info("已生成恢复码路径主密钥（熵长度 %d 字节）", len(master_key))
    return master_key


def to_recovery_code(master_key: bytes) -> list[str]:
    """将 16 字节主密钥熵编码为 12 个英文 BIP39 助记词。

    Args:
        master_key: 主密钥熵，必须恰好 16 字节（128 bit）。

    Returns:
        12 个小写英文助记词组成的列表。

    Raises:
        RecoveryError: 熵长度不是 16 字节时抛出。
    """
    if len(master_key) != ENTROPY_BYTES:
        raise RecoveryError(
            f"主密钥熵必须为 {ENTROPY_BYTES} 字节（128 bit），实际为 "
            f"{len(master_key)} 字节；12 词 BIP39 恢复码仅支持 128 bit 熵。"
        )
    phrase: str = _MNEMONIC.to_mnemonic(master_key)
    words = phrase.split(" ")
    logger.info("已将主密钥熵编码为 BIP39 恢复码（共 %d 词）", len(words))
    return words


def from_recovery_code(words: Sequence[str]) -> bytes:
    """从 12 个 BIP39 助记词重建主密钥熵。

    三层校验（全部通过后才会重建）：

    1. 词数必须恰好为 12；
    2. 逐词归一化（去首尾空白、转小写）后，必须全部命中 BIP39 英文词表，
       空词与词表外单词均视为非法；
    3. BIP39 校验位（checksum）必须匹配（``Mnemonic.check``）。

    Args:
        words: 助记词序列；允许大小写混杂与首尾空白，将先归一化再校验。

    Returns:
        重建出的 16 字节主密钥熵。

    Raises:
        RecoveryError: 词数不符、含非法单词或校验位不匹配时抛出，
            提示信息面向用户，不泄露恢复码内容。
    """
    normalized = [w.strip().lower() for w in words]

    if len(normalized) != RECOVERY_WORD_COUNT:
        raise RecoveryError(
            f"恢复码应由 {RECOVERY_WORD_COUNT} 个单词组成，实际收到 "
            f"{len(normalized)} 个；请核对是否遗漏或多写了单词。"
        )

    invalid = [w if w else "（空词）" for w in normalized if w not in _WORD_SET]
    if invalid:
        raise RecoveryError(
            f"恢复码包含非法单词：{'、'.join(invalid)}；这些词不在 BIP39 "
            "英文词表中（或为空词），请核对拼写后重试。"
        )

    if not _MNEMONIC.check(" ".join(normalized)):
        raise RecoveryError(
            "恢复码校验位不匹配，恢复码可能已损坏或存在抄写错误；"
            "请逐词核对后重新输入。"
        )

    entropy = bytes(_MNEMONIC.to_entropy(" ".join(normalized)))
    logger.info("恢复码校验通过，已重建主密钥熵（%d 字节）", len(entropy))
    return entropy


def generate_recovery() -> tuple[bytes, list[str]]:
    """一步生成恢复码路径主密钥及其 12 词 BIP39 恢复码。

    Returns:
        ``(master_key, words)``：16 字节主密钥熵与 12 个英文助记词。
    """
    master_key = generate_master_key()
    return master_key, to_recovery_code(master_key)

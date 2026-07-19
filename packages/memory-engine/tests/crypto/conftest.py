"""tests/crypto 公共 fixture：随机密钥/明文生成器与隔离的数据目录。

约定：
* 密钥一律经 ``os.urandom`` 现场生成，不在仓库中固化任何密钥材料；
* 落盘类用例一律经 ``REMEMBER_ME_DATA_DIR`` 指向 pytest 临时目录，
  与真实 ``~/.remember-me`` 数据目录完全隔离。
"""

from __future__ import annotations

import os
from collections.abc import Callable
from pathlib import Path

import pytest


@pytest.fixture()
def random_key() -> bytes:
    """生成一枚 32 字节随机 AES-256 密钥。"""
    return os.urandom(32)


@pytest.fixture()
def key_factory() -> Callable[[int], bytes]:
    """返回按需生成任意长度随机字节的工厂，用于密钥长度边界用例。"""

    def _make(length: int = 32) -> bytes:
        return os.urandom(length)

    return _make


@pytest.fixture()
def tmp_data_dir(monkeypatch: pytest.MonkeyPatch, tmp_path: Path) -> Path:
    """将 REMEMBER_ME_DATA_DIR 指向 pytest 临时目录，隔离密钥文件落盘位置。"""
    monkeypatch.setenv("REMEMBER_ME_DATA_DIR", str(tmp_path))
    return tmp_path

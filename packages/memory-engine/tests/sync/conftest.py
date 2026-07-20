"""tests/sync 公共 fixture：REMEMBER_ME_DATA_DIR 隔离 + keyring 假后端。

红线：``crypto.bootstrap`` 使用固定 ``key_id``（``"master"`` / ``"recovery"``），
因此 bootstrap 全部用例一律在 mock keyring 环境下运行——真实系统密钥环
（Windows Credential Locker）不允许被 pytest 写入 / 删除固定条目，
避免污染用户真实凭据（``tests/crypto`` 用随机 key_id 也是同一考量）。
"""

from __future__ import annotations

from pathlib import Path

import keyring
import keyring.errors
import pytest

from memory_engine.crypto.keystore import KeyringKeyStore


@pytest.fixture()
def tmp_data_dir(monkeypatch: pytest.MonkeyPatch, tmp_path: Path) -> Path:
    """将 REMEMBER_ME_DATA_DIR 指向 pytest 临时目录，隔离全部落盘产物。"""
    monkeypatch.setenv("REMEMBER_ME_DATA_DIR", str(tmp_path))
    return tmp_path


@pytest.fixture()
def force_file_keystore(monkeypatch: pytest.MonkeyPatch) -> None:
    """强制 keyring 不可用：get_keystore 一律降级 FileKeyStore（hermetic）。"""
    monkeypatch.setattr(KeyringKeyStore, "is_available", classmethod(lambda cls: False))


@pytest.fixture()
def fake_keyring(monkeypatch: pytest.MonkeyPatch) -> dict[tuple[str, str], str]:
    """dict 支撑的假系统密钥环：is_available=True + 全量替换 keyring 三函数。

    返回底层 dict，供用例直接断言条目内容或预置 / 删除条目；
    全程不触碰真实系统密钥环。
    """
    vault: dict[tuple[str, str], str] = {}

    def _set(service: str, username: str, password: str) -> None:
        vault[(service, username)] = password

    def _get(service: str, username: str) -> str | None:
        return vault.get((service, username))

    def _delete(service: str, username: str) -> None:
        try:
            del vault[(service, username)]
        except KeyError:
            raise keyring.errors.PasswordDeleteError(username) from None

    monkeypatch.setattr(keyring, "set_password", _set)
    monkeypatch.setattr(keyring, "get_password", _get)
    monkeypatch.setattr(keyring, "delete_password", _delete)
    monkeypatch.setattr(KeyringKeyStore, "is_available", classmethod(lambda cls: True))
    return vault

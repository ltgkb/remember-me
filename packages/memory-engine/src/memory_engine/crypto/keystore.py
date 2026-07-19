"""主密钥本地托管（KeyStore）— Remember Me Phase 4.2.1 本地加密层。

实现 ``docs/design/cloud-sync-architecture-2026-07-16.md`` §2.1「主密钥本地安全
存储：操作系统密钥链」，以及 ``docs/design/cloud-sync-roadmap-2026-07-18.md``
§6 风险表「Windows 凭据存储差异」行的既定降级方案。

双后端策略::

    get_keystore()
      ├─ 系统密钥环可用  → KeyringKeyStore（首选）
      │    Windows Credential Locker（DPAPI）/ macOS Keychain / Linux libsecret
      └─ 不可用          → FileKeyStore（降级，需口令）
           {data_dir}/.sync/keystore.enc，PBKDF2 + AES-256-GCM

⚠ 安全等级差异（路线图 §6 明确要求明示）：

* **系统密钥环**（:class:`KeyringKeyStore`）：由操作系统提供保护——Windows 上为
  DPAPI 加密的 Credential Locker、macOS Keychain、Linux libsecret。主密钥**免密
  读回**，且仅当前登录用户可访问，离线拿到文件也无法解密。
* **降级密钥文件**（:class:`FileKeyStore`）：仅由用户口令经 PBKDF2 派生的密钥
  保护（AES-256-GCM），文件本身可被复制离线爆破，安全性**低于**系统密钥环。
  仅在无桌面环境（SSH / Server Core）、域控策略禁用 Credential Locker 等
  keyring 不可用的受限场景作兜底使用。

密钥长度约定：托管的密钥（主密钥 / DEK）只接受 16 或 32 字节，其他长度一律
抛 :class:`KeyStoreError`。

编码说明：``keyring`` 仅接受 ``str`` 密码，bytes 密钥采用 **hex** 编码入库。
32 字节密钥 hex 后为 64 字符，远低于 Windows Credential Locker 约 2.5KB/条的
容量上限（路线图 §6 风险表），且 hex 为纯 ASCII，规避任何后端对非 ASCII 字符
的兼容性差异。

降级密钥文件格式（``keystore.enc``，JSON）::

    {
      "version": 1,
      "salt": "<16 字节 salt 的 hex>",
      "entries": { "<key_id>": "<AES-GCM 整体密文的 hex>" }
    }

每个 entry 独立用 :func:`cipher.encrypt_file` 加密，AAD 的 ``filepath`` 参数为
固定逻辑名 ``f"keystore:{key_id}"``、``version=1``——密文被改名/搬移到其他
key_id 下即解密失败，防重放与错配。文件加密密钥 =
``derive_master_key(passphrase, salt, method="pbkdf2")``。选用 PBKDF2 而非
Argon2id 的理由：降级文件已由口令保护并受本机 ACL 防护，威胁模型为离线爆破
防护而非内存硬度；PBKDF2-SHA256 100,000 迭代对该场景足够，且启动期派生耗时可
忽略（约数十毫秒），避免每次读写密钥都付出 Argon2id 64 MiB 内存硬度的开销。

写盘安全：所有写入先落同目录临时文件，再 :func:`os.replace` 原子替换，杜绝
半截文件；权限尽力收紧为 ``0o600``（POSIX 有效；Windows 上 ``os.chmod`` 仅能
设置只读位，实际防护依赖 NTFS ACL 与用户目录隔离，属「尽力而为」，特此说明）。
"""

from __future__ import annotations

import json
import logging
import os
import tempfile
import uuid
from abc import ABC, abstractmethod
from pathlib import Path

import keyring
import keyring.errors

from ..cli import _data_dir
from .cipher import decrypt_file, encrypt_file
from .errors import CipherError, KeyStoreError
from .kdf import derive_master_key, generate_salt

logger = logging.getLogger("memory_engine.crypto.keystore")


# ---------------------------------------------------------------------------
# 常量
# ---------------------------------------------------------------------------
VALID_KEY_LENGTHS = (16, 32)
"""允许托管的密钥长度（字节）：AES-128 / AES-256 级别的主密钥或 DEK。"""

KEYRING_SERVICE_NAME = "remember-me"
"""keyring 条目的 service 名；key_id 作为用户名（username）字段。"""

KEYSTORE_FILENAME = "keystore.enc"
"""降级密钥文件名，固定位于 ``{data_dir}/.sync/`` 下。"""

FILE_FORMAT_VERSION = 1
"""降级密钥文件格式版本；entry 级 AAD 的 version 参数亦固定取此值。"""


def _check_key_length(key: bytes) -> None:
    """校验托管密钥长度，非法即抛 :class:`KeyStoreError`。"""
    if len(key) not in VALID_KEY_LENGTHS:
        raise KeyStoreError(
            f"托管密钥长度必须为 {VALID_KEY_LENGTHS[0]} 或 {VALID_KEY_LENGTHS[1]} 字节"
            f"（实际 {len(key)} 字节）；请传入 kdf 派生的主密钥或 DEK"
        )


# ---------------------------------------------------------------------------
# KeyStore 抽象基类
# ---------------------------------------------------------------------------
class KeyStore(ABC):
    """主密钥托管抽象：store / load / delete / exists 四操作。

    采用 ABC 而非 ``typing.Protocol``：本包错误模型（``errors.py``）已按继承
    层级组织，ABC 可在基类中统一长度校验等共享逻辑，并强制子类实现全部四个
    方法，缺失时在实例化阶段即报错，与项目「显式失败优于静默」的风格一致。

    错误约定：

    * ``load`` 的 ``key_id`` 不存在 → :class:`KeyStoreError`；
    * ``store`` / ``delete`` 底层失败 → :class:`KeyStoreError` 包装原始异常；
    * ``delete`` 对不存在的 ``key_id`` 为**幂等空操作**（便于清理流程无条件调用）；
    * 任何后端异常绝不穿透为第三方异常类型，统一收敛为 :class:`KeyStoreError`。
    """

    @abstractmethod
    def store(self, key_id: str, key: bytes) -> None:
        """存入密钥（同 ``key_id`` 覆盖写）。

        Raises:
            KeyStoreError: 密钥长度非法或底层存储失败。
        """

    @abstractmethod
    def load(self, key_id: str) -> bytes:
        """读回密钥。

        Raises:
            KeyStoreError: ``key_id`` 不存在或底层读取失败。
        """

    @abstractmethod
    def delete(self, key_id: str) -> None:
        """删除密钥；``key_id`` 不存在时为幂等空操作。

        Raises:
            KeyStoreError: 底层删除失败。
        """

    @abstractmethod
    def exists(self, key_id: str) -> bool:
        """判断 ``key_id`` 是否已托管。"""


# ---------------------------------------------------------------------------
# 首选后端：系统密钥环
# ---------------------------------------------------------------------------
class KeyringKeyStore(KeyStore):
    """基于 ``keyring`` 库的系统密钥环后端（首选）。

    Windows 落 Credential Locker（DPAPI 保护）、macOS 落 Keychain、Linux 落
    libsecret。bytes 密钥以 **hex** 编码为 str 入库——32 字节密钥 hex 后 64
    字符，远低于 Windows 约 2.5KB/条上限（理由见模块 docstring）。
    """

    _available_cache: bool | None = None
    """:meth:`is_available` 的探测结果缓存（进程内只探测一次）。"""

    def __init__(self, service_name: str = KEYRING_SERVICE_NAME) -> None:
        self._service_name = service_name

    @classmethod
    def is_available(cls) -> bool:
        """探测当前环境 keyring 后端是否真实可用（结果进程内缓存）。

        仅检查 ``get_keyring()`` 返回的后端类型不足以判定可用性——无桌面
        会话、域控策略限制等场景后端对象存在但读写会失败。故实际执行一次
        无害的「写入 → 读回校验 → 删除」探测，凭据名为随机 probe 名，不留
        残留。任何异常（含无桌面环境、策略拒绝）一律视为不可用并记日志。
        """
        if cls._available_cache is not None:
            return cls._available_cache

        probe_id = f"probe-{uuid.uuid4().hex[:12]}"
        try:
            keyring.set_password(KEYRING_SERVICE_NAME, probe_id, "probe")
            readback = keyring.get_password(KEYRING_SERVICE_NAME, probe_id)
            keyring.delete_password(KEYRING_SERVICE_NAME, probe_id)
            available = readback == "probe"
            if not available:
                logger.info("keyring 探测读回值不符，判定后端不可用")
        except Exception as exc:  # 后端不可用 / 策略拒绝 / 无桌面环境
            logger.info("keyring 后端探测失败，判定不可用：%s: %s", type(exc).__name__, exc)
            available = False

        cls._available_cache = available
        return available

    def store(self, key_id: str, key: bytes) -> None:
        """hex 编码后写入系统密钥环；底层失败包装为 :class:`KeyStoreError`。"""
        _check_key_length(key)
        try:
            keyring.set_password(self._service_name, key_id, key.hex())
        except Exception as exc:
            raise KeyStoreError(
                f"主密钥写入系统密钥环失败（key_id={key_id!r}）：{exc}"
            ) from exc
        logger.debug("密钥已写入系统密钥环（key_id=%r）", key_id)

    def load(self, key_id: str) -> bytes:
        """从系统密钥环读回密钥并 hex 解码。

        Raises:
            KeyStoreError: 条目不存在、hex 解码失败、解码后长度非法或底层错误。
        """
        try:
            stored = keyring.get_password(self._service_name, key_id)
        except Exception as exc:
            raise KeyStoreError(
                f"主密钥从系统密钥环读取失败（key_id={key_id!r}）：{exc}"
            ) from exc
        if stored is None:
            raise KeyStoreError(
                f"系统密钥环中不存在密钥（key_id={key_id!r}）；"
                "请先完成初始化或用恢复码重建主密钥"
            )
        try:
            key = bytes.fromhex(stored)
        except ValueError as exc:
            raise KeyStoreError(
                f"系统密钥环条目内容损坏（key_id={key_id!r}）：不是合法 hex 编码"
            ) from exc
        try:
            _check_key_length(key)
        except KeyStoreError as exc:
            raise KeyStoreError(
                f"系统密钥环条目内容损坏（key_id={key_id!r}）：{exc}"
            ) from exc
        return key

    def delete(self, key_id: str) -> None:
        """删除密钥环条目；不存在的条目幂等忽略。"""
        try:
            keyring.delete_password(self._service_name, key_id)
        except keyring.errors.PasswordDeleteError:
            logger.debug("密钥环条目不存在，删除视为幂等空操作（key_id=%r）", key_id)
        except Exception as exc:
            raise KeyStoreError(
                f"主密钥从系统密钥环删除失败（key_id={key_id!r}）：{exc}"
            ) from exc
        else:
            logger.debug("密钥已从系统密钥环删除（key_id=%r）", key_id)

    def exists(self, key_id: str) -> bool:
        """读取探测条目是否存在；底层错误视为「不存在」并记日志。"""
        try:
            return keyring.get_password(self._service_name, key_id) is not None
        except Exception as exc:
            logger.info(
                "keyring 读取探测失败，exists 按 False 处理（key_id=%r）：%s", key_id, exc
            )
            return False


# ---------------------------------------------------------------------------
# 降级后端：口令保护的加密密钥文件
# ---------------------------------------------------------------------------
class FileKeyStore(KeyStore):
    """降级后端：口令保护的加密密钥文件 ``{data_dir}/.sync/keystore.enc``。

    ⚠ 安全等级低于 :class:`KeyringKeyStore`（模块 docstring 有完整说明）：
    仅口令 PBKDF2 防护、文件可被复制离线爆破，仅在系统密钥环不可用时兜底。

    文件格式::

        {"version": 1, "salt": "<hex>", "entries": {"<key_id>": "<hex 密文>"}}

    文件加密密钥 = ``derive_master_key(passphrase, salt, "pbkdf2")``；每个
    entry 的 AAD 绑定 ``f"keystore:{key_id}"`` 与版本 1。

    Attributes:
        path: 密钥文件实际路径。
    """

    def __init__(self, passphrase: str, data_dir: Path | None = None) -> None:
        """
        Args:
            passphrase: 保护密钥文件的口令，非空。
            data_dir: 数据目录；``None`` 时走 ``cli._data_dir()``（
                ``REMEMBER_ME_DATA_DIR`` 环境变量覆盖，默认 ``~/.remember-me``）。

        Raises:
            KeyStoreError: 口令为空。
        """
        if not passphrase:
            raise KeyStoreError(
                "降级密钥文件需要非空口令：系统密钥环不可用时，"
                "必须提供口令以派生文件加密密钥"
            )
        self._passphrase = passphrase
        base = data_dir if data_dir is not None else _data_dir()
        self.path = base / ".sync" / KEYSTORE_FILENAME

    # ------------------------------------------------------------------
    # 文件读写（原子替换 + 尽力收紧权限）
    # ------------------------------------------------------------------
    def _read_document(self) -> dict[str, object] | None:
        """读取并解析密钥文件；不存在返回 ``None``，损坏抛 :class:`KeyStoreError`。

        损坏语义：JSON 解析失败、顶层结构不符、版本不支持，一律抛错且**绝不
        返回部分数据**。
        """
        if not self.path.exists():
            return None
        try:
            raw = self.path.read_text(encoding="utf-8")
        except OSError as exc:
            raise KeyStoreError(f"降级密钥文件读取失败（{self.path}）：{exc}") from exc
        try:
            doc = json.loads(raw)
        except json.JSONDecodeError as exc:
            raise KeyStoreError(
                f"降级密钥文件已损坏（{self.path}）：JSON 解析失败——{exc}；"
                "请从备份恢复或用恢复码重建主密钥"
            ) from exc
        if (
            not isinstance(doc, dict)
            or doc.get("version") != FILE_FORMAT_VERSION
            or not isinstance(doc.get("salt"), str)
            or not isinstance(doc.get("entries"), dict)
        ):
            raise KeyStoreError(
                f"降级密钥文件格式非法或版本不支持（{self.path}）："
                f"期望 version={FILE_FORMAT_VERSION} 且含 salt/entries 字段"
            )
        return doc

    def _write_document(self, doc: dict[str, object]) -> None:
        """原子写入密钥文件：先写同目录临时文件，再 ``os.replace`` 替换。

        权限收紧为 ``0o600`` 属尽力而为：POSIX 下有效；Windows 的 ``os.chmod``
        仅能切换只读位，实际访问控制依赖 NTFS ACL 与用户目录隔离。
        """
        payload = json.dumps(doc, ensure_ascii=False, indent=2)
        try:
            self.path.parent.mkdir(parents=True, exist_ok=True)
            fd, tmp_name = tempfile.mkstemp(
                dir=self.path.parent, prefix=".keystore-", suffix=".tmp"
            )
            try:
                with os.fdopen(fd, "w", encoding="utf-8") as tmp_file:
                    tmp_file.write(payload)
                os.replace(tmp_name, self.path)
            except BaseException:
                # 替换失败时尽力清理临时文件，不留垃圾
                try:
                    os.unlink(tmp_name)
                except OSError:
                    pass
                raise
            try:
                os.chmod(self.path, 0o600)
            except OSError:
                logger.debug("无法收紧密钥文件权限（Windows 上属预期）：%s", self.path)
        except OSError as exc:
            raise KeyStoreError(f"降级密钥文件写入失败（{self.path}）：{exc}") from exc

    # ------------------------------------------------------------------
    # 条目级加解密
    # ------------------------------------------------------------------
    def _file_key(self, salt_hex: str) -> bytes:
        """按文件内 salt 派生文件加密密钥（PBKDF2，理由见模块 docstring）。"""
        try:
            salt = bytes.fromhex(salt_hex)
        except ValueError as exc:
            raise KeyStoreError(
                f"降级密钥文件已损坏（{self.path}）：salt 不是合法 hex 编码"
            ) from exc
        return derive_master_key(self._passphrase, salt, method="pbkdf2")

    @staticmethod
    def _aad_name(key_id: str) -> str:
        """entry 级 AAD 的固定逻辑名：``f"keystore:{key_id}"``。"""
        return f"keystore:{key_id}"

    # ------------------------------------------------------------------
    # KeyStore 接口实现
    # ------------------------------------------------------------------
    def store(self, key_id: str, key: bytes) -> None:
        """加密后存入条目；文件不存在时创建并生成新 salt。"""
        _check_key_length(key)
        doc = self._read_document()
        if doc is None:
            doc = {
                "version": FILE_FORMAT_VERSION,
                "salt": generate_salt().hex(),
                "entries": {},
            }
        entries = doc["entries"]
        assert isinstance(entries, dict)  # 已由 _read_document 校验
        file_key = self._file_key(str(doc["salt"]))
        ciphertext = encrypt_file(key, file_key, self._aad_name(key_id), FILE_FORMAT_VERSION)
        entries[key_id] = ciphertext.hex()
        self._write_document(doc)
        logger.debug("密钥已写入降级密钥文件（key_id=%r, path=%s）", key_id, self.path)

    def load(self, key_id: str) -> bytes:
        """读回并解密条目。

        Raises:
            KeyStoreError: 文件不存在、条目不存在、口令错误（解密认证失败）
                或密文损坏；``CipherError`` 统一包装，绝不返回部分明文。
        """
        doc = self._read_document()
        if doc is None:
            raise KeyStoreError(
                f"降级密钥文件不存在（{self.path}）：尚未托管任何密钥；"
                "请先完成初始化或用恢复码重建主密钥"
            )
        entries = doc["entries"]
        assert isinstance(entries, dict)
        stored = entries.get(key_id)
        if not isinstance(stored, str):
            raise KeyStoreError(
                f"降级密钥文件中不存在密钥（key_id={key_id!r}）；"
                "请先完成初始化或用恢复码重建主密钥"
            )
        file_key = self._file_key(str(doc["salt"]))
        try:
            ciphertext = bytes.fromhex(stored)
        except ValueError as exc:
            raise KeyStoreError(
                f"降级密钥文件条目损坏（key_id={key_id!r}）：不是合法 hex 编码"
            ) from exc
        try:
            return decrypt_file(ciphertext, file_key, self._aad_name(key_id), FILE_FORMAT_VERSION)
        except CipherError as exc:
            raise KeyStoreError(
                f"降级密钥文件解密失败（key_id={key_id!r}）：口令错误或文件已损坏/遭篡改"
            ) from exc

    def delete(self, key_id: str) -> None:
        """删除条目；文件或条目不存在时为幂等空操作。"""
        doc = self._read_document()
        if doc is None:
            logger.debug("降级密钥文件不存在，删除视为幂等空操作（key_id=%r）", key_id)
            return
        entries = doc["entries"]
        assert isinstance(entries, dict)
        if key_id not in entries:
            logger.debug("降级密钥文件无此条目，删除视为幂等空操作（key_id=%r）", key_id)
            return
        del entries[key_id]
        self._write_document(doc)
        logger.debug("密钥已从降级密钥文件删除（key_id=%r）", key_id)

    def exists(self, key_id: str) -> bool:
        """判断条目是否存在；文件不存在返回 ``False``，损坏抛 :class:`KeyStoreError`。"""
        doc = self._read_document()
        if doc is None:
            return False
        entries = doc["entries"]
        assert isinstance(entries, dict)
        return key_id in entries


# ---------------------------------------------------------------------------
# 工厂函数
# ---------------------------------------------------------------------------
def get_keystore(
    prefer_keyring: bool = True,
    fallback_passphrase: str | None = None,
    data_dir: Path | None = None,
) -> KeyStore:
    """按环境选择密钥托管后端：优先系统密钥环，否则降级加密密钥文件。

    选择结果记 INFO 日志；日志**绝不**包含口令或密钥内容。

    Args:
        prefer_keyring: 为 ``True`` 且 keyring 后端实测可用时返回
            :class:`KeyringKeyStore`；为 ``False`` 时强制走降级文件。
        fallback_passphrase: 降级路径所需的文件保护口令。
        data_dir: 降级文件的数据目录；``None`` 时走 ``cli._data_dir()``。

    Returns:
        选定的 :class:`KeyStore` 实例。

    Raises:
        KeyStoreError: keyring 不可用（或被 ``prefer_keyring=False`` 禁用）
            且未提供 ``fallback_passphrase``。
    """
    if prefer_keyring and KeyringKeyStore.is_available():
        logger.info("密钥托管后端选择：系统密钥环（keyring，OS 级保护，免密读回）")
        return KeyringKeyStore()

    if fallback_passphrase is None:
        raise KeyStoreError(
            "系统密钥环不可用且未提供降级口令：无法初始化密钥托管；"
            "请提供 fallback_passphrase 以启用口令保护的降级密钥文件"
            "（安全等级低于系统密钥环，见 keystore 模块文档）"
        )
    store = FileKeyStore(passphrase=fallback_passphrase, data_dir=data_dir)
    logger.info(
        "密钥托管后端选择：降级加密密钥文件 %s（口令 PBKDF2 防护，"
        "安全等级低于系统密钥环，仅作受限环境兜底）",
        store.path,
    )
    return store

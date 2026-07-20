"""Lamport 逻辑时钟 — 同步协议的版本排序原语（架构 §3.2）。

实现 ``docs/design/cloud-sync-architecture-2026-07-16.md`` §3.2 的
「基于 Lamport 时间戳」冲突检测基础：

* **版本印记** :data:`Stamp` = ``(lamport, deviceId)`` 二元组，字典序全序——
  lamport 主序（小的在前），平局时 deviceId 字典序决胜。lamport 与 deviceId
  组合给出**确定性全序**：任意两个不同印记必可分先后，且判定结果在所有设备
  上一致，这是架构 §3.3 LWW（Last-Write-Wins）默认策略可自动收敛的前提。
* **本地时钟** :class:`LamportClock`：``tick()`` 本地事件 +1；``merge(remote)``
  接收远端时钟值取 ``max(local, remote) + 1``（收到消息本身是本地事件）。
  ``deviceId`` 自 :class:`~memory_engine.sync.config.SyncConfig` 注入
  （``load_or_create_config`` 保证跨进程稳定）。
* **持久化**：时钟值实时落盘到 ``.sync/config.json`` 的 ``lamport`` 字段
  （tick / merge 后即原子写），进程重启后重新 load 的时钟**绝不回退**——
  回退会导致新事件拿到比历史版本更小的印记，破坏 LWW 全序的确定性。

收敛性说明（双时钟交错合并最终一致）：

1. **因果捕获**：``merge`` 取 ``max+1`` 使接收方时钟**严格超过**发送方
   发送时刻的值——「先发生（happens-before）」的关系必被时钟值正确捕获，
   任意交错合并序列下这一偏序性质不变；
2. **全序确定**：``(lamport, deviceId)`` 字典序给出确定性全序——任意两个
   不同印记必可分先后，且判定结果在所有设备上一致（平局由 deviceId
   字典序决胜，不依赖物理时钟）；
3. **判定收敛一致**：双方交换过最新时钟值后，对同一文件集合的版本排序
   判定**确定且两设备一致**（路线图 §3.3 验收标准 1「双设备 LWW 收敛结果
   确定且两设备一致」的本地原语基础）。注意「收敛一致」指**排序判定**
   一致，而非计数器值相等——merge 的 +1 语义使最后接收方严格领先，
   这正是因果捕获的代价与保证；双方时钟值本身单调只增、无需相等。

注意：Lamport 全序给出的是「可判定的先后」，不是「并发检测」——同一逻辑
时刻的并发写入只能靠 lamport 相等 + deviceId 不同识别（见 ``sync.manifest``
的冲突分类），更精确的并发检测需向量时钟，属 4.2.2 正式窗口评估项。
"""

from __future__ import annotations

from pathlib import Path

from .config import load_or_create_config, save_config
from .errors import SyncError

__all__ = [
    "Stamp",
    "LamportClock",
    "compare",
    "happens_before",
]

Stamp = tuple[int, str]
"""版本印记 ``(lamport, deviceId)`` —— 架构 §3.2 的字典序全序比较单元。"""


# ---------------------------------------------------------------------------
# 印记校验与字典序比较
# ---------------------------------------------------------------------------
def _validate_stamp(stamp: Stamp, name: str) -> None:
    """校验版本印记结构，非法即抛 :class:`SyncError`（绝不静默排序非法输入）。"""
    lamport, device_id = stamp
    if not isinstance(lamport, int) or isinstance(lamport, bool) or lamport < 0:
        raise SyncError(
            f"非法版本印记：{name} 的 lamport 必须是非负整数（实际 {lamport!r}）；"
            "请不要手动编辑 .sync/ 目录"
        )
    if not isinstance(device_id, str) or not device_id:
        raise SyncError(
            f"非法版本印记：{name} 的 deviceId 必须是非空字符串（实际 {device_id!r}）"
        )


def compare(a: Stamp, b: Stamp) -> int:
    """``(lamport, deviceId)`` 字典序比较：``a<b → -1``；``a==b → 0``；``a>b → +1``。

    语义 100% 对齐架构 §3.2：lamport 主序（小的在前），平局时 deviceId
    字典序决胜——确定性全序，任意两个不同印记必可分先后，且判定结果
    跨设备一致（LWW 自动收敛的数学基础）。

    Raises:
        SyncError: 任一印记结构非法（lamport 非非负整数 / deviceId 非非空字符串）。
    """
    _validate_stamp(a, "a")
    _validate_stamp(b, "b")
    if a[0] != b[0]:
        return -1 if a[0] < b[0] else 1
    if a[1] != b[1]:
        return -1 if a[1] < b[1] else 1
    return 0


def happens_before(a: Stamp, b: Stamp) -> bool:
    """``a`` 在字典序全序上严格先于 ``b``（LWW 语义下 ``b`` 获胜）。

    与 :func:`compare` 共享全部校验语义；``a == b`` 时返回 ``False``
    （同一印记没有先后可言）。
    """
    return compare(a, b) < 0


# ---------------------------------------------------------------------------
# 本地时钟（持久化于 .sync/config.json 的 lamport 字段）
# ---------------------------------------------------------------------------
class LamportClock:
    """本地 Lamport 时钟：``tick()`` / ``merge()`` 双操作，状态随 config 落盘。

    初始化即经 ``load_or_create_config`` 读取（或首次创建）``.sync/config.json``，
    ``deviceId`` 自此跨进程稳定；时钟初值取自 config 的 ``lamport`` 字段，
    进程重启后**续走不回退**（A1 已为该字段预留持久化位置）。

    每次 ``tick()`` / ``merge()`` 后立即原子写 config（沿用 ``FileKeyStore``
    先例的同目录临时文件 + ``os.replace``），代价是每次事件一次小文件 IO，
    换来强杀 / 断电场景下时钟状态不丢失、不回退。

    收敛性：见模块 docstring「收敛性说明」——交错合并最终一致，且
    ``(lamport, deviceId)`` 全序保证双设备 LWW 判定确定一致。
    """

    def __init__(self, data_dir: Path | None = None) -> None:
        """加载（或首次创建）同步配置并恢复时钟值。

        Args:
            data_dir: 数据目录；``None`` 时走 ``cli._data_dir()``
                （``REMEMBER_ME_DATA_DIR`` 环境变量覆盖，测试隔离零成本）。

        Raises:
            SyncConfigError: config 已存在但损坏（字段非法 / JSON 解析失败）。
        """
        self._data_dir = data_dir
        self._config = load_or_create_config(data_dir)
        self._value = self._config.lamport

    @property
    def device_id(self) -> str:
        """本机设备标识（自 :class:`SyncConfig` 注入，跨进程稳定）。"""
        return self._config.device_id

    @property
    def value(self) -> int:
        """当前时钟值（只读快照；不产生事件、不落盘）。"""
        return self._value

    def stamp(self) -> Stamp:
        """当前版本印记 ``(value, device_id)``，供 FileVersion 打戳使用。"""
        return (self._value, self._config.device_id)

    def tick(self) -> int:
        """本地事件：时钟 +1 并立即持久化，返回新值。"""
        self._value += 1
        self._persist()
        return self._value

    def merge(self, remote: int) -> int:
        """合并远端时钟值：取 ``max(local, remote) + 1`` 并立即持久化。

        「收到远端消息」本身是本地事件，因此即使 ``remote <= local`` 也要 +1，
        严格遵循 Lamport 算法定义；合并幂等且可交换（结果由 max 决定），
        是交错合并最终一致的保证。

        Args:
            remote: 远端时钟值（非负整数）。

        Returns:
            合并后的新时钟值。

        Raises:
            SyncError: ``remote`` 不是非负整数。
        """
        if not isinstance(remote, int) or isinstance(remote, bool) or remote < 0:
            raise SyncError(
                f"非法远端时钟值：必须是非负整数（实际 {remote!r}）；"
                "远端 manifest 可能已损坏，请按损坏处置流程处理"
            )
        self._value = max(self._value, remote) + 1
        self._persist()
        return self._value

    def _persist(self) -> None:
        """把当前时钟值写回 config 并原子落盘（防进程重启回退）。"""
        self._config.lamport = self._value
        save_config(self._config, self._data_dir)

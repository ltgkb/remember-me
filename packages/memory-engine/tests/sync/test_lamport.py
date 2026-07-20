"""sync.lamport Lamport 时钟测试 — 对应迭代计划 B1 验收矩阵。

覆盖：tick / merge 语义与校验、双时钟交错 merge 收敛一致（确定性 +
随机交错性质）、字典序平局 deviceId 决胜、全序性质（自反 / 反对称 /
传递 /  totality）、tick / merge 后持久化与模拟重启不回退、deviceId
自 SyncConfig 注入且跨进程稳定、环境变量解析路径。

fixture 自包含（conftest 由主协调代理统一整合，本文件不依赖、不修改）。
"""

from __future__ import annotations

import json
import random
import uuid
from pathlib import Path

import pytest

from memory_engine.sync.config import load_config
from memory_engine.sync.errors import SyncError
from memory_engine.sync.lamport import LamportClock, Stamp, compare, happens_before
from memory_engine.sync.paths import config_path


@pytest.fixture()
def device_dirs(tmp_path: Path) -> tuple[Path, Path]:
    """两台设备的独立数据目录（显式 data_dir，不依赖环境变量）。"""
    dir_a = tmp_path / "device-a"
    dir_b = tmp_path / "device-b"
    dir_a.mkdir()
    dir_b.mkdir()
    return dir_a, dir_b


class TestTickAndMerge:
    """tick / merge 基本语义（B1 任务描述第 1 条）。"""

    def test_initial_value_is_zero(self, device_dirs: tuple[Path, Path]) -> None:
        dir_a, _ = device_dirs
        clock = LamportClock(dir_a)
        assert clock.value == 0
        assert clock.stamp() == (0, clock.device_id)

    def test_tick_increments_by_one(self, device_dirs: tuple[Path, Path]) -> None:
        dir_a, _ = device_dirs
        clock = LamportClock(dir_a)
        assert clock.tick() == 1
        assert clock.tick() == 2
        assert clock.value == 2

    def test_merge_takes_max_plus_one(self, device_dirs: tuple[Path, Path]) -> None:
        dir_a, _ = device_dirs
        clock = LamportClock(dir_a)
        clock.tick()  # 1
        assert clock.merge(5) == 6  # max(1, 5) + 1
        assert clock.value == 6

    def test_merge_smaller_remote_still_increments(self, device_dirs: tuple[Path, Path]) -> None:
        """收到消息本身是本地事件：remote <= local 也 +1（Lamport 算法定义）。"""
        dir_a, _ = device_dirs
        clock = LamportClock(dir_a)
        clock.merge(10)  # 11
        assert clock.merge(3) == 12  # max(11, 3) + 1

    def test_merge_rejects_invalid_remote(self, device_dirs: tuple[Path, Path]) -> None:
        dir_a, _ = device_dirs
        clock = LamportClock(dir_a)
        with pytest.raises(SyncError, match="非负整数"):
            clock.merge(-1)
        with pytest.raises(SyncError, match="非负整数"):
            clock.merge(True)  # bool 是 int 子类，必须排除
        with pytest.raises(SyncError, match="非负整数"):
            clock.merge("3")  # type: ignore[arg-type]
        assert clock.value == 0  # 非法输入不产生事件

    def test_device_id_from_config_and_stable(self, device_dirs: tuple[Path, Path]) -> None:
        dir_a, _ = device_dirs
        clock = LamportClock(dir_a)
        uuid.UUID(clock.device_id)  # 合法 UUID4
        assert clock.device_id == load_config(dir_a).device_id
        assert LamportClock(dir_a).device_id == clock.device_id  # 跨实例稳定

    def test_env_var_resolution(
        self, monkeypatch: pytest.MonkeyPatch, tmp_path: Path
    ) -> None:
        """data_dir=None 时走 REMEMBER_ME_DATA_DIR 约定（与 cli._data_dir 一致）。"""
        monkeypatch.setenv("REMEMBER_ME_DATA_DIR", str(tmp_path))
        clock = LamportClock()
        clock.tick()
        assert json.loads(config_path(tmp_path).read_text(encoding="utf-8"))["lamport"] == 1


class TestLexicographicOrder:
    """(lamport, deviceId) 字典序全序（B1 任务描述第 2 条，架构 §3.2）。"""

    def test_lamport_primary_order(self) -> None:
        assert compare((1, "dev-b"), (2, "dev-a")) == -1  # lamport 小的在前
        assert compare((2, "dev-a"), (1, "dev-b")) == 1
        assert happens_before((1, "dev-b"), (2, "dev-a"))
        assert not happens_before((2, "dev-a"), (1, "dev-b"))

    def test_tie_broken_by_device_id(self) -> None:
        """lamport 平局 deviceId 字典序决胜（B1 验收第 2 条）。"""
        assert compare((3, "dev-a"), (3, "dev-b")) == -1
        assert compare((3, "dev-b"), (3, "dev-a")) == 1
        assert happens_before((3, "dev-a"), (3, "dev-b"))
        assert not happens_before((3, "dev-b"), (3, "dev-a"))

    def test_equal_stamps_compare_zero(self) -> None:
        assert compare((3, "dev-a"), (3, "dev-a")) == 0
        assert not happens_before((3, "dev-a"), (3, "dev-a"))

    def test_unicode_device_id_ordered_by_codepoint(self) -> None:
        # 乙 U+4E59 < 甲 U+7532（码点序，与语言环境无关的确定性）
        assert happens_before((1, "设备-乙"), (1, "设备-甲"))
        assert compare((1, "设备-甲"), (1, "设备-乙")) == 1

    @pytest.mark.parametrize(
        ("bad", "match"),
        [
            pytest.param((-1, "dev-a"), "非负整数", id="negative-lamport"),
            pytest.param((True, "dev-a"), "非负整数", id="bool-lamport"),
            pytest.param(("1", "dev-a"), "非负整数", id="str-lamport"),
            pytest.param((1, ""), "非空字符串", id="empty-device-id"),
            pytest.param((1, 42), "非空字符串", id="non-str-device-id"),
        ],
    )
    def test_invalid_stamp_rejected(self, bad: Stamp, match: str) -> None:
        with pytest.raises(SyncError, match=match):
            compare(bad, (1, "dev-a"))
        with pytest.raises(SyncError, match=match):
            compare((1, "dev-a"), bad)
        with pytest.raises(SyncError, match=match):
            happens_before(bad, (1, "dev-a"))

    def test_total_order_properties(self) -> None:
        """全序性质：totality / 反对称 / 传递（确定性 LWW 的数学基础）。"""
        stamps: list[Stamp] = [
            (0, "dev-a"),
            (1, "dev-a"),
            (1, "dev-b"),
            (2, "dev-a"),
            (2, "dev-b"),
        ]
        for a in stamps:
            for b in stamps:
                # totality：恰居其一
                outcomes = [compare(a, b) < 0, compare(a, b) == 0, compare(a, b) > 0]
                assert sum(outcomes) == 1
                # 反对称
                assert compare(a, b) == -compare(b, a)
                assert happens_before(a, b) != (happens_before(b, a) or a == b)
        for a in stamps:
            for b in stamps:
                for c in stamps:
                    if happens_before(a, b) and happens_before(b, c):
                        assert happens_before(a, c)


class TestConvergence:
    """双时钟交错 merge 收敛一致（B1 验收第 1 条）。

    「收敛一致」的精确语义（与 lamport 模块 docstring 对齐）：排序判定
    确定且双端一致，而非计数器值相等——merge 的 +1 语义使最后接收方
    严格领先，这是因果捕获的保证。
    """

    def test_interleaved_merge_deterministic(self, device_dirs: tuple[Path, Path]) -> None:
        """固定交错序列：merge 严格取 max+1，逐步可断言（确定性）。"""
        dir_a, dir_b = device_dirs
        clock_a = LamportClock(dir_a)
        clock_b = LamportClock(dir_b)

        clock_a.tick()  # a=1（本地事件）
        assert clock_b.merge(clock_a.value) == 2  # max(0, 1) + 1
        clock_b.tick()  # b=3
        assert clock_a.merge(clock_b.value) == 4  # max(1, 3) + 1
        clock_a.tick()  # a=5
        assert clock_b.merge(clock_a.value) == 6
        assert clock_a.merge(clock_b.value) == 7
        # 双方时钟值均严格大于各自合并时所见的一切远端值（因果捕获）
        assert clock_a.value == 7
        assert clock_b.value == 6

    def test_causality_captured_by_merge(self, device_dirs: tuple[Path, Path]) -> None:
        """b 合并 a 的值后，b 的一切后续版本在全序上严格晚于 a 当时的版本。"""
        dir_a, dir_b = device_dirs
        clock_a = LamportClock(dir_a)
        clock_b = LamportClock(dir_b)

        clock_a.tick()
        sent_stamp = clock_a.stamp()  # a 发送时刻的版本印记
        clock_b.merge(clock_a.value)
        clock_b.tick()
        assert happens_before(sent_stamp, clock_b.stamp())  # 因果先后被正确捕获
        # 反向不成立：判定在双端一致（同一对印记，结果确定）
        assert not happens_before(clock_b.stamp(), sent_stamp)

    def test_concurrent_ticks_tie_broken_deterministically(
        self, device_dirs: tuple[Path, Path]
    ) -> None:
        """双方各自 tick（无 merge）产生同 lamport 并发印记：deviceId 决胜，
        且决胜结果与判定方向无关（双端一致）。"""
        dir_a, dir_b = device_dirs
        clock_a = LamportClock(dir_a)
        clock_b = LamportClock(dir_b)
        clock_a.tick()
        clock_b.tick()
        assert clock_a.value == clock_b.value == 1  # lamport 平局

        forward = compare(clock_a.stamp(), clock_b.stamp())
        assert forward != 0  # 全序下必有先后
        assert forward == -compare(clock_b.stamp(), clock_a.stamp())  # 双端一致
        assert happens_before(clock_a.stamp(), clock_b.stamp()) == (forward < 0)

    def test_random_interleaving_properties(self, device_dirs: tuple[Path, Path]) -> None:
        """随机交错性质：时钟单调只增；双方终值均不小于各自历史；终值印记
        全序判定双端一致且非零。"""
        dir_a, dir_b = device_dirs
        clock_a = LamportClock(dir_a)
        clock_b = LamportClock(dir_b)
        rng = random.Random(20260721)
        for _ in range(200):
            side = rng.choice(("a", "b"))
            clock = clock_a if side == "a" else clock_b
            before = clock.value
            if rng.random() < 0.5:
                clock.tick()
            else:
                other = clock_b if side == "a" else clock_a
                clock.merge(other.value)
            assert clock.value > before  # 单调只增（merge 恒为 max+1）
        # 一次完整互并（a 并 b → b 并 a）后双方时钟相邻、最后合并方领先 1，
        # 且双方均不低于互并前各自值——交错合并收敛到确定的相邻终态
        value_a, value_b = clock_a.value, clock_b.value
        clock_a.merge(clock_b.value)
        clock_b.merge(clock_a.value)
        assert clock_a.value >= max(value_a, value_b)
        assert clock_b.value == clock_a.value + 1
        assert happens_before(clock_a.stamp(), clock_b.stamp())
        # 全序判定双端一致（同一对印记，两方向结果互逆）
        assert compare(clock_a.stamp(), clock_b.stamp()) == -compare(
            clock_b.stamp(), clock_a.stamp()
        )


class TestPersistence:
    """tick / merge 后落盘，模拟重启不回退（B1 验收第 3 条）。"""

    def test_tick_persists_to_config(self, device_dirs: tuple[Path, Path]) -> None:
        dir_a, _ = device_dirs
        clock = LamportClock(dir_a)
        clock.tick()
        clock.tick()
        assert load_config(dir_a).lamport == 2

    def test_merge_persists_to_config(self, device_dirs: tuple[Path, Path]) -> None:
        dir_a, _ = device_dirs
        clock = LamportClock(dir_a)
        clock.merge(41)
        assert load_config(dir_a).lamport == 42

    def test_restart_never_regresses(self, device_dirs: tuple[Path, Path]) -> None:
        """模拟进程重启（重新 load）：时钟续走不回退，deviceId 不变。"""
        dir_a, _ = device_dirs
        clock = LamportClock(dir_a)
        clock.tick()
        clock.tick()
        clock.merge(10)  # 11

        restarted = LamportClock(dir_a)  # 模拟重启
        assert restarted.value == 11
        assert restarted.device_id == clock.device_id
        assert restarted.tick() == 12  # 续走而非从 0 回退
        assert LamportClock(dir_a).value == 12  # 再次重启仍续走

    def test_persistence_keeps_other_config_fields(
        self, device_dirs: tuple[Path, Path]
    ) -> None:
        """时钟落盘只动 lamport 字段，deviceId / sync.enabled 等不受影响。"""
        dir_a, _ = device_dirs
        clock = LamportClock(dir_a)
        clock.tick()
        doc = json.loads(config_path(dir_a).read_text(encoding="utf-8"))
        assert doc["lamport"] == 1
        assert doc["deviceId"] == clock.device_id
        assert doc["sync"] == {"enabled": False}
        assert doc["version"] == 1

    def test_atomic_write_leaves_no_tmp_files(self, device_dirs: tuple[Path, Path]) -> None:
        dir_a, _ = device_dirs
        clock = LamportClock(dir_a)
        for _ in range(3):
            clock.tick()
        assert list(config_path(dir_a).parent.glob("*.tmp")) == []

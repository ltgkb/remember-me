"""sync.paths 目录约定测试 — 对应迭代计划 A1 验收：.sync/ 统一落点 + 环境隔离。"""

from __future__ import annotations

from pathlib import Path

from memory_engine.crypto.keystore import KEYSTORE_FILENAME
from memory_engine.sync import paths


class TestSyncDirResolution:
    """.sync/ 根目录解析：环境变量隔离零成本，显式参数优先。"""

    def test_sync_dir_follows_env(self, tmp_data_dir: Path) -> None:
        """REMEMBER_ME_DATA_DIR 指向临时目录时，.sync/ 落在其下。"""
        assert paths.sync_dir() == tmp_data_dir / ".sync"

    def test_explicit_data_dir_overrides_env(self, tmp_data_dir: Path, tmp_path: Path) -> None:
        """显式 data_dir 参数优先于环境变量。"""
        other = tmp_path / "other-data"
        assert paths.sync_dir(other) == other / ".sync"
        assert paths.manifest_path(other) == other / ".sync" / "manifest.json"


class TestArtifactPaths:
    """全部同步产物统一落在 .sync/ 下（A1 验收第 1 条）。"""

    def test_artifact_paths(self, tmp_data_dir: Path) -> None:
        base = tmp_data_dir / ".sync"
        assert paths.manifest_path() == base / "manifest.json"
        assert paths.manifest_mac_path() == base / "manifest.json.sig"
        assert paths.config_path() == base / "config.json"
        assert paths.queue_dir() == base / "queue"
        assert paths.keystore_path() == base / "keystore.enc"

    def test_all_artifacts_under_sync_dir(self, tmp_data_dir: Path) -> None:
        for artifact in (
            paths.manifest_path(),
            paths.manifest_mac_path(),
            paths.config_path(),
            paths.queue_dir(),
            paths.keystore_path(),
        ):
            assert artifact.parent == paths.sync_dir() or artifact == paths.queue_dir()

    def test_keystore_filename_reexport_consistency(self) -> None:
        """paths 重导出的常量与 crypto.keystore 单一事实源一致。"""
        assert paths.KEYSTORE_FILENAME == KEYSTORE_FILENAME == "keystore.enc"

    def test_corrupted_backup_dir_naming(self, tmp_data_dir: Path) -> None:
        d = paths.corrupted_backup_dir("20260721T103000Z")
        assert d == tmp_data_dir / ".sync" / "corrupted-20260721T103000Z"
        assert d.name.startswith(paths.CORRUPTED_DIR_PREFIX)


class TestEnsureSyncDir:
    """ensure_sync_dir：创建幂等、支持嵌套、显式目录优先。"""

    def test_creates_and_idempotent(self, tmp_data_dir: Path) -> None:
        first = paths.ensure_sync_dir()
        assert first.is_dir()
        assert paths.ensure_sync_dir() == first

    def test_explicit_nested_data_dir(self, tmp_path: Path) -> None:
        target = tmp_path / "nested" / "data"
        assert paths.ensure_sync_dir(target) == target / ".sync"
        assert (target / ".sync").is_dir()

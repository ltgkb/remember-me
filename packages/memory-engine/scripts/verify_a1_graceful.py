# -*- coding: utf-8 -*-
"""A1 验证：PersistentClient 失败时 (1) 抛 SemanticSearchError 而非原始异常，
(2) SharedSystemClient 注册表被清理，重试不再出现 KeyError。
在 3.14 venv 下运行，数据源指向损坏的 vector_db。
"""
import sys
import traceback
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))

from memory_engine.vector_index import SemanticSearchError, VectorIndex

broken_dir = Path(r"C:\Users\linbi\AppData\Local\Temp\rm_broken_db")
print(f"[setup] data_dir={broken_dir}")

ok = True

# ---- 第 1 次尝试：应抛 SemanticSearchError ----
try:
    VectorIndex(data_dir=broken_dir, preload=True)
    print("[FAIL] 第 1 次尝试未抛异常（预期 SemanticSearchError）")
    ok = False
except SemanticSearchError as exc:
    print(f"[PASS] 第 1 次尝试抛出 SemanticSearchError: {exc}")
except Exception as exc:  # noqa: BLE001
    print(f"[FAIL] 第 1 次尝试抛出未包装异常 {type(exc).__name__}: {exc}")
    traceback.print_exc()
    ok = False

# ---- 检查注册表是否清理干净 ----
try:
    from chromadb.api.shared_system_client import SharedSystemClient

    residue = dict(SharedSystemClient._identifier_to_system)
    refcounts = dict(SharedSystemClient._identifier_to_refcount)
    if residue or refcounts:
        print(f"[FAIL] 注册表残留: systems={list(residue)} refcounts={refcounts}")
        ok = False
    else:
        print("[PASS] SharedSystemClient 注册表无残留（system/refcount 均已清理）")
except Exception as exc:  # noqa: BLE001
    print(f"[WARN] 无法检查注册表: {exc}")

# ---- 第 2 次尝试：模拟 07-17 的后续请求，不应出现 KeyError ----
try:
    VectorIndex(data_dir=broken_dir, preload=True)
    print("[FAIL] 第 2 次尝试未抛异常")
    ok = False
except SemanticSearchError as exc:
    print(f"[PASS] 第 2 次尝试仍为 SemanticSearchError（无 KeyError 穿透）: {exc}")
except KeyError as exc:
    print(f"[FAIL] 第 2 次尝试出现 KeyError（注册表残留未清理）: {exc}")
    ok = False
except Exception as exc:  # noqa: BLE001
    print(f"[FAIL] 第 2 次尝试抛出未包装异常 {type(exc).__name__}: {exc}")
    ok = False

print("RESULT:", "ALL PASS" if ok else "FAILED")
sys.exit(0 if ok else 1)

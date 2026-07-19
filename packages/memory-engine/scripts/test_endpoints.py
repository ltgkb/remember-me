#!/usr/bin/env python3
"""Test memory-engine HTTP endpoints"""
import sys
import urllib.request
import json

# Windows CI 控制台默认 cp1252，打印中文会 UnicodeEncodeError；强制 UTF-8 输出
for _stream in (sys.stdout, sys.stderr):
    try:
        _stream.reconfigure(encoding="utf-8", errors="replace")
    except (AttributeError, ValueError):
        pass

BASE = "http://127.0.0.1:8765"

def test_health():
    req = urllib.request.Request(f"{BASE}/health", method="GET")
    with urllib.request.urlopen(req, timeout=5) as resp:
        data = json.loads(resp.read().decode("utf-8"))
        print("=== /health ===")
        print(json.dumps(data, ensure_ascii=False, indent=2))
        assert data.get("status") == "ok", "health check failed"
        assert "service" in data
        assert "version" in data
        print("[PASS] Fields ok: status, service, version")
        print()

def test_extract():
    body = json.dumps({
        "text": "We decided to use Python 3.11 as runtime. TODO: finish OAuth2 auth unit tests. Architect suggests using FastAPI instead of Flask.",
        "include_insights": True,
        "min_confidence": 0.0
    }, ensure_ascii=False).encode("utf-8")
    req = urllib.request.Request(
        f"{BASE}/extract",
        data=body,
        headers={"Content-Type": "application/json"},
        method="POST"
    )
    with urllib.request.urlopen(req, timeout=10) as resp:
        data = json.loads(resp.read().decode("utf-8"))
        print("=== /extract ===")
        print(json.dumps(data, ensure_ascii=False, indent=2))
        assert "count" in data
        assert "results" in data
        assert isinstance(data["results"], list)
        for r in data["results"]:
            assert "type" in r, f"Missing type field: {r}"
            assert "raw_text" in r, f"Missing raw_text field: {r}"
            assert "confidence" in r, f"Missing confidence field: {r}"
        if "insights" in data:
            for i in data["insights"]:
                assert "category" in i
                assert "summary" in i
                assert "severity" in i
        print(f"[PASS] Fields ok: type, raw_text, confidence (total {data['count']} items)")
        print()

def test_search():
    body = json.dumps({
        "keyword": "Python",
        "max_results": 5
    }, ensure_ascii=False).encode("utf-8")
    req = urllib.request.Request(
        f"{BASE}/search",
        data=body,
        headers={"Content-Type": "application/json"},
        method="POST"
    )
    with urllib.request.urlopen(req, timeout=10) as resp:
        data = json.loads(resp.read().decode("utf-8"))
        print("=== /search ===")
        print(json.dumps(data, ensure_ascii=False, indent=2))
        assert "keyword" in data
        assert "matches" in data
        assert isinstance(data["matches"], list)
        for m in data["matches"]:
            assert "file" in m, f"Missing file field: {m}"
            assert "line" in m, f"Missing line field: {m}"
            assert "snippet" in m, f"Missing snippet field: {m}"
        print(f"[PASS] Fields ok: file, line, snippet (total {data['match_count']} items)")
        print()


def test_semantic_index():
    """触发批量索引，为后续语义搜索准备数据。"""
    body = json.dumps({}).encode("utf-8")
    req = urllib.request.Request(
        f"{BASE}/semantic-index",
        data=body,
        headers={"Content-Type": "application/json"},
        method="POST"
    )
    try:
        with urllib.request.urlopen(req, timeout=120) as resp:
            data = json.loads(resp.read().decode("utf-8"))
            print("=== /semantic-index ===")
            print(json.dumps(data, ensure_ascii=False, indent=2))
            assert "total_memories" in data
            print(f"[PASS] Indexed {data['total_memories']} memories")
            print()
            return True
    except urllib.error.HTTPError as exc:
        # 503 表示语义搜索不可用（依赖未安装），属预期降级
        print("=== /semantic-index ===")
        print(f"[SKIP] 语义索引不可用 (HTTP {exc.code})，跳过语义搜索测试")
        print()
        return False


def test_semantic_search():
    """验证 /semantic-search 字段完整性。"""
    body = json.dumps({
        "query": "用户登录认证方式",
        "top_k": 5,
        "threshold": 0.0
    }, ensure_ascii=False).encode("utf-8")
    req = urllib.request.Request(
        f"{BASE}/semantic-search",
        data=body,
        headers={"Content-Type": "application/json"},
        method="POST"
    )
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            data = json.loads(resp.read().decode("utf-8"))
            print("=== /semantic-search ===")
            print(json.dumps(data, ensure_ascii=False, indent=2))
            assert "query" in data
            assert "results" in data
            assert isinstance(data["results"], list)
            assert "total" in data
            assert "latency_ms" in data
            for r in data["results"]:
                assert "id" in r, f"Missing id field: {r}"
                assert "text" in r, f"Missing text field: {r}"
                assert "score" in r, f"Missing score field: {r}"
                assert "metadata" in r, f"Missing metadata field: {r}"
            print(f"[PASS] Fields ok: id, text, score, metadata (total {data['total']} items)")
            print()
    except urllib.error.HTTPError as exc:
        if exc.code == 503:
            print("=== /semantic-search ===")
            payload = json.loads(exc.read().decode("utf-8"))
            assert "error" in payload
            assert "fallback" in payload, "降级响应应包含 fallback 字段"
            print(f"[PASS] 降级响应正确 (HTTP 503): {payload['error']}")
            print()
        else:
            raise


def test_semantic_search_bad_request():
    """验证 /semantic-search 缺少 query 时返回 400。"""
    body = json.dumps({"top_k": 5}).encode("utf-8")
    req = urllib.request.Request(
        f"{BASE}/semantic-search",
        data=body,
        headers={"Content-Type": "application/json"},
        method="POST"
    )
    try:
        urllib.request.urlopen(req, timeout=10)
        raise AssertionError("应返回 400")
    except urllib.error.HTTPError as exc:
        assert exc.code == 400, f"期望 400，实际 {exc.code}"
        payload = json.loads(exc.read().decode("utf-8"))
        assert "error" in payload
        print("=== /semantic-search (bad request) ===")
        print(f"[PASS] 缺少 query 返回 400: {payload['error']}")
        print()


def test_hybrid_search():
    """验证 /hybrid-search 字段完整性与 RRF 排序合理性。"""
    body = json.dumps({
        "query": "Python 运行时",
        "top_k": 5,
        "keyword_weight": 0.3,
        "semantic_weight": 0.7
    }, ensure_ascii=False).encode("utf-8")
    req = urllib.request.Request(
        f"{BASE}/hybrid-search",
        data=body,
        headers={"Content-Type": "application/json"},
        method="POST"
    )
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            data = json.loads(resp.read().decode("utf-8"))
            print("=== /hybrid-search ===")
            print(json.dumps(data, ensure_ascii=False, indent=2))
            assert "query" in data
            assert "results" in data
            assert isinstance(data["results"], list)
            assert "total" in data
            assert "latency_ms" in data
            for r in data["results"]:
                assert "id" in r, f"Missing id field: {r}"
                assert "text" in r, f"Missing text field: {r}"
                assert "score" in r, f"Missing score field: {r}"
                assert "metadata" in r, f"Missing metadata field: {r}"
                assert "hybrid_scores" in r, f"Missing hybrid_scores field: {r}"
                hs = r["hybrid_scores"]
                assert "keyword" in hs, f"Missing keyword score: {hs}"
                assert "semantic" in hs, f"Missing semantic score: {hs}"
                assert "rrf" in hs, f"Missing rrf score: {hs}"
            # RRF 排序合理性：score 应降序排列
            scores = [r["score"] for r in data["results"]]
            for i in range(1, len(scores)):
                assert scores[i - 1] >= scores[i] - 1e-6, "RRF 排序未按 score 降序"
            print(f"[PASS] Fields ok: id, text, score, metadata, hybrid_scores (total {data['total']} items)")
            print()
    except urllib.error.HTTPError as exc:
        if exc.code == 503:
            print("=== /hybrid-search ===")
            payload = json.loads(exc.read().decode("utf-8"))
            assert "error" in payload
            print(f"[PASS] 降级响应正确 (HTTP 503): {payload['error']}")
            print()
        else:
            raise


def test_hybrid_search_degrades_to_semantic():
    """当 keyword_weight=0 时，混合搜索退化为纯语义搜索。"""
    body = json.dumps({
        "query": "用户登录认证方式",
        "top_k": 5,
        "keyword_weight": 0,
        "semantic_weight": 1
    }, ensure_ascii=False).encode("utf-8")
    req = urllib.request.Request(
        f"{BASE}/hybrid-search",
        data=body,
        headers={"Content-Type": "application/json"},
        method="POST"
    )
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            data = json.loads(resp.read().decode("utf-8"))
            print("=== /hybrid-search (degrade to semantic) ===")
            print(json.dumps(data, ensure_ascii=False, indent=2))
            assert "results" in data
            for r in data["results"]:
                hs = r.get("hybrid_scores", {})
                # 退化到语义搜索时，keyword 分数应为 0
                assert hs.get("keyword", 0) == 0, f"keyword_weight=0 时应无关键词分数，got {hs}"
                assert "semantic" in hs, f"Missing semantic score: {hs}"
            print(f"[PASS] keyword_weight=0 时正确退化为语义搜索 (total {data['total']} items)")
            print()
    except urllib.error.HTTPError as exc:
        if exc.code == 503:
            print("=== /hybrid-search (degrade to semantic) ===")
            payload = json.loads(exc.read().decode("utf-8"))
            assert "error" in payload
            print(f"[PASS] 降级响应正确 (HTTP 503): {payload['error']}")
            print()
        else:
            raise


if __name__ == "__main__":
    test_health()
    test_extract()
    test_search()
    # 语义搜索测试：先尝试建索引，若依赖不可用则验证降级路径
    index_ok = test_semantic_index()
    test_semantic_search()
    test_semantic_search_bad_request()
    test_hybrid_search()
    test_hybrid_search_degrades_to_semantic()
    print("All endpoint tests passed!")

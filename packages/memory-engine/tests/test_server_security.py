"""Security and boundary tests for the localhost HTTP service."""

from __future__ import annotations

import json
import threading
import urllib.error
import urllib.request
from collections.abc import Iterator
from http.server import HTTPServer
from pathlib import Path

import pytest

from memory_engine.server import (
    MAX_REQUEST_BODY_BYTES,
    _RequestHandler,
    _resolve_backup_target,
    _resolve_project_root,
)


@pytest.fixture
def local_server() -> Iterator[str]:
    server = HTTPServer(("127.0.0.1", 0), _RequestHandler)
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    host, port = server.server_address
    try:
        yield f"http://{host}:{port}"
    finally:
        server.shutdown()
        server.server_close()
        thread.join(timeout=2)


def _error_payload(request: urllib.request.Request) -> tuple[int, dict[str, object], object]:
    with pytest.raises(urllib.error.HTTPError) as captured:
        urllib.request.urlopen(request, timeout=3)
    response = captured.value
    return response.code, json.loads(response.read().decode("utf-8")), response.headers


def test_project_search_root_uses_projects_directory(tmp_path: Path) -> None:
    root = _resolve_project_root(tmp_path, "Team Flow")
    assert root == (tmp_path / "projects" / "team-flow").resolve()


def test_project_traversal_cannot_escape_data_root(tmp_path: Path) -> None:
    root = _resolve_project_root(tmp_path, "../../outside")
    root.relative_to(tmp_path.resolve())
    assert root == (tmp_path / "projects" / "outside").resolve()


def test_backup_target_rejects_paths_outside_data_root(tmp_path: Path) -> None:
    with pytest.raises(ValueError, match="数据目录"):
        _resolve_backup_target(tmp_path, str(tmp_path.parent / "secret.json"))


def test_backup_target_accepts_relative_memory_path(tmp_path: Path) -> None:
    target = _resolve_backup_target(tmp_path, "projects/demo/context.json")
    assert target == (tmp_path / "projects" / "demo" / "context.json").resolve()


def test_browser_origin_is_rejected_without_cors_headers(local_server: str) -> None:
    request = urllib.request.Request(
        f"{local_server}/health",
        headers={"Origin": "https://attacker.example"},
        method="GET",
    )
    status, payload, headers = _error_payload(request)
    assert status == 403
    assert "跨域" in str(payload["error"])
    assert headers.get("Access-Control-Allow-Origin") is None


def test_post_requires_json_content_type(local_server: str) -> None:
    request = urllib.request.Request(
        f"{local_server}/extract",
        data=b"text=hello",
        headers={"Content-Type": "application/x-www-form-urlencoded"},
        method="POST",
    )
    status, _, _ = _error_payload(request)
    assert status == 415


def test_oversized_body_is_rejected_before_read(local_server: str) -> None:
    request = urllib.request.Request(
        f"{local_server}/extract",
        data=b"{}",
        headers={
            "Content-Type": "application/json",
            "Content-Length": str(MAX_REQUEST_BODY_BYTES + 1),
        },
        method="POST",
    )
    status, payload, _ = _error_payload(request)
    assert status == 413
    assert "限制" in str(payload["error"])


def test_invalid_json_returns_400(local_server: str) -> None:
    request = urllib.request.Request(
        f"{local_server}/extract",
        data=b"not-json",
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    status, payload, _ = _error_payload(request)
    assert status == 400
    assert "JSON" in str(payload["error"])

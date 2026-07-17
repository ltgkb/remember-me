"""命令行接口 — 提供信息提取、语义搜索和备份列表功能。"""

from __future__ import annotations

import argparse
import gzip
import json
import os
import sys
from pathlib import Path
from typing import Sequence

from .extractor import ExtractedInfo, InfoExtractor


# ---------------------------------------------------------------------------
# 常量
# ---------------------------------------------------------------------------
DEFAULT_DATA_DIR = Path.home() / ".remember-me"


def _data_dir() -> Path:
    """返回 Remember Me 数据目录，支持环境变量覆盖。"""
    env = os.getenv("REMEMBER_ME_DATA_DIR")
    if env:
        return Path(env)
    return DEFAULT_DATA_DIR


def _read_json_conversation(path: Path) -> list[dict[str, str]]:
    """读取 JSON 对话文件，支持普通 JSON 和 JSON Lines 格式。

    Args:
        path: 对话文件路径。

    Returns:
        消息对象列表，每个对象至少包含 ``role`` 和 ``content`` 字段。

    Raises:
        SystemExit: 文件不存在或格式错误时以错误码退出。
    """
    try:
        raw = path.read_text(encoding="utf-8")
    except FileNotFoundError:
        print(f"错误: 文件不存在 — {path}", file=sys.stderr)
        sys.exit(1)
    except PermissionError:
        print(f"错误: 无权限读取文件 — {path}", file=sys.stderr)
        sys.exit(1)
    except OSError as exc:
        print(f"错误: 读取文件失败 — {exc}", file=sys.stderr)
        sys.exit(1)

    # 尝试标准 JSON 数组
    try:
        data = json.loads(raw)
        if isinstance(data, list):
            return data
        if isinstance(data, dict):
            # 可能是 { "messages": [...] } 的包装格式
            if "messages" in data and isinstance(data["messages"], list):
                return data["messages"]
            # 单条消息
            return [data]
    except json.JSONDecodeError:
        pass

    # 尝试 JSON Lines
    messages: list[dict[str, str]] = []
    for line_num, line in enumerate(raw.splitlines(), start=1):
        line = line.strip()
        if not line:
            continue
        try:
            obj = json.loads(line)
            if isinstance(obj, dict):
                messages.append(obj)
        except json.JSONDecodeError:
            print(
                f"警告: 第 {line_num} 行不是有效 JSON，已跳过",
                file=sys.stderr,
            )

    if not messages:
        print("错误: 无法解析任何有效消息", file=sys.stderr)
        sys.exit(1)

    return messages


def _extract_text_from_messages(messages: list[dict[str, str]]) -> str:
    """从消息列表中提取可分析的文本内容。"""
    parts: list[str] = []
    for msg in messages:
        if isinstance(msg, dict):
            content = msg.get("content", "")
            if isinstance(content, str) and content.strip():
                parts.append(content.strip())
    return "\n\n".join(parts)


# ---------------------------------------------------------------------------
# 子命令实现
# ---------------------------------------------------------------------------

def extract_cmd(argv: Sequence[str] | None = None) -> None:
    """从 JSON 对话文件中提取关键信息并输出 JSON。

    用法::

        remember-me-extract <conversation-file>
    """
    parser = argparse.ArgumentParser(
        prog="remember-me-extract",
        description="从对话 JSON 文件中提取关键信息",
    )
    parser.add_argument(
        "file",
        type=Path,
        help="JSON 对话文件路径（支持标准 JSON 数组或 JSON Lines）",
    )
    parser.add_argument(
        "--insights",
        action="store_true",
        help="同时输出聚合洞察",
    )
    parser.add_argument(
        "--min-confidence",
        type=float,
        default=0.0,
        metavar="FLOAT",
        help="置信度阈值，低于此值的结果将被过滤 (默认: 0.0)",
    )
    args = parser.parse_args(argv)

    messages = _read_json_conversation(args.file)
    text = _extract_text_from_messages(messages)

    extractor = InfoExtractor()
    extracted = extractor.extract(text)

    if args.min_confidence > 0:
        extracted = [e for e in extracted if e.confidence >= args.min_confidence]

    output: dict[str, object] = {
        "source": str(args.file.resolve()),
        "message_count": len(messages),
        "extracted_count": len(extracted),
        "results": [
            {
                "type": e.type,
                "raw_text": e.raw_text,
                "suggested_title": e.suggested_title,
                "confidence": e.confidence,
            }
            for e in extracted
        ],
    }

    if args.insights:
        insights = extractor.generate_insights(extracted)
        output["insights"] = [
            {
                "category": i.category,
                "summary": i.summary,
                "related_indices": i.related_indices,
                "severity": i.severity,
            }
            for i in insights
        ]

    print(json.dumps(output, ensure_ascii=False, indent=2))


def search_cmd(argv: Sequence[str] | None = None) -> None:
    """在 ``~/.remember-me/`` 中搜索关键词。

    用法::

        remember-me-search <keyword> [--project <name>]
    """
    parser = argparse.ArgumentParser(
        prog="remember-me-search",
        description="在 Remember Me 数据目录中搜索关键词",
    )
    parser.add_argument("keyword", help="搜索关键词（不区分大小写）")
    parser.add_argument(
        "--project",
        type=str,
        default=None,
        help="限制在指定项目子目录中搜索",
    )
    parser.add_argument(
        "--max-results",
        type=int,
        default=50,
        metavar="N",
        help="最多返回的匹配数 (默认: 50)",
    )
    args = parser.parse_args(argv)

    data_dir = _data_dir()
    search_root = data_dir
    if args.project:
        search_root = data_dir / args.project

    if not search_root.exists():
        print(f"错误: 数据目录不存在 — {search_root}", file=sys.stderr)
        sys.exit(1)

    keyword_lower = args.keyword.lower()
    matches: list[dict[str, object]] = []

    # 递归遍历 JSON 文件（包括 .json.gz）
    files = list(search_root.rglob("*.json")) + list(search_root.rglob("*.json.gz"))

    for file_path in files:
        if len(matches) >= args.max_results:
            break

        try:
            if file_path.suffixes == [".json", ".gz"]:
                with gzip.open(file_path, "rt", encoding="utf-8") as f:
                    raw = f.read()
            else:
                raw = file_path.read_text(encoding="utf-8")
        except (OSError, gzip.BadGzipFile) as exc:
            print(f"警告: 跳过无法读取的文件 {file_path} — {exc}", file=sys.stderr)
            continue

        # 简单行级搜索
        for line_num, line in enumerate(raw.splitlines(), start=1):
            if keyword_lower in line.lower():
                # 截取上下文
                snippet = line.strip()
                if len(snippet) > 200:
                    # 尝试定位关键词位置并截取周围文本
                    idx = snippet.lower().find(keyword_lower)
                    start = max(0, idx - 80)
                    end = min(len(snippet), idx + len(args.keyword) + 80)
                    snippet = snippet[start:end]
                    if start > 0:
                        snippet = "..." + snippet
                    if end < len(line.strip()):
                        snippet = snippet + "..."

                matches.append(
                    {
                        "file": str(file_path.relative_to(search_root)),
                        "line": line_num,
                        "snippet": snippet,
                    }
                )
                if len(matches) >= args.max_results:
                    break

    output = {
        "keyword": args.keyword,
        "search_root": str(search_root.resolve()),
        "files_scanned": len(files),
        "match_count": len(matches),
        "matches": matches,
    }
    print(json.dumps(output, ensure_ascii=False, indent=2))


def backup_list_cmd(argv: Sequence[str] | None = None) -> None:
    """列出指定文件的备份历史。

    用法::

        remember-me-backup-list <file-path>
    """
    parser = argparse.ArgumentParser(
        prog="remember-me-backup-list",
        description="列出指定文件的备份历史",
    )
    parser.add_argument("file", type=Path, help="目标文件路径")
    parser.add_argument(
        "--backups-dir",
        type=Path,
        default=None,
        metavar="DIR",
        help="自定义备份目录（默认: 与目标文件同级的 .backups/）",
    )
    args = parser.parse_args(argv)

    target = args.file.resolve()
    if not target.exists():
        print(f"错误: 目标文件不存在 — {target}", file=sys.stderr)
        sys.exit(1)

    if args.backups_dir:
        backups_dir = args.backups_dir.resolve()
    else:
        backups_dir = target.parent / ".backups"

    if not backups_dir.exists():
        print(json.dumps(
            {
                "target": str(target),
                "backups_dir": str(backups_dir),
                "backup_count": 0,
                "backups": [],
                "note": "备份目录不存在",
            },
            ensure_ascii=False,
            indent=2,
        ))
        return

    # 查找与目标文件同名的备份
    stem = target.stem
    suffix = target.suffix
    backups: list[dict[str, object]] = []

    for entry in backups_dir.iterdir():
        if not entry.is_file():
            continue
        # 匹配模式: filename.YYYYMMDD_HHMMSS.json 或 filename.json.1 等
        name = entry.name
        if not name.startswith(stem):
            continue

        try:
            stat = entry.stat()
            mtime = stat.st_mtime
            size = stat.st_size
        except OSError:
            continue

        import time

        backups.append(
            {
                "name": name,
                "path": str(entry.resolve()),
                "size_bytes": size,
                "modified": time.strftime(
                    "%Y-%m-%d %H:%M:%S", time.localtime(mtime)
                ),
                "timestamp": mtime,
            }
        )

    # 按修改时间降序排列
    backups.sort(key=lambda b: b["timestamp"], reverse=True)  # type: ignore[arg-type]

    print(json.dumps(
        {
            "target": str(target),
            "backups_dir": str(backups_dir),
            "backup_count": len(backups),
            "backups": backups,
        },
        ensure_ascii=False,
        indent=2,
    ))


def main(argv: Sequence[str] | None = None) -> None:
    """统一入口，根据第一个参数分发到子命令。

    供 ``python -m memory_engine`` 使用。
    """
    parser = argparse.ArgumentParser(
        prog="memory-engine",
        description="Remember Me — Python Memory Engine CLI",
    )
    parser.add_argument(
        "command",
        choices=["extract", "search", "backup-list"],
        help="要执行的子命令",
    )
    # 先解析 command，剩余参数传给子命令
    args, remaining = parser.parse_known_args(argv)

    if args.command == "extract":
        extract_cmd(remaining)
    elif args.command == "search":
        search_cmd(remaining)
    elif args.command == "backup-list":
        backup_list_cmd(remaining)


if __name__ == "__main__":
    main()

"""Find the project root, the agent token, and the part a .blend maps to.

The project root is the nearest folder above the file that holds `.nkata-agent/`. The agent
writes its token there. See docs/decisions.md."""

from __future__ import annotations

import os
from pathlib import Path
from typing import Any

AGENT_DIR = ".nkata-agent"
TOKEN_FILE = "token"
DEFAULT_AGENT_URL = "http://127.0.0.1:7420"


def agent_url() -> str:
    """The agent local API. NKATA_AGENT_URL overrides the fixed port for tests."""
    return os.environ.get("NKATA_AGENT_URL") or DEFAULT_AGENT_URL


def find_project_root(file_path: Path) -> Path | None:
    for parent in [file_path.parent, *file_path.parent.parents]:
        if (parent / AGENT_DIR).is_dir():
            return parent
    return None


def read_token(root: Path) -> str:
    override = os.environ.get("NKATA_AGENT_TOKEN")
    if override:
        return override
    return (root / AGENT_DIR / TOKEN_FILE).read_text(encoding="utf-8").strip()


def relative_file(root: Path, file_path: Path) -> str:
    """Project-relative path with forward slashes, the form the server stores in part mappings."""
    return file_path.resolve().relative_to(root.resolve()).as_posix()


def part_for_file(parts: list[dict[str, Any]], rel_file: str) -> dict[str, Any] | None:
    """The blend_collection part whose mapping file is this .blend. One part per file in v1
    (blend_layout one_file_per_part); with several, the first in asset order wins."""
    for part in parts:
        mapping = part.get("mapping") or {}
        if mapping.get("kind") == "blend_collection" and mapping.get("file") == rel_file:
            return part
    return None

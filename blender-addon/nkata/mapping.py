"""Find the project root, the agent token, and the part a .blend maps to.

The project root is the nearest folder above the file that holds `.nkata-agent/`. The agent
writes its token there. With no file open, the agent's pointer at ~/.nkata/agent.json names the
folder it serves, so the panel can list parts to start. See docs/decisions.md."""

from __future__ import annotations

import json
import os
from pathlib import Path
from typing import Any

AGENT_DIR = ".nkata-agent"
TOKEN_FILE = "token"
DEFAULT_AGENT_URL = "http://127.0.0.1:7420"
POINTER = Path(".nkata") / "agent.json"


def agent_url() -> str:
    """The agent local API. NKATA_AGENT_URL overrides the fixed port for tests."""
    return os.environ.get("NKATA_AGENT_URL") or DEFAULT_AGENT_URL


def find_project_root(file_path: Path) -> Path | None:
    for parent in [file_path.parent, *file_path.parent.parents]:
        if (parent / AGENT_DIR).is_dir():
            return parent
    return None


def current_project() -> Path | None:
    """The folder the running agent serves, when its pointer is readable and the token is there."""
    try:
        data = json.loads((Path.home() / POINTER).read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return None
    folder = Path(str(data.get("folder") or ""))
    return folder if folder.is_absolute() and (folder / AGENT_DIR / TOKEN_FILE).is_file() else None


def project_root_for_panel() -> Path | None:
    """The open file's project, else the running agent's."""
    import bpy

    if bpy.data.filepath:
        root = find_project_root(Path(bpy.data.filepath))
        if root is not None:
            return root
    return current_project()


def read_token(root: Path) -> str:
    override = os.environ.get("NKATA_AGENT_TOKEN")
    if override:
        return override
    return (root / AGENT_DIR / TOKEN_FILE).read_text(encoding="utf-8").strip()


def relative_file(root: Path, file_path: Path) -> str:
    """Project-relative path with forward slashes, the form the server stores in part mappings."""
    return file_path.resolve().relative_to(root.resolve()).as_posix()


def startable_parts(parts: list[dict[str, Any]], root: Path, me_id: str | None) -> list[dict[str, Any]]:
    """My Blender parts whose file is not on disk yet, in asset order. What the panel offers to
    start when no part is open."""
    out = []
    for part in parts:
        mapping = part.get("mapping") or {}
        if mapping.get("kind") != "blend_collection":
            continue
        owner = (part.get("owner") or {}).get("id")
        if me_id is not None and owner != me_id:
            continue
        if (root / str(mapping.get("file"))).exists():
            continue
        out.append(part)
    return out


def part_for_file(parts: list[dict[str, Any]], rel_file: str) -> dict[str, Any] | None:
    """The blend_collection part whose mapping file is this .blend. One part per file in v1
    (blend_layout one_file_per_part); with several, the first in asset order wins."""
    for part in parts:
        mapping = part.get("mapping") or {}
        if mapping.get("kind") == "blend_collection" and mapping.get("file") == rel_file:
            return part
    return None

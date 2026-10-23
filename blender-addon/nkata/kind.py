"""What an asset is on the v8 wall: an object that turns on the stage, or an environment that
shows its render. Decided on save, in this order (docs/tasks/v8-prompts.md, step 13):

1. The first subfolder under the project folder names it: Characters, Props, Vehicles,
   Environments and close variants.
2. An armature with skinned meshes is a character, which is an object.
3. A bounding box over 10 m on a side, or many separate objects spread on a floor, is an
   environment.
4. Else an object.

The artist can change it once in the panel; the pick is remembered per asset next to the file
(.nkata-exports/<asset>.nkata.json). Pure, so it runs without bpy."""

from __future__ import annotations

import json
from pathlib import Path

AssetKind = str  # "object" | "environment"

ENVIRONMENT_FOLDERS = ("environment", "environments", "env", "levels", "level", "areas", "sets", "world", "worlds")
OBJECT_FOLDERS = ("character", "characters", "char", "chars", "prop", "props", "vehicle", "vehicles", "weapons", "weapon", "items", "item")
BIG_M = 10.0
SPREAD_OBJECTS = 12
SPREAD_M = 6.0

Bounds = tuple[tuple[float, float, float], tuple[float, float, float]]


def group_of(rel_file: str) -> str | None:
    """The first subfolder under the project folder, or None for a file at the root."""
    parts = [p for p in rel_file.replace("\\", "/").split("/") if p]
    return parts[0] if len(parts) > 1 else None


def kind_from_group(group: str | None) -> AssetKind | None:
    if not group:
        return None
    g = group.strip().lower()
    if g in ENVIRONMENT_FOLDERS or g.startswith("environment") or g.startswith("level"):
        return "environment"
    if g in OBJECT_FOLDERS or g.startswith("character") or g.startswith("prop") or g.startswith("vehicle"):
        return "object"
    return None


def kind_from_scene(bounds: list[Bounds], skinned: bool) -> AssetKind:
    """From the meshes alone: a skinned rig is a character (an object); a big box or many
    objects spread on the floor is an environment; else an object."""
    if skinned:
        return "object"
    if not bounds:
        return "object"
    lo = [min(b[0][i] for b in bounds) for i in range(3)]
    hi = [max(b[1][i] for b in bounds) for i in range(3)]
    size = [hi[i] - lo[i] for i in range(3)]
    if max(size[0], size[1], size[2]) > BIG_M:
        return "environment"
    if len(bounds) >= SPREAD_OBJECTS and max(size[0], size[1]) > SPREAD_M:
        return "environment"
    return "object"


def decide(rel_file: str, bounds: list[Bounds], skinned: bool, remembered: AssetKind | None = None) -> AssetKind:
    """The kind for this save: the artist's pick, else the subfolder, else the scene."""
    if remembered in ("object", "environment"):
        return remembered
    from_group = kind_from_group(group_of(rel_file))
    return from_group or kind_from_scene(bounds, skinned)


EXPORT_DIR = ".nkata-exports"
"""Beside each .blend, the add-on's own files: the GLB, its manifest, the still and the kind the
artist picked. The sync ignores the folder (agent ignore.rs), so they never travel as project
files; the model and the still reach the team as the save's own (v8 step 16, item 3)."""


def export_path(blend: Path, suffix: str) -> Path:
    """<dir>/.nkata-exports/<stem><suffix>, the folder made on first use."""
    folder = blend.parent / EXPORT_DIR
    folder.mkdir(parents=True, exist_ok=True)
    return folder / f"{blend.stem}{suffix}"


def memory_path(blend: Path) -> Path:
    return export_path(blend, ".nkata.json")


def read_remembered(blend: Path) -> AssetKind | None:
    try:
        data = json.loads(memory_path(blend).read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return None
    kind = data.get("kind")
    return kind if kind in ("object", "environment") else None


def remember(blend: Path, kind: AssetKind) -> None:
    memory_path(blend).write_text(json.dumps({"v": 1, "kind": kind}, indent=2) + "\n", encoding="utf-8")

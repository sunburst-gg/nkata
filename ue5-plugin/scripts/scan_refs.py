"""Where a static mesh is placed: the levels that reference it and the actor count per level.

Args file: {v, asset_path}. Result: {ok, levels: [{level, actors}], referencers}.
The agent runs it after every static import and stores `levels` on the version as `refs`.
See docs/engineering.md, The mirror, Static. This is the one piece of the dependency map in v1.

EditorAssetLibrary.find_package_referencers_for_asset:
https://dev.epicgames.com/documentation/en-us/unreal-engine/python-api/class/EditorAssetLibrary
AssetRegistry.get_assets_by_package_name:
https://dev.epicgames.com/documentation/en-us/unreal-engine/python-api/class/AssetRegistry
"""

from __future__ import annotations

import os
import sys
from typing import Any

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from _result import emit, read_args  # noqa: E402

try:
    import unreal
except ImportError:  # pragma: no cover - only inside the editor
    unreal = None


def level_of(package: str) -> str | None:
    """The level package a referencer belongs to, or None when it is not a level.

    One File Per Actor stores each actor under <Level>/__ExternalActors__/..., so the level is
    the path before that marker. A plain level package references the mesh from its own name.
    """
    marker = "/__ExternalActors__/"
    if marker in package:
        return package.split(marker, 1)[0]
    registry = unreal.AssetRegistryHelpers.get_asset_registry()
    for data in registry.get_assets_by_package_name(unreal.Name(package)) or []:
        if str(data.asset_class_path.asset_name) == "World":
            return package
    return None


def scan(asset_path: str) -> tuple[list[dict[str, Any]], int]:
    refs = unreal.EditorAssetLibrary.find_package_referencers_for_asset(asset_path, True) or []
    counts: dict[str, int] = {}
    for ref in refs:
        level = level_of(str(ref))
        if level is None:
            continue
        counts[level] = counts.get(level, 0) + 1
    levels = [{"level": level, "actors": n} for level, n in sorted(counts.items())]
    return levels, len(refs)


def main(argv: list[str]) -> None:
    args = read_args(argv)
    if unreal is None:
        emit(False, "unreal module not available: run inside the editor")
        return
    asset_path = str(args["asset_path"])
    if not unreal.EditorAssetLibrary.does_asset_exist(asset_path):
        emit(False, "asset not found", asset_path=asset_path)
        return
    levels, total = scan(asset_path)
    emit(True, "", asset_path=asset_path, levels=levels, referencers=total)


if __name__ == "__main__":
    try:
        main(sys.argv)
    except Exception as e:  # noqa: BLE001 - the agent needs one line, whatever failed
        emit(False, f"{type(e).__name__}: {e}")

"""An environment saved in Blender, mirrored whole through USD (docs/tasks/v8-18-environment-mirror.md).

Called by the agent through Remote Control with one argument: a JSON args file
{v, mode, part_id, version_id, spool_path, destination_path, asset_name, expect, nanite_triangle_threshold}.
spool_path is the environment's .usdc. Two modes, as in the workflow studios use by hand:

- "stage", on every save: one USD Stage actor per environment in the open level, pointed at the
  file and reloaded. Nothing is imported. The stage only loads once its state is set to
  OPENED_AND_LOADED, and a reload is the root layer cleared and set again (measured on UE 5.8).
- "import", on Publish: the USD imported with its actors placed, under destination_path, one
  asset per identical mesh (share_assets_for_identical_prims), Nanite above the threshold.

Either way the script counts the static meshes that arrived against the manifest's objects.

Python API: https://dev.epicgames.com/documentation/en-us/unreal-engine/python-api/class/UsdStageActor
https://dev.epicgames.com/documentation/en-us/unreal-engine/python-api/class/UsdStageImportOptions
"""

from __future__ import annotations

import os
import sys
import time
from typing import Any

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from _result import emit, read_args  # noqa: E402

try:
    import unreal
except ImportError:  # pragma: no cover - only inside the editor
    unreal = None

STAGE_TAG = "nkata.stage"
DEFAULT_NANITE_THRESHOLD = 500_000


def stage_label(asset_name: str) -> str:
    return f"Nkata {asset_name}"


def mesh_shortfall(expected: int, arrived: int) -> str:
    """The plain line when fewer meshes arrived than the export held, else empty."""
    if arrived >= expected:
        return ""
    missing = expected - arrived
    return f"{missing} of {expected} meshes not in Unreal."


def _actors() -> Any:
    return unreal.get_editor_subsystem(unreal.EditorActorSubsystem) or unreal.EditorLevelLibrary


def find_stage(asset_name: str) -> Any | None:
    """The environment's stage actor in the open level, by its tag and label."""
    label = stage_label(asset_name)
    for actor in _actors().get_all_level_actors():
        if isinstance(actor, unreal.UsdStageActor) and actor.actor_has_tag(STAGE_TAG) and actor.get_actor_label() == label:
            return actor
    return None


def stage(args: dict[str, Any]) -> dict[str, Any]:
    asset_name = str(args["asset_name"])
    actor = find_stage(asset_name)
    first = actor is None
    if actor is None:
        actor = _actors().spawn_actor_from_class(unreal.UsdStageActor, unreal.Vector(0, 0, 0))
        actor.set_actor_label(stage_label(asset_name))
        actor.tags = [*actor.tags, unreal.Name(STAGE_TAG)]
    actor.set_share_assets_for_identical_prims(True)
    actor.set_root_layer("")
    actor.set_root_layer(str(args["spool_path"]))
    actor.set_stage_state(unreal.UsdStageState.OPENED_AND_LOADED)
    root = actor.root_component
    kids = root.get_children_components(True) if root is not None else []
    meshes = sum(1 for c in kids if isinstance(c, unreal.StaticMeshComponent))
    lights = sum(1 for c in kids if isinstance(c, unreal.LightComponent))
    return {"first": first, "meshes": meshes, "lights": lights, "actor": actor.get_path_name()}


def import_all(args: dict[str, Any]) -> dict[str, Any]:
    options = unreal.UsdStageImportOptions()
    options.import_actors = True
    options.import_geometry = True
    options.import_materials = True
    options.share_assets_for_identical_prims = True
    options.nanite_triangle_threshold = int(args.get("nanite_triangle_threshold") or DEFAULT_NANITE_THRESHOLD)
    task = unreal.AssetImportTask()
    task.filename = str(args["spool_path"])
    task.destination_path = str(args["destination_path"])
    task.automated = True
    task.replace_existing = True
    task.save = True
    task.options = options
    unreal.AssetToolsHelpers.get_asset_tools().import_asset_tasks([task])
    assets = 0
    for path in unreal.EditorAssetLibrary.list_assets(str(args["destination_path"]), recursive=True):
        if isinstance(unreal.EditorAssetLibrary.load_asset(path), unreal.StaticMesh):
            assets += 1
    meshes = 0
    for actor in _actors().get_all_level_actors():
        meshes += len(actor.get_components_by_class(unreal.StaticMeshComponent))
    return {"mesh_assets": assets, "meshes": meshes, "imported": len(task.imported_object_paths or [])}


def main(argv: list[str]) -> None:
    started = time.monotonic()
    args = read_args(argv)
    if unreal is None:
        emit(False, "unreal module not available: run inside the editor")
        return
    mode = str(args.get("mode") or "stage")
    got = stage(args) if mode == "stage" else import_all(args)
    expected = int((args.get("expect") or {}).get("meshes") or 0)
    short = mesh_shortfall(expected, int(got["meshes"]))
    emit(not short, short, mode=mode, ms=int((time.monotonic() - started) * 1000), part_id=args.get("part_id"), version_id=args.get("version_id"), **got)


if __name__ == "__main__":
    try:
        main(sys.argv)
    except Exception as e:  # noqa: BLE001 - the agent needs one line, whatever failed
        emit(False, f"{type(e).__name__}: {e}")

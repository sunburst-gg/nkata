"""Import or reimport one part export into the editor, in place.

Called by the agent through Remote Control with one argument: a JSON args file
{v, part_id, version_id, spool_path, destination_path, asset_name, armature}.

Rules from docs/engineering.md, The mirror:
- AssetImportTask with replace_existing True, automated True, save True.
- First import sets the full options. A reimport passes the existing skeleton and physics
  asset so materials, skeleton, and physics are kept. Options do not change on reimport.
- Nothing is ever deleted from the mesh (MetaHuman DNA stays).

Python API: https://dev.epicgames.com/documentation/en-us/unreal-engine/python-api/
AssetImportTask: https://dev.epicgames.com/documentation/en-us/unreal-engine/python-api/class/AssetImportTask
FbxImportUI: https://dev.epicgames.com/documentation/en-us/unreal-engine/python-api/class/FbxImportUI

Step 0 (measure on the real Rising Sun character) has not run. The glTF options below follow
the documented Interchange pipeline classes and need a check in a real 5.4 editor. See
docs/decisions.md, open questions.
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


def find_existing(asset_path: str) -> Any | None:
    """The asset at destination_path/asset_name, or None on first import."""
    if not unreal.EditorAssetLibrary.does_asset_exist(asset_path):
        return None
    return unreal.EditorAssetLibrary.load_asset(asset_path)


def fbx_options(existing: Any | None) -> Any:
    """FbxImportUI. On reimport, pass the existing skeleton and physics asset."""
    ui = unreal.FbxImportUI()
    ui.automated_import_should_detect_type = existing is None
    ui.import_materials = existing is None
    ui.import_textures = existing is None
    ui.import_as_skeletal = isinstance(existing, unreal.SkeletalMesh) if existing is not None else True
    if isinstance(existing, unreal.SkeletalMesh):
        ui.mesh_type_to_import = unreal.FBXImportType.FBXIT_SKELETAL_MESH
        ui.skeleton = existing.skeleton
        ui.physics_asset = existing.physics_asset
        ui.create_physics_asset = False
        ui.skeletal_mesh_import_data.import_morph_targets = True
    elif isinstance(existing, unreal.StaticMesh):
        ui.mesh_type_to_import = unreal.FBXImportType.FBXIT_STATIC_MESH
    return ui


def gltf_options(existing: Any | None) -> Any | None:
    """Interchange pipeline for glTF. On reimport, keep the existing skeleton and physics asset.

    Returns None when the Interchange classes are not exposed, which lets the importer use the
    project defaults. The agent then still gets a result line.
    """
    pipeline_cls = getattr(unreal, "InterchangeGenericAssetsPipeline", None)
    if pipeline_cls is None:
        return None
    pipeline = pipeline_cls()
    if existing is None:
        return pipeline
    mesh = getattr(pipeline, "mesh_pipeline", None)
    if mesh is not None:
        mesh.import_materials = False if hasattr(mesh, "import_materials") else None
    skel = getattr(pipeline, "common_skeletal_meshes_and_animations_properties", None)
    if isinstance(existing, unreal.SkeletalMesh):
        if skel is not None and hasattr(skel, "skeleton"):
            skel.skeleton = existing.skeleton
        if mesh is not None and hasattr(mesh, "physics_asset"):
            mesh.physics_asset = existing.physics_asset
            if hasattr(mesh, "create_physics_asset"):
                mesh.create_physics_asset = False
    materials = getattr(pipeline, "material_pipeline", None)
    if materials is not None and hasattr(materials, "import_materials"):
        materials.import_materials = False
    return pipeline


def build_task(args: dict[str, Any], existing: Any | None) -> Any:
    task = unreal.AssetImportTask()
    task.filename = args["spool_path"]
    task.destination_path = args["destination_path"]
    task.destination_name = args["asset_name"]
    task.replace_existing = True
    task.automated = True
    task.save = True
    ext = os.path.splitext(args["spool_path"])[1].lower()
    options = fbx_options(existing) if ext == ".fbx" else gltf_options(existing)
    if options is not None:
        task.options = options
    return task


def refresh(asset_path: str) -> None:
    """Content Browser sees the new bytes and the package is marked dirty."""
    registry = unreal.AssetRegistryHelpers.get_asset_registry()
    registry.scan_paths_synchronous([os.path.dirname(asset_path)], True)
    asset = unreal.EditorAssetLibrary.load_asset(asset_path)
    if asset is not None:
        asset.modify()
        unreal.EditorAssetLibrary.sync_browser_to_objects([asset_path])


def main(argv: list[str]) -> None:
    started = time.monotonic()
    args = read_args(argv)
    if unreal is None:
        emit(False, "unreal module not available: run inside the editor")
        return
    asset_path = f"{args['destination_path']}/{args['asset_name']}"
    existing = find_existing(asset_path)
    task = build_task(args, existing)
    unreal.AssetToolsHelpers.get_asset_tools().import_asset_tasks([task])
    imported = list(task.imported_object_paths or [])
    if not imported:
        emit(False, "import produced no asset. See the Output Log for the importer error.", asset_path=asset_path, first_import=existing is None)
        return
    refresh(asset_path)
    emit(
        True,
        "",
        asset_path=imported[0],
        first_import=existing is None,
        ms=int((time.monotonic() - started) * 1000),
        part_id=args.get("part_id"),
        version_id=args.get("version_id"),
    )


if __name__ == "__main__":
    try:
        main(sys.argv)
    except Exception as e:  # noqa: BLE001 - the agent needs one line, whatever failed
        emit(False, f"{type(e).__name__}: {e}")

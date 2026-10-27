"""Import or reimport one character part export as a skeletal mesh, in place.

Called by the agent through Remote Control with one argument: a JSON args file
{v, kind, part_id, version_id, spool_path, destination_path, asset_name, armature, bone_count}.

Rules from docs/engineering.md, The mirror, Character:
- AssetImportTask with replace_existing True, automated True, save True.
- First import sets the full options. A reimport passes the existing skeleton and physics
  asset so materials, skeleton, and physics are kept. Options do not change on reimport.
- Nothing is ever deleted from the mesh. The MetaHuman DNA asset and its user data stay.
- After a reimport the script checks that the skeleton and physics asset are the same objects
  and fails the mirror if not, so a broken link never goes unseen.

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
import validate  # noqa: E402
import verify  # noqa: E402
from _assets import find_existing, imported_mesh  # noqa: E402
from _result import emit, read_args  # noqa: E402

try:
    import unreal
except ImportError:  # pragma: no cover - only inside the editor
    unreal = None


def what_arrived(mesh: Any, destination_path: str) -> dict[str, Any]:
    """The material slots, the skeleton's bones and the animations on that skeleton.
    SkeletonModifier.get_all_bone_names (UE 5.4+, the SkeletalMeshModelingTools plugin):
    https://dev.epicgames.com/documentation/en-us/unreal-engine/python-api/class/SkeletonModifier"""
    bones: list[str] = []
    modifier_cls = getattr(unreal, "SkeletonModifier", None)
    if modifier_cls is not None:
        modifier = modifier_cls()
        modifier.set_skeletal_mesh(mesh)
        bones = [str(b) for b in modifier.get_all_bone_names()]
    skeleton = mesh.skeleton
    animations = []
    for path in unreal.EditorAssetLibrary.list_assets(destination_path, recursive=True):
        asset = unreal.EditorAssetLibrary.load_asset(path)
        if isinstance(asset, unreal.AnimSequence) and asset.get_skeleton() == skeleton:
            animations.append({"name": asset.get_name(), "seconds": float(asset.get_play_length())})
    return {"materials": [str(m.material_slot_name) for m in mesh.materials], "bones": bones, "animations": animations}


def fbx_options(existing: Any | None) -> Any:
    """FbxImportUI for a skeletal mesh. On reimport, pass the existing skeleton and physics asset."""
    ui = unreal.FbxImportUI()
    ui.automated_import_should_detect_type = False
    ui.import_as_skeletal = True
    ui.mesh_type_to_import = unreal.FBXImportType.FBXIT_SKELETAL_MESH
    ui.import_materials = existing is None
    ui.import_textures = existing is None
    ui.skeletal_mesh_import_data.import_morph_targets = True
    if isinstance(existing, unreal.SkeletalMesh):
        ui.skeleton = existing.skeleton
        ui.physics_asset = existing.physics_asset
        ui.create_physics_asset = False
    else:
        ui.create_physics_asset = True
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


def links_of(asset: Any) -> dict[str, str | None]:
    """The two links a reimport must keep."""
    skeleton = getattr(asset, "skeleton", None)
    physics = getattr(asset, "physics_asset", None)
    return {
        "skeleton": skeleton.get_path_name() if skeleton is not None else None,
        "physics_asset": physics.get_path_name() if physics is not None else None,
    }


def refresh(asset_path: str) -> None:
    """Content Browser sees the new bytes and the package is marked dirty."""
    registry = unreal.AssetRegistryHelpers.get_asset_registry()
    registry.scan_paths_synchronous([os.path.dirname(asset_path)], True)
    asset = unreal.EditorAssetLibrary.load_asset(asset_path)
    if asset is not None:
        asset.modify()
        # A commandlet has no Slate application, and syncing the Content Browser there asserts
        # (measured on UE 5.8). The mirror runs in the open editor, which has one.
        if "-run=" not in unreal.SystemLibrary.get_command_line().lower():
            unreal.EditorAssetLibrary.sync_browser_to_objects([asset_path])


def validated(paths: list[str]) -> dict[str, Any]:
    """v8 step 22: what Unreal's validators said about the import. A validator that throws does not
    undo the import: it is logged, and the result carries no findings."""
    try:
        return {"validation": validate.run(paths)}
    except Exception as e:  # noqa: BLE001 - any validator, Epic's or the studio's, can throw
        unreal.log_warning(f"Nkata: the validators did not run: {type(e).__name__}: {e}")
        return {"validation_error": f"{type(e).__name__}: {e}"}


def main(argv: list[str]) -> None:
    started = time.monotonic()
    args = read_args(argv)
    if unreal is None:
        emit(False, "unreal module not available: run inside the editor")
        return
    destination = str(args["destination_path"])
    existing = find_existing(destination, str(args["asset_name"]), unreal.SkeletalMesh)
    before = links_of(existing) if existing is not None else None
    task = build_task(args, existing)
    unreal.AssetToolsHelpers.get_asset_tools().import_asset_tasks([task])
    imported = list(task.imported_object_paths or [])
    mesh = imported_mesh(imported, unreal.SkeletalMesh) if imported else None
    if mesh is None:
        emit(False, "import produced no skeletal mesh. See the Output Log for the importer error.", asset_path=destination, first_import=existing is None)
        return
    asset_path = mesh.get_path_name()
    refresh(asset_path)
    after = links_of(mesh)
    if before is not None and before != after:
        emit(False, f"reimport changed the links: {before} to {after}", asset_path=asset_path, first_import=False, before=before, after=after)
        return
    # v8 step 17: what Unreal made, set beside what the export held.
    checked = verify.differences(args.get("expect") or {}, what_arrived(mesh, destination))
    if not checked["intact"]:
        emit(False, " ".join(checked["lines"]), asset_path=asset_path, first_import=existing is None, verify=checked, **after)
        return
    emit(
        True,
        "",
        **validated([*imported, asset_path]),
        asset_path=asset_path,
        verify=checked,
        first_import=existing is None,
        ms=int((time.monotonic() - started) * 1000),
        part_id=args.get("part_id"),
        version_id=args.get("version_id"),
        **after,
    )


if __name__ == "__main__":
    try:
        main(sys.argv)
    except Exception as e:  # noqa: BLE001 - the agent needs one line, whatever failed
        emit(False, f"{type(e).__name__}: {e}")

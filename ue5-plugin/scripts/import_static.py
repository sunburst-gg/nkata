"""Import or reimport one prop part export as a static mesh, in place.

Called by the agent through Remote Control with one argument: a JSON args file
{v, kind, part_id, version_id, spool_path, destination_path, asset_name, nanite, lod_group,
generate_collision}.

Rules from docs/engineering.md, The mirror, Static:
- AssetImportTask with replace_existing True, automated True, save True.
- First import sets Nanite, the LOD group, and collision from the template params.
- A reimport keeps material instances, Nanite and LOD settings, and collision: materials and
  textures are not imported again and collision is not regenerated.
- Placed copies update on their own because the asset path is unchanged. The script counts the
  asset's referencers before and after and fails the mirror when the count drops.

Python API: https://dev.epicgames.com/documentation/en-us/unreal-engine/python-api/
AssetImportTask: https://dev.epicgames.com/documentation/en-us/unreal-engine/python-api/class/AssetImportTask
FbxImportUI: https://dev.epicgames.com/documentation/en-us/unreal-engine/python-api/class/FbxImportUI
EditorAssetLibrary.find_package_referencers_for_asset:
https://dev.epicgames.com/documentation/en-us/unreal-engine/python-api/class/EditorAssetLibrary

Not yet run in a real editor. See docs/decisions.md, open questions.
"""

from __future__ import annotations

import os
import sys
import time
from typing import Any

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import verify  # noqa: E402
from _assets import find_existing, imported_mesh  # noqa: E402
from _result import emit, read_args  # noqa: E402

try:
    import unreal
except ImportError:  # pragma: no cover - only inside the editor
    unreal = None


def referencers(asset_path: str) -> list[str]:
    """Packages that reference the asset: levels, Blueprints, materials. Sorted for a stable diff."""
    if not unreal.EditorAssetLibrary.does_asset_exist(asset_path):
        return []
    refs = unreal.EditorAssetLibrary.find_package_referencers_for_asset(asset_path, True) or []
    return sorted(str(r) for r in refs)


def fbx_options(args: dict[str, Any], existing: Any | None) -> Any:
    """FbxImportUI for a static mesh. Collision and materials are set once, on first import."""
    ui = unreal.FbxImportUI()
    ui.automated_import_should_detect_type = False
    ui.import_as_skeletal = False
    ui.mesh_type_to_import = unreal.FBXImportType.FBXIT_STATIC_MESH
    ui.import_materials = existing is None
    ui.import_textures = existing is None
    data = ui.static_mesh_import_data
    data.combine_meshes = True
    data.auto_generate_collision = existing is None and bool(args.get("generate_collision", True))
    if existing is None and args.get("lod_group"):
        data.static_mesh_lod_group = unreal.Name(str(args["lod_group"]))
    return ui


def gltf_options(args: dict[str, Any], existing: Any | None) -> Any | None:
    """Interchange pipeline for glTF. Returns None when the classes are not exposed."""
    pipeline_cls = getattr(unreal, "InterchangeGenericAssetsPipeline", None)
    if pipeline_cls is None:
        return None
    pipeline = pipeline_cls()
    mesh = getattr(pipeline, "mesh_pipeline", None)
    if mesh is not None:
        # UE 5.8 deprecates the bool and raises on reading it; its enum says the same thing.
        # Measured: InterchangeCombineStaticMeshesBehavior has ALL, DO_NOT_COMBINE, VISIBLE_ONLY.
        behavior = getattr(unreal, "InterchangeCombineStaticMeshesBehavior", None)
        if behavior is not None:
            mesh.set_editor_property("combine_static_meshes_behavior", behavior.ALL)
        elif hasattr(mesh, "combine_static_meshes"):
            mesh.combine_static_meshes = True
        if hasattr(mesh, "build_nanite") and existing is None:
            mesh.build_nanite = bool(args.get("nanite", False))
        if hasattr(mesh, "collision") and existing is not None:
            mesh.collision = False
        if hasattr(mesh, "lod_group") and existing is None and args.get("lod_group"):
            mesh.lod_group = unreal.Name(str(args["lod_group"]))
    if existing is not None:
        materials = getattr(pipeline, "material_pipeline", None)
        if materials is not None and hasattr(materials, "import_materials"):
            materials.import_materials = False
        textures = getattr(pipeline, "texture_pipeline", None)
        if textures is not None and hasattr(textures, "import_textures"):
            textures.import_textures = False
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
    options = fbx_options(args, existing) if ext == ".fbx" else gltf_options(args, existing)
    if options is not None:
        task.options = options
    return task


def apply_first_import_settings(asset: Any, args: dict[str, Any]) -> None:
    """Nanite on the asset, set once. Later mirrors never touch it."""
    settings = getattr(asset, "nanite_settings", None)
    if settings is not None and hasattr(settings, "enabled"):
        settings.enabled = bool(args.get("nanite", False))
        asset.set_editor_property("nanite_settings", settings)


def links_of(asset: Any) -> dict[str, Any]:
    """What a reimport must keep on a static mesh."""
    materials = [str(m.material_slot_name) for m in getattr(asset, "static_materials", []) or []]
    # Through get_editor_property: plain attribute access on agg_geom reads every element list
    # as empty on UE 5.8, so a prop with a convex shape counted 0 and a lost one went unseen.
    body = asset.get_editor_property("body_setup")
    collision = 0
    if body is not None:
        geom = body.get_editor_property("agg_geom")
        for key in ("box_elems", "sphere_elems", "sphyl_elems", "convex_elems"):
            collision += len(geom.get_editor_property(key) or [])
    return {"materials": materials, "collision_primitives": collision}


def refresh(asset_path: str) -> None:
    registry = unreal.AssetRegistryHelpers.get_asset_registry()
    registry.scan_paths_synchronous([os.path.dirname(asset_path)], True)
    asset = unreal.EditorAssetLibrary.load_asset(asset_path)
    if asset is not None:
        asset.modify()
        # A commandlet has no Slate application, and the Content Browser sync asserts there.
        if "-run=" not in unreal.SystemLibrary.get_command_line().lower():
            unreal.EditorAssetLibrary.sync_browser_to_objects([asset_path])


def main(argv: list[str]) -> None:
    started = time.monotonic()
    args = read_args(argv)
    if unreal is None:
        emit(False, "unreal module not available: run inside the editor")
        return
    destination = str(args["destination_path"])
    existing = find_existing(destination, str(args["asset_name"]), unreal.StaticMesh)
    refs_before = referencers(existing.get_path_name()) if existing is not None else []
    links_before = links_of(existing) if existing is not None else None
    task = build_task(args, existing)
    unreal.AssetToolsHelpers.get_asset_tools().import_asset_tasks([task])
    imported = list(task.imported_object_paths or [])
    asset = imported_mesh(imported, unreal.StaticMesh) if imported else None
    if asset is None:
        emit(False, "import produced no static mesh. See the Output Log for the importer error.", asset_path=destination, first_import=existing is None)
        return
    asset_path = asset.get_path_name()
    if existing is None:
        apply_first_import_settings(asset, args)
        unreal.EditorAssetLibrary.save_asset(asset_path)
    refresh(asset_path)
    refs_after = referencers(asset_path)
    if len(refs_after) < len(refs_before):
        emit(False, f"reimport lost referencers: {len(refs_before)} before, {len(refs_after)} after", asset_path=asset_path, first_import=False, referencers_before=refs_before, referencers_after=refs_after)
        return
    links_after = links_of(asset)
    if links_before is not None and links_before["materials"] != links_after["materials"]:
        emit(False, f"reimport changed the material slots: {links_before['materials']} to {links_after['materials']}", asset_path=asset_path, first_import=False)
        return
    # v8 step 17: the material slots Unreal made, set beside what the export held.
    checked = verify.differences({"materials": (args.get("expect") or {}).get("materials") or []}, {"materials": list(links_after["materials"])})
    if not checked["intact"]:
        emit(False, " ".join(checked["lines"]), asset_path=asset_path, first_import=existing is None, verify=checked, **links_after)
        return
    emit(
        True,
        "",
        asset_path=asset_path,
        verify=checked,
        first_import=existing is None,
        ms=int((time.monotonic() - started) * 1000),
        part_id=args.get("part_id"),
        version_id=args.get("version_id"),
        referencers=len(refs_after),
        **links_after,
    )


if __name__ == "__main__":
    try:
        main(sys.argv)
    except Exception as e:  # noqa: BLE001 - the agent needs one line, whatever failed
        emit(False, f"{type(e).__name__}: {e}")

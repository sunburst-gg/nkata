"""Run the part collection's attached glTF exporter. Collection exporters (Blender 4.2+):
https://docs.blender.org/manual/en/latest/scene_layout/collections/collections.html#exporters

The exporter and its settings live on the collection in the .blend. Nkata sets the file path and
runs it. Without an attached exporter the add-on falls back to a plain glTF export of the
collection so a save still mirrors. Needs a check in a real Blender: see docs/decisions.md."""

from __future__ import annotations

from pathlib import Path
from typing import Any

import bpy

from .log import log


def find_gltf_exporter(collection: Any) -> tuple[int, Any] | None:
    exporters = getattr(collection, "exporters", None) or []
    for index, exporter in enumerate(exporters):
        props = getattr(exporter, "export_properties", None)
        rna = getattr(getattr(props, "bl_rna", None), "identifier", "") or type(props).__name__
        if "gltf" in rna.lower() or "gltf" in str(getattr(exporter, "name", "")).lower():
            return index, exporter
    return None


def export_collection(collection: Any, filepath: Path, kind: str = "character", skins: bool | None = None, animations: bool = False) -> str:
    """Exports the collection to filepath. Returns which path ran: 'exporter' or 'fallback'.
    A character exports with its armature and skin weights; a prop exports meshes only. v8
    passes `skins` from the scene (an armature present) so a rigged object keeps its rig, and
    `animations` when the collection has any, which the export had always left out (step 17).
    An exporter the artist attached keeps the artist's settings."""
    filepath.parent.mkdir(parents=True, exist_ok=True)
    found = find_gltf_exporter(collection)
    if found is not None:
        index, exporter = found
        exporter.export_properties.filepath = str(filepath)
        with bpy.context.temp_override(collection=collection):
            result = bpy.ops.collection.exporter_export(index=index)
        if "FINISHED" not in result:
            raise RuntimeError(f"collection exporter returned {result}")
        return "exporter"
    log("export.fallback", collection=collection.name, why="no glTF exporter attached to the collection")
    layer = _layer_collection(bpy.context.view_layer.layer_collection, collection.name)
    previous = bpy.context.view_layer.active_layer_collection
    if layer is not None:
        bpy.context.view_layer.active_layer_collection = layer
    try:
        skins = kind == "character" if skins is None else skins
        # Textures embedded, Y up (the exporter's default), modifiers and scale applied, no Draco.
        # Blender's exporter offers no meshopt; environments ship uncompressed (docs/decisions.md).
        result = bpy.ops.export_scene.gltf(
            filepath=str(filepath), export_format="GLB", use_active_collection=True, export_apply=True,
            export_skins=skins, export_animations=animations, export_morph=skins, export_draco_mesh_compression_enable=False,
        )
    finally:
        if layer is not None:
            bpy.context.view_layer.active_layer_collection = previous
    if "FINISHED" not in result:
        raise RuntimeError(f"glTF export returned {result}")
    return "fallback"


def export_fbx(collection: Any, filepath: Path, kind: str = "character", rigged: bool | None = None, animations: bool = False) -> None:
    """The FBX an engineer takes into the engine by hand, exported on Publish only. Meshes and,
    when the collection has one, the armature, metres, no embedded textures; the animations
    baked when there are any. It had kept the armature for the Character template only.
    https://docs.blender.org/api/current/bpy.ops.export_scene.html#bpy.ops.export_scene.fbx"""
    rigged = kind == "character" if rigged is None else rigged
    filepath.parent.mkdir(parents=True, exist_ok=True)
    layer = _layer_collection(bpy.context.view_layer.layer_collection, collection.name)
    previous = bpy.context.view_layer.active_layer_collection
    if layer is not None:
        bpy.context.view_layer.active_layer_collection = layer
    try:
        result = bpy.ops.export_scene.fbx(
            filepath=str(filepath), use_active_collection=True, object_types={"MESH", "ARMATURE"} if rigged else {"MESH"},
            apply_unit_scale=True, apply_scale_options="FBX_SCALE_NONE", mesh_smooth_type="FACE", path_mode="STRIP", embed_textures=False,
            bake_anim=animations, add_leaf_bones=False,
        )
    finally:
        if layer is not None:
            bpy.context.view_layer.active_layer_collection = previous
    if "FINISHED" not in result or not filepath.is_file():
        raise RuntimeError(f"FBX export returned {result}")


def _layer_collection(layer: Any, name: str) -> Any | None:
    if layer.collection.name == name:
        return layer
    for child in layer.children:
        found = _layer_collection(child, name)
        if found is not None:
            return found
    return None


STILL_SIZE = (1600, 1000)
STILL_SAMPLES = 8
EYE_HEIGHT_M = 1.6


def render_still(filepath: Path) -> Path:
    """The environment's still: 1600x1000 from the scene camera, or a default eye-height camera,
    Eevee at low samples, under 3 s. The previous render settings come back after.
    https://docs.blender.org/api/current/bpy.ops.render.html#bpy.ops.render.render"""
    scene = bpy.context.scene
    render = scene.render
    previous = (render.filepath, render.image_settings.file_format, render.resolution_x, render.resolution_y, render.resolution_percentage, render.engine)
    made_camera = None
    try:
        if scene.camera is None:
            data = bpy.data.cameras.new("Nkata still")
            made_camera = bpy.data.objects.new("Nkata still", data)
            scene.collection.objects.link(made_camera)
            made_camera.location = (0.0, -8.0, EYE_HEIGHT_M)
            made_camera.rotation_euler = (1.4, 0.0, 0.0)
            scene.camera = made_camera
        render.engine = "BLENDER_EEVEE_NEXT" if "BLENDER_EEVEE_NEXT" in _engines() else "BLENDER_EEVEE"
        eevee = getattr(scene, "eevee", None)
        if eevee is not None and hasattr(eevee, "taa_render_samples"):
            eevee.taa_render_samples = STILL_SAMPLES
        render.resolution_x, render.resolution_y = STILL_SIZE
        render.resolution_percentage = 100
        render.filepath = str(filepath)
        render.image_settings.file_format = "PNG"
        result = bpy.ops.render.render(write_still=True)
    finally:
        render.filepath, render.image_settings.file_format, render.resolution_x, render.resolution_y, render.resolution_percentage, render.engine = previous
        if made_camera is not None:
            scene.camera = None
            bpy.data.objects.remove(made_camera)
    if "FINISHED" not in result or not filepath.is_file():
        raise RuntimeError(f"still render returned {result}")
    return filepath


def _engines() -> list[str]:
    try:
        return [item.identifier for item in bpy.types.RenderSettings.bl_rna.properties["engine"].enum_items]
    except (AttributeError, KeyError, TypeError):
        return []

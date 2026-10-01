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


def export_collection(collection: Any, filepath: Path) -> str:
    """Exports the collection to filepath. Returns which path ran: 'exporter' or 'fallback'."""
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
        result = bpy.ops.export_scene.gltf(filepath=str(filepath), export_format="GLB", use_active_collection=True, export_apply=True)
    finally:
        if layer is not None:
            bpy.context.view_layer.active_layer_collection = previous
    if "FINISHED" not in result:
        raise RuntimeError(f"glTF export returned {result}")
    return "fallback"


def _layer_collection(layer: Any, name: str) -> Any | None:
    if layer.collection.name == name:
        return layer
    for child in layer.children:
        found = _layer_collection(child, name)
        if found is not None:
            return found
    return None

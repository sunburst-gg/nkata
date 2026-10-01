"""save_post handler. Hash every object in the part collection, compare with the last save,
export only on change, write manifest.json, POST /parts/:id/saved. The version records either way.
bpy.app.handlers: https://docs.blender.org/api/current/bpy.app.handlers.html"""

from __future__ import annotations

import array
import time
from pathlib import Path
from typing import Any

import bpy
from bpy.app.handlers import persistent

from . import export, hashing, ids, manifest, mapping
from .agent_client import AgentClient, AgentError, EventListener
from .log import log
from .state import STATE

_listener: EventListener | None = None


def _object_payload(obj: Any) -> tuple[bytes, bytes, list[str], list[float]]:
    mesh = obj.data
    verts = array.array("f", [0.0] * (len(mesh.vertices) * 3))
    mesh.vertices.foreach_get("co", verts)
    loops = array.array("i", [0] * len(mesh.loops))
    mesh.loops.foreach_get("vertex_index", loops)
    materials = [slot.material.name if slot.material else "" for slot in obj.material_slots]
    matrix = [float(v) for row in obj.matrix_world for v in row]
    return verts.tobytes(), loops.tobytes(), materials, matrix


def collect(collection: Any) -> tuple[dict[str, str], list[manifest.ObjectInfo], str | None]:
    """Hash table, manifest rows, and armature name for every mesh object in the collection."""
    hashes: dict[str, str] = {}
    infos: list[manifest.ObjectInfo] = []
    armature: str | None = None
    for obj in collection.all_objects:
        if obj.type == "ARMATURE" and armature is None:
            armature = obj.name
        if obj.type != "MESH":
            continue
        verts, loops, materials, matrix = _object_payload(obj)
        h = hashing.hash_object(verts, loops, materials, matrix)
        hashes[obj.name] = h
        corners = [tuple(obj.matrix_world @ bpy.mathutils_vector(c)) if hasattr(bpy, "mathutils_vector") else tuple(c) for c in obj.bound_box]
        lo, hi = manifest.bounds_of([(float(c[0]), float(c[1]), float(c[2])) for c in corners])
        triangles = sum(max(0, len(p.vertices) - 2) for p in obj.data.polygons)
        infos.append(manifest.ObjectInfo(obj.name, triangles, [m for m in materials if m], lo, hi, h))
    return hashes, infos, armature


def _ensure_listener(client: AgentClient) -> None:
    global _listener
    if _listener is None or not _listener.is_alive():
        _listener = EventListener(client, STATE.apply_event)
        _listener.start()


def handle_save(filepath: str) -> dict[str, Any]:
    """The whole flow for one save. Raises on failure; the handler logs it."""
    started = time.monotonic()
    path = Path(filepath)
    root = mapping.find_project_root(path)
    if root is None:
        return {"skipped": "not inside a Nkata project"}
    client = AgentClient(mapping.read_token(root))
    _ensure_listener(client)
    rel = mapping.relative_file(root, path)
    part = mapping.part_for_file(client.parts(rel), rel)
    with STATE.lock:
        STATE.part = part
        STATE.rel_file = rel
        STATE.error = ""
    if part is None:
        return {"skipped": f"no part maps to {rel}"}
    collection = bpy.data.collections.get(part["mapping"]["collection"])
    if collection is None:
        raise RuntimeError(f"collection {part['mapping']['collection']!r} not in this file")
    hashes, infos, armature = collect(collection)
    changed = hashing.hash_table_changed(STATE.last_hashes.get(part["id"]), hashes)
    spool_path: str | None = None
    manifest_data: dict[str, Any] | None = None
    export_ms = 0
    if changed:
        me = client.me()
        version_name = ids.new_id()
        spool = Path(me.spool_dir) / part["id"] / f"{version_name}.glb"
        t = time.monotonic()
        how = export.export_collection(collection, spool)
        export_ms = int((time.monotonic() - t) * 1000)
        manifest_data = manifest.build_manifest(infos, armature, part.get("mapping", {}).get("path"))
        manifest.write_manifest(spool.with_name(f"{version_name}.manifest.json"), manifest_data)
        spool_path = str(spool)
        log("export.done", part_id=part["id"], how=how, export_ms=export_ms, objects=len(infos))
    res = client.saved(part["id"], changed, spool_path, manifest_data, rel)
    with STATE.lock:
        STATE.last_hashes[part["id"]] = hashes
        view = STATE.mirror_for(part["id"])
        view.status = res.mirror
        view.version_id = res.version_id
        view.message = ""
        view.at = time.time()
        STATE.dirty = True
    total_ms = int((time.monotonic() - started) * 1000)
    log("save.posted", part_id=part["id"], version_id=res.version_id, changed=changed, export_ms=export_ms, total_ms=total_ms)
    return {"part_id": part["id"], "version_id": res.version_id, "changed": changed, "export_ms": export_ms, "total_ms": total_ms}


@persistent
def on_save_post(*_args: Any) -> None:
    filepath = bpy.data.filepath
    if not filepath:
        return
    try:
        handle_save(filepath)
    except (AgentError, RuntimeError, OSError, ValueError) as e:
        # A save must never fail because the mirror did. Show the reason on the panel.
        log("save.failed", error=str(e), file=filepath)
        with STATE.lock:
            STATE.error = str(e)
            STATE.dirty = True


def _redraw_tick() -> float:
    if STATE.dirty:
        STATE.dirty = False
        for window in bpy.context.window_manager.windows:
            for area in window.screen.areas:
                if area.type == "VIEW_3D":
                    area.tag_redraw()
    return 0.5


def register() -> None:
    if on_save_post not in bpy.app.handlers.save_post:
        bpy.app.handlers.save_post.append(on_save_post)
    if not bpy.app.timers.is_registered(_redraw_tick):
        bpy.app.timers.register(_redraw_tick, persistent=True)


def unregister() -> None:
    if on_save_post in bpy.app.handlers.save_post:
        bpy.app.handlers.save_post.remove(on_save_post)
    if bpy.app.timers.is_registered(_redraw_tick):
        bpy.app.timers.unregister(_redraw_tick)
    if _listener is not None:
        _listener.stop()

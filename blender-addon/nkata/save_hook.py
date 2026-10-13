"""save_post handler. Hash every object in the part collection, compare with the last save,
export only on change, write manifest.json, POST /parts/:id/saved. The version records either way.
bpy.app.handlers: https://docs.blender.org/api/current/bpy.app.handlers.html"""

from __future__ import annotations

import array
import time
from dataclasses import dataclass
from pathlib import Path
from typing import Any

import bpy
from bpy.app.handlers import persistent

from . import checks, export, hashing, ids, manifest, mapping
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


@dataclass(frozen=True)
class Collected:
    hashes: dict[str, str]
    infos: list[manifest.ObjectInfo]
    armature: str | None
    bone_count: int | None


def _world_corner(obj: Any, corner: Any) -> tuple[float, float, float]:
    """A bound_box corner in world space. bound_box is in object space; apply the world matrix."""
    m = obj.matrix_world
    x, y, z = float(corner[0]), float(corner[1]), float(corner[2])
    return (
        float(m[0][0]) * x + float(m[0][1]) * y + float(m[0][2]) * z + float(m[0][3]),
        float(m[1][0]) * x + float(m[1][1]) * y + float(m[1][2]) * z + float(m[1][3]),
        float(m[2][0]) * x + float(m[2][1]) * y + float(m[2][2]) * z + float(m[2][3]),
    )


def collect(collection: Any) -> Collected:
    """Hash table, manifest rows, armature name, and bone count for the collection."""
    hashes: dict[str, str] = {}
    infos: list[manifest.ObjectInfo] = []
    armature: str | None = None
    bone_count: int | None = None
    for obj in collection.all_objects:
        if obj.type == "ARMATURE" and armature is None:
            armature = obj.name
            bone_count = len(getattr(obj.data, "bones", []) or [])
        if obj.type != "MESH":
            continue
        verts, loops, materials, matrix = _object_payload(obj)
        h = hashing.hash_object(verts, loops, materials, matrix)
        hashes[obj.name] = h
        lo, hi = manifest.bounds_of([_world_corner(obj, c) for c in obj.bound_box])
        triangles = sum(max(0, len(p.vertices) - 2) for p in obj.data.polygons)
        origin = (float(matrix[3]), float(matrix[7]), float(matrix[11]))
        scale = tuple(float(v) for v in getattr(obj, "scale", (1.0, 1.0, 1.0)))
        infos.append(manifest.ObjectInfo(obj.name, triangles, [m for m in materials if m], lo, hi, h, origin, (scale[0], scale[1], scale[2])))
    return Collected(hashes, infos, armature, bone_count)


def gather_facts(collection: Any, skeletons: dict[str, tuple[str, ...]] | None = None) -> checks.SceneFacts:
    """What the Blender checks look at, read once from the scene. Textures are the images the
    collection's materials use; with no material graph the whole file's images count."""
    objects: list[checks.ObjectFacts] = []
    bone_names: tuple[str, ...] = ()
    for obj in collection.all_objects:
        if obj.type == "ARMATURE" and not bone_names:
            bone_names = tuple(str(b.name) for b in getattr(obj.data, "bones", []) or [])
        if obj.type != "MESH":
            continue
        _verts, _loops, _materials, matrix = _object_payload(obj)
        lo, _hi = manifest.bounds_of([_world_corner(obj, c) for c in obj.bound_box])
        triangles = sum(max(0, len(p.vertices) - 2) for p in obj.data.polygons)
        uv_layers = tuple(str(u.name) for u in getattr(obj.data, "uv_layers", []) or [])
        objects.append(checks.ObjectFacts(obj.name, triangles, uv_layers, lo, (float(matrix[3]), float(matrix[7]), float(matrix[11]))))
    textures = tuple(
        checks.TextureFacts(str(img.name), int(img.size[0]), int(img.size[1]))
        for img in getattr(bpy.data, "images", []) or []
        if getattr(img, "size", None) and int(img.size[0]) > 0
    )
    unit_scale = float(getattr(getattr(bpy.context.scene, "unit_settings", None), "scale_length", 1.0))
    return checks.SceneFacts(unit_scale=unit_scale, objects=tuple(objects), textures=textures, bone_names=bone_names, skeletons=dict(skeletons or {}))


def run_part_checks(part: dict[str, Any], collection: Any) -> list[dict[str, Any]]:
    """The part's Blender checks on the scene as saved, kept in STATE for the panel. No fixes."""
    specs = part.get("checks") or []
    if not specs:
        return []
    facts = gather_facts(collection)
    results, _ = checks.run_checks(
        [c["id"] for c in specs],
        {c["id"]: dict(c.get("params") or {}) for c in specs},
        {c["id"]: c["severity"] for c in specs},
        facts,
        fix=False,
    )
    with STATE.lock:
        STATE.checks[part["id"]] = results
    return results


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
    kind = str(part.get("kind") or "character")
    got = collect(collection)
    hashes, infos = got.hashes, got.infos
    changed = hashing.hash_table_changed(STATE.last_hashes.get(part["id"]), hashes)
    spool_path: str | None = None
    manifest_data: dict[str, Any] | None = None
    export_ms = 0
    refused: list[str] = []
    if changed and kind == "prop":
        # A prop must sit on its origin at scale 1 or every placed copy lands wrong.
        refused = manifest.static_problems(infos)
    if changed and refused:
        log("export.refused", part_id=part["id"], problems=refused)
        changed = False
    if changed:
        me = client.me()
        version_name = ids.new_id()
        spool = Path(me.spool_dir) / part["id"] / f"{version_name}.glb"
        t = time.monotonic()
        how = export.export_collection(collection, spool, kind)
        export_ms = int((time.monotonic() - t) * 1000)
        manifest_data = manifest.build_manifest(infos, got.armature, part.get("mapping", {}).get("path"), kind, got.bone_count)
        manifest.write_manifest(spool.with_name(f"{version_name}.manifest.json"), manifest_data)
        spool_path = str(spool)
        log("export.done", part_id=part["id"], kind=kind, how=how, export_ms=export_ms, objects=len(infos))
    res = client.saved(part["id"], changed, spool_path, manifest_data, rel, STATE.opened_at)
    results = run_part_checks(part, collection)
    if results:
        try:
            client.record_checks(part["id"], results)
        except AgentError as e:
            log("checks.record_failed", part_id=part["id"], error=str(e))
    with STATE.lock:
        if not refused:
            STATE.last_hashes[part["id"]] = hashes
        view = STATE.mirror_for(part["id"])
        view.status = res.mirror
        view.version_id = res.version_id
        view.message = ""
        view.at = time.time()
        STATE.error = "Export refused. " + " ".join(refused) if refused else ""
        STATE.dirty = True
    total_ms = int((time.monotonic() - started) * 1000)
    log("save.posted", part_id=part["id"], version_id=res.version_id, changed=changed, export_ms=export_ms, total_ms=total_ms)
    return {"part_id": part["id"], "version_id": res.version_id, "changed": changed, "export_ms": export_ms, "total_ms": total_ms, "refused": refused}


def ensure_collection(name: str) -> Any:
    """The part's collection: the existing one, else the file's only collection renamed, else a
    new one linked to the scene. A fresh file has one collection, so its objects join the part.
    A file brought in from the folder gets the same treatment on open, so its objects mirror."""
    col = bpy.data.collections.get(name)
    if col is not None:
        return col
    if len(bpy.data.collections) == 1:
        col = next(iter(bpy.data.collections.values()))
        col.name = name
        return col
    col = bpy.data.collections.new(name)
    bpy.context.scene.collection.children.link(col)
    return col


def handle_open(filepath: str) -> dict[str, Any]:
    """On file load: find the part, ask for the lock, say where the user is. The panel shows the
    holder when someone else has it. docs/product.md, R4."""
    path = Path(filepath)
    root = mapping.find_project_root(path)
    if root is None:
        return {"skipped": "not inside a Nkata project"}
    client = AgentClient(mapping.read_token(root))
    _ensure_listener(client)
    rel = mapping.relative_file(root, path)
    me = client.me()
    part = mapping.part_for_file(client.parts(rel), rel)
    with STATE.lock:
        STATE.me = me.user.to_dict()
        STATE.part = part
        STATE.rel_file = rel
        STATE.error = ""
        STATE.publish_line = ""
        STATE.opened_at = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
    if part is None:
        return {"skipped": f"no part maps to {rel}"}
    ensure_collection(str(part["mapping"]["collection"]))
    granted = False
    holder = None
    if True:
        try:
            res = client.open_part(part["id"])
            granted = bool(res.granted)
            holder = res.lock.to_dict() if res.lock is not None else None
        except AgentError as e:
            if e.code not in ("lock_held", "gate_closed", "forbidden"):
                raise
            holder = None
            with STATE.lock:
                STATE.error = e.message
    with STATE.lock:
        if STATE.part is not None:
            STATE.part = {**STATE.part, "lock": holder}
        if holder and not granted:
            STATE.error = f"{holder['holder']['name']} has this part. Opened {holder['granted_at'][11:16]} UTC."
        STATE.dirty = True
    try:
        res = client.presence(part["id"])
        with STATE.lock:
            STATE.online = [e.to_dict() for e in res.online]
    except AgentError as e:
        log("presence.failed", part_id=part["id"], error=str(e))
    try:
        res = client.comments(part["id"])
        with STATE.lock:
            STATE.comments[part["id"]] = [c.to_dict() for c in res.comments]
    except AgentError as e:
        log("comments.failed", part_id=part["id"], error=str(e))
    log("part.opened", part_id=part["id"], granted=granted)
    return {"part_id": part["id"], "granted": granted}


def handle_close() -> None:
    """On unregister or a new file: release the lock and leave the part."""
    part = STATE.part
    root = mapping.find_project_root(Path(bpy.data.filepath)) if bpy.data.filepath else None
    if part is None or root is None:
        return
    try:
        client = AgentClient(mapping.read_token(root))
        client.close_part(part["id"])
        client.presence(None)
    except AgentError as e:
        log("close.failed", part_id=part["id"], error=str(e))


@persistent
def on_load_post(*_args: Any) -> None:
    filepath = bpy.data.filepath
    if not filepath:
        return
    try:
        handle_open(filepath)
    except (AgentError, RuntimeError, OSError, ValueError) as e:
        log("open.failed", error=str(e), file=filepath)
        with STATE.lock:
            STATE.error = str(e)
            STATE.dirty = True


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
    if on_load_post not in bpy.app.handlers.load_post:
        bpy.app.handlers.load_post.append(on_load_post)
    if not bpy.app.timers.is_registered(_redraw_tick):
        bpy.app.timers.register(_redraw_tick, persistent=True)


def unregister() -> None:
    handle_close()
    if on_save_post in bpy.app.handlers.save_post:
        bpy.app.handlers.save_post.remove(on_save_post)
    if on_load_post in bpy.app.handlers.load_post:
        bpy.app.handlers.load_post.remove(on_load_post)
    if bpy.app.timers.is_registered(_redraw_tick):
        bpy.app.timers.unregister(_redraw_tick)
    if _listener is not None:
        _listener.stop()

"""N-panel: the seven elements, in the order and the words of docs/product.md, Surfaces.

1. Part header: asset, part, owner, state, lock.
2. Mirror status with Retry.
3. Reference strip: the asset's reference files, one button each that opens the file.
4. Checks: the last run, pass or fail per check, Fix for what Nkata can fix, Run checks.
5. Comments: pins in the viewport (pins.py), the list here, reply inline.
6. Publish, and a smaller Mark Ready.
7. Presence: who else is in this asset.

With no part open the panel offers Start a part: my parts with no file yet. One click names the
collection after the part and saves the file where the part maps to, inside the project folder
the running agent serves (mapping.current_project).

Everything drawn here comes from STATE, filled by the save hook and the SSE listener. The draw
function never calls the agent, so the panel opens in under a second (docs/product.md, Quality
bar). Operators call the agent and update STATE."""

from __future__ import annotations

import array
import os
import subprocess
import sys
from pathlib import Path
from typing import Any

import bpy

from . import checks, mapping, pins, save_hook
from .agent_client import AgentClient, AgentError
from .log import log
from .state import STATE

STATE_WORDS = {"locked": "Locked", "draft": "Draft", "ready": "Ready", "approved": "Approved"}
CHECK_WORDS = {
    "texture_names": "Texture names",
    "unit_scale": "Scale",
    "name_pattern": "Naming",
    "triangle_budget": "Triangle budget",
    "uv_set_present": "UV set",
    "texture_size": "Texture size",
    "rig_bone_names": "Rig names",
    "rig_bone_count": "Rig bone count",
    "metahuman_dna_present": "MetaHuman data",
    "lod_count": "LODs",
    "collision_present": "Collision",
    "pivot_at_base": "Pivot at base",
}


def _client_and_part() -> tuple[AgentClient, dict[str, Any]]:
    part = STATE.part
    root = mapping.find_project_root(Path(bpy.data.filepath)) if bpy.data.filepath else None
    if part is None or root is None:
        raise AgentError("no_part", "No part is open")
    return AgentClient(mapping.read_token(root)), part


def _collection(part: dict[str, Any]) -> Any:
    name = (part.get("mapping") or {}).get("collection")
    col = bpy.data.collections.get(name) if name else None
    if col is None:
        raise AgentError("no_collection", f"collection {name!r} is not in this file")
    return col


def run_checks(part: dict[str, Any], fix: bool) -> list[dict[str, Any]]:
    """Runs the part's Blender checks on the open scene and keeps the results in STATE.
    With fix, applies unit scale and renames to the scene before reporting."""
    col = _collection(part)
    specs = part.get("checks") or []
    ids = [c["id"] for c in specs]
    params = {c["id"]: dict(c.get("params") or {}) for c in specs}
    severities = {c["id"]: c["severity"] for c in specs}
    if fix and bpy.context.mode != "OBJECT":
        # Edit mode keeps the mesh in its own buffer: writes to mesh.vertices are dropped, and
        # the origin move would shift the object instead. Leave it first.
        bpy.ops.object.mode_set(mode="OBJECT")
    facts = save_hook.gather_facts(col)
    results, after = checks.run_checks(ids, params, severities, facts, fix=fix)
    if fix:
        apply_fixes(col, facts, after)
    with STATE.lock:
        STATE.checks[part["id"]] = results
        STATE.card[part["id"]] = checks.summary(after)
        STATE.dirty = True
    return results


def apply_fixes(collection: Any, before: checks.SceneFacts, after: checks.SceneFacts) -> None:
    """Writes the fixers' results back into the scene: unit scale, object names, and origins."""
    if before.unit_scale != after.unit_scale:
        bpy.context.scene.unit_settings.scale_length = after.unit_scale
    renames = {b.name: a.name for b, a in zip(before.objects, after.objects, strict=True) if b.name != a.name}
    drops = {b.name: b.origin[2] - a.origin[2] for b, a in zip(before.objects, after.objects, strict=True) if b.origin[2] != a.origin[2]}
    for obj in collection.all_objects:
        if obj.name in drops:
            move_origin_down(obj, drops[obj.name])
        if obj.name in renames:
            obj.name = renames[obj.name]
    textures = {b.name: a.name for b, a in zip(before.textures, after.textures, strict=True) if b.name != a.name}
    for img in getattr(bpy.data, "images", []) or []:
        if img.name in textures:
            img.name = textures[img.name]


def move_origin_down(obj: Any, delta: float) -> None:
    """Moves the object's origin down by `delta` metres in world space and its mesh up by the
    same amount, so the geometry stays where the artist left it. The mesh shift is the world
    vector brought into object space through the inverse of the world matrix's 3x3.
    https://docs.blender.org/api/current/bpy.types.Object.html#bpy.types.Object.matrix_world"""
    m = obj.matrix_world
    local = _solve3([[float(m[r][c]) for c in range(3)] for r in range(3)], (0.0, 0.0, delta))
    mesh = obj.data
    n = len(mesh.vertices)
    co = array.array("f", [0.0] * (n * 3))
    mesh.vertices.foreach_get("co", co)
    for i in range(n):
        co[i * 3] += local[0]
        co[i * 3 + 1] += local[1]
        co[i * 3 + 2] += local[2]
    mesh.vertices.foreach_set("co", co)
    mesh.update()
    m[2][3] = float(m[2][3]) - delta
    bpy.context.view_layer.update()


def _solve3(m: list[list[float]], v: tuple[float, float, float]) -> tuple[float, float, float]:
    """x with m @ x = v, by the adjugate. A singular matrix (a zero scale) leaves the mesh put."""
    a, b, c = m[0]
    d, e, f = m[1]
    g, h, i = m[2]
    det = a * (e * i - f * h) - b * (d * i - f * g) + c * (d * h - e * g)
    if abs(det) < 1e-12:
        return (0.0, 0.0, 0.0)
    inv = [
        [(e * i - f * h) / det, (c * h - b * i) / det, (b * f - c * e) / det],
        [(f * g - d * i) / det, (a * i - c * g) / det, (c * d - a * f) / det],
        [(d * h - e * g) / det, (b * g - a * h) / det, (a * e - b * d) / det],
    ]
    return tuple(sum(inv[r][k] * v[k] for k in range(3)) for r in range(3))  # type: ignore[return-value]


class NKATA_OT_retry_mirror(bpy.types.Operator):
    bl_idname = "nkata.retry_mirror"
    bl_label = "Retry"
    bl_description = "Run the last mirror into UE5 again"

    def execute(self, _context: bpy.types.Context) -> set[str]:
        try:
            client, part = _client_and_part()
            res = client.retry_mirror(part["id"])
        except AgentError as e:
            self.report({"ERROR"}, e.message)
            return {"CANCELLED"}
        with STATE.lock:
            view = STATE.mirror_for(part["id"])
            view.halted = False
            view.status = "pending" if res.queued else view.status
            view.message = "Waiting for UE5" if res.queued else "Nothing to retry"
        return {"FINISHED"}


class NKATA_OT_mirror_on_save(bpy.types.Operator):
    bl_idname = "nkata.mirror_on_save"
    bl_label = "Mirror on save"
    bl_description = "Off: every save still versions, the newest mirror waits until this is on again"
    on_save: bpy.props.BoolProperty(default=True)  # type: ignore[valid-type]

    def execute(self, _context: bpy.types.Context) -> set[str]:
        try:
            client, part = _client_and_part()
            mirror = client.mirror_on_save(part["id"], self.on_save)
        except AgentError as e:
            self.report({"ERROR"}, e.message)
            return {"CANCELLED"}
        with STATE.lock:
            view = STATE.mirror_for(part["id"])
            view.on_save = mirror.on_save
            view.status = str(mirror.status)
            view.message = mirror.message
            STATE.dirty = True
        log("mirror.on_save", part_id=part["id"], on_save=mirror.on_save)
        return {"FINISHED"}


class NKATA_OT_open_reference(bpy.types.Operator):
    bl_idname = "nkata.open_reference"
    bl_label = "Open"
    bl_description = "Open this reference file"
    path: bpy.props.StringProperty()  # type: ignore[valid-type]

    def execute(self, _context: bpy.types.Context) -> set[str]:
        root = mapping.find_project_root(Path(bpy.data.filepath)) if bpy.data.filepath else None
        if root is None:
            self.report({"WARNING"}, "Save this file inside the project first")
            return {"CANCELLED"}
        target = root / self.path
        if not target.exists():
            self.report({"WARNING"}, f"{self.path} is not on this machine yet")
            return {"CANCELLED"}
        open_with_os(target)
        return {"FINISHED"}


def open_with_os(path: Path) -> None:
    if sys.platform == "darwin":
        subprocess.Popen(["open", str(path)])
    elif os.name == "nt":
        os.startfile(str(path))  # type: ignore[attr-defined]
    else:
        subprocess.Popen(["xdg-open", str(path)])


class NKATA_OT_find_parts(bpy.types.Operator):
    bl_idname = "nkata.find_parts"
    bl_label = "Find my parts"
    bl_description = "List the parts of mine that have no file yet"

    def execute(self, _context: bpy.types.Context) -> set[str]:
        root = mapping.project_root_for_panel()
        if root is None:
            self.report({"WARNING"}, "Open the project in the Nkata app first")
            return {"CANCELLED"}
        try:
            client = AgentClient(mapping.read_token(root))
            me = client.me()
            parts = client.parts()
        except AgentError as e:
            self.report({"ERROR"}, e.message)
            return {"CANCELLED"}
        startable = mapping.startable_parts(parts, root, me.user.id)
        with STATE.lock:
            STATE.me = me.user.to_dict()
            STATE.unreal = bool(me.unreal)
            STATE.startable = startable
            STATE.error = "" if startable else mapping.no_part_line(parts, me.user.id)
            STATE.dirty = True
        return {"FINISHED"}



class NKATA_OT_start_part(bpy.types.Operator):
    bl_idname = "nkata.start_part"
    bl_label = "Start"
    bl_description = "Name the collection after this part and save this file where the part lives"
    part_id: bpy.props.StringProperty()  # type: ignore[valid-type]

    def execute(self, _context: bpy.types.Context) -> set[str]:
        part = next((p for p in STATE.startable if p["id"] == self.part_id), None)
        root = mapping.project_root_for_panel()
        if part is None or root is None:
            self.report({"WARNING"}, "Press Find my parts first")
            return {"CANCELLED"}
        name = str(part["mapping"]["collection"])
        save_hook.ensure_collection(name)
        target = root / str(part["mapping"]["file"])
        target.parent.mkdir(parents=True, exist_ok=True)
        result = bpy.ops.wm.save_as_mainfile(filepath=str(target))
        if "FINISHED" not in result:
            self.report({"ERROR"}, f"Blender did not save: {result}")
            return {"CANCELLED"}
        # save_post has run handle_save by now. Take the lock as an open would.
        try:
            save_hook.handle_open(str(target))
        except AgentError as e:
            self.report({"WARNING"}, e.message)
        with STATE.lock:
            STATE.startable = []
            STATE.dirty = True
        log("part.started", part_id=part["id"], file=str(part["mapping"]["file"]))
        return {"FINISHED"}


class NKATA_OT_run_checks(bpy.types.Operator):
    bl_idname = "nkata.run_checks"
    bl_label = "Run checks"
    bl_description = "Run this part's checks on the scene"

    def execute(self, _context: bpy.types.Context) -> set[str]:
        try:
            _client, part = _client_and_part()
            run_checks(part, fix=False)
        except AgentError as e:
            self.report({"ERROR"}, e.message)
            return {"CANCELLED"}
        return {"FINISHED"}


class NKATA_OT_fix_checks(bpy.types.Operator):
    bl_idname = "nkata.fix_checks"
    bl_label = "Fix"
    bl_description = "Fix unit scale and names, then run the checks again"

    def execute(self, _context: bpy.types.Context) -> set[str]:
        try:
            _client, part = _client_and_part()
            results = run_checks(part, fix=True)
        except AgentError as e:
            self.report({"ERROR"}, e.message)
            return {"CANCELLED"}
        fixed = [r["check_id"] for r in results if r["auto_fixed"]]
        self.report({"INFO"}, f"Fixed {', '.join(CHECK_WORDS.get(c, c) for c in fixed)}" if fixed else "Nothing to fix")
        return {"FINISHED"}


class NKATA_OT_publish(bpy.types.Operator):
    bl_idname = "nkata.publish"
    bl_label = "Publish"
    bl_description = "Run the checks, fix what Nkata can, and publish this version"
    ready: bpy.props.BoolProperty(default=False)  # type: ignore[valid-type]

    def execute(self, _context: bpy.types.Context) -> set[str]:
        wm = bpy.context.window_manager
        note = str(getattr(wm, "nkata_note", "")).strip()
        details = str(getattr(wm, "nkata_note_engineering", "")).strip()
        if not note:
            self.report({"WARNING"}, "Write one line on what you did before Publish")
            return {"CANCELLED"}
        try:
            client, part = _client_and_part()
            results = run_checks(part, fix=True)
            res = client.publish(part["id"], results, self.ready, note, details)
        except AgentError as e:
            self.report({"ERROR"}, e.message)
            return {"CANCELLED"}
        with STATE.lock:
            if res.published:
                STATE.part = {**part, "state": res.state}
                STATE.publish_line = "Published" + (" and marked Ready" if res.state == "ready" else "")
                wm.nkata_note = ""
                wm.nkata_note_engineering = ""
            else:
                names = ", ".join(CHECK_WORDS.get(b.check_id, b.check_id) for b in res.blocked_by)
                STATE.publish_line = f"{len(res.blocked_by)} checks block: {names}"
            STATE.dirty = True
        if not res.published:
            self.report({"WARNING"}, STATE.publish_line)
            return {"CANCELLED"}
        log("publish.done", part_id=part["id"], version_id=res.version_id, state=res.state)
        if res.render_needed:
            # UE5 gave no viewport capture: Blender's viewport is the version's render.
            try:
                path = render_viewport(client, part["id"], res.version_id)
                log("render.posted", part_id=part["id"], version_id=res.version_id, path=path)
            except (AgentError, RuntimeError, OSError) as e:
                log("render.failed", part_id=part["id"], error=str(e))
                self.report({"WARNING"}, f"Marked Ready. The render did not post: {e}")
        return {"FINISHED"}


def render_viewport(client: AgentClient, part_id: str, version_id: str) -> str:
    """Renders the 3D viewport as it is to the spool and posts it as the version's render.
    bpy.ops.render.opengl: https://docs.blender.org/api/current/bpy.ops.render.html"""
    me = client.me()
    path = Path(me.spool_dir) / part_id / f"{version_id}.render.png"
    path.parent.mkdir(parents=True, exist_ok=True)
    scene = bpy.context.scene
    previous = (scene.render.filepath, scene.render.image_settings.file_format)
    scene.render.filepath = str(path)
    scene.render.image_settings.file_format = "PNG"
    try:
        result = bpy.ops.render.opengl(write_still=True, view_context=True)
    finally:
        scene.render.filepath, scene.render.image_settings.file_format = previous
    if "FINISHED" not in result or not path.is_file():
        raise RuntimeError(f"viewport render returned {result}")
    client.render(part_id, str(path))
    return str(path)


class NKATA_OT_reply(bpy.types.Operator):
    bl_idname = "nkata.reply"
    bl_label = "Reply"
    bl_description = "Add a comment on this part at the 3D cursor"
    body: bpy.props.StringProperty(name="Comment")  # type: ignore[valid-type]

    def invoke(self, context: bpy.types.Context, _event: Any) -> set[str]:
        return context.window_manager.invoke_props_dialog(self)

    def execute(self, context: bpy.types.Context) -> set[str]:
        if not self.body.strip():
            return {"CANCELLED"}
        cursor = tuple(float(v) for v in context.scene.cursor.location)
        try:
            client, part = _client_and_part()
            pin = client.create_comment(part["id"], cursor, (0.0, 0.0, 1.0), self.body.strip())
        except AgentError as e:
            self.report({"ERROR"}, e.message)
            return {"CANCELLED"}
        with STATE.lock:
            STATE.comments.setdefault(part["id"], []).append(pin.to_dict())
            STATE.dirty = True
        return {"FINISHED"}


class NKATA_OT_load_comments(bpy.types.Operator):
    bl_idname = "nkata.load_comments"
    bl_label = "Refresh comments"

    def execute(self, _context: bpy.types.Context) -> set[str]:
        try:
            client, part = _client_and_part()
            res = client.comments(part["id"])
        except AgentError as e:
            self.report({"ERROR"}, e.message)
            return {"CANCELLED"}
        with STATE.lock:
            STATE.comments[part["id"]] = [c.to_dict() for c in res.comments]
            STATE.dirty = True
        return {"FINISHED"}


class NKATA_OT_frame_pin(bpy.types.Operator):
    bl_idname = "nkata.frame_pin"
    bl_label = "Go to pin"
    index: bpy.props.IntProperty()  # type: ignore[valid-type]

    def execute(self, context: bpy.types.Context) -> set[str]:
        part = STATE.part
        if part is None:
            return {"CANCELLED"}
        comments = STATE.comments.get(part["id"], [])
        if not 0 <= self.index < len(comments):
            return {"CANCELLED"}
        pins.frame(context, comments[self.index]["point"])
        return {"FINISHED"}


def draw_start(layout: Any) -> None:
    """No part open: the parts of mine to start, or how to find them."""
    layout.label(text=STATE.error or "Save this file as a part, or start one", icon="INFO")
    for part in STATE.startable:
        op = layout.operator(NKATA_OT_start_part.bl_idname, text=f"{part.get('asset_name')} / {part.get('name')}", icon="FILE_NEW")
        op.part_id = part["id"]
    layout.operator(NKATA_OT_find_parts.bl_idname, text="Find my parts")


def draw_header(layout: Any, part: dict[str, Any]) -> None:
    owner = (part.get("owner") or {}).get("name") or "No owner"
    state_word = STATE_WORDS.get(str(part.get("state")), str(part.get("state")))
    lock = part.get("lock")
    lock_word = f"Open by {lock['holder']['name']}" if lock else "Not open"
    layout.label(text=f"{part.get('asset_name')} / {part.get('name')} · {state_word} · {owner} · {lock_word}")
    waiting = part.get("waiting_on") or []
    if waiting:
        layout.label(text=f"Waits on {', '.join(waiting)}", icon="LOCKED")


def draw_mirror(layout: Any, part: dict[str, Any]) -> None:
    view = STATE.mirror_for(part["id"])
    row = layout.row()
    row.label(text=view.line(), icon="ERROR" if view.status == "failed" else "CHECKMARK" if view.status == "synced" else "TIME")
    if view.status == "failed" or view.halted:
        row.operator(NKATA_OT_retry_mirror.bl_idname, text="Retry")
    op = row.operator(NKATA_OT_mirror_on_save.bl_idname, text="Mirror on save: On" if view.on_save else "Mirror on save: Off", icon="CHECKBOX_HLT" if view.on_save else "CHECKBOX_DEHLT")
    op.on_save = not view.on_save


def draw_reference(layout: Any, part: dict[str, Any]) -> None:
    box = layout.box()
    box.label(text="Reference")
    files = part.get("reference_files") or []
    if not files:
        box.label(text="No reference pinned")
        return
    for rel in files:
        op = box.operator(NKATA_OT_open_reference.bl_idname, text=Path(rel).name, icon="IMAGE_DATA")
        op.path = rel


def draw_checks(layout: Any, part: dict[str, Any]) -> None:
    box = layout.box()
    row = box.row()
    row.label(text="Checks")
    row.operator(NKATA_OT_run_checks.bl_idname, text="Run checks")
    results = STATE.checks.get(part["id"])
    if results is None:
        box.label(text="Checks run on save and on Publish")
        return
    card = STATE.card.get(part["id"], {})
    fixable = False
    # The checks that block come first, one line each with the number. The rest inform below.
    ordered = sorted(results, key=lambda r: 0 if r["severity"] == "block" else 1)
    for r in ordered:
        if r["passed"]:
            text = green_line(r["check_id"], card, part) + (" (fixed)" if r["auto_fixed"] else "")
            box.label(text=text, icon="CHECKMARK")
        else:
            word = CHECK_WORDS.get(r["check_id"], r["check_id"])
            icon = "ERROR" if r["severity"] == "block" else "INFO"
            box.label(text=f"{word}: {r['message']}", icon=icon)
            fixable |= r["check_id"] in checks.FIXERS
    if fixable:
        box.operator(NKATA_OT_fix_checks.bl_idname, text="Fix")


def green_line(check_id: str, card: dict[str, Any], part: dict[str, Any]) -> str:
    """What a passing check says, with its number: the artist reads the state, not a word."""
    if check_id == "texture_names":
        n = len(card.get("textures", []))
        return f"Textures named · {n}" if n else "Textures named · none"
    if check_id == "unit_scale":
        return f"Scale {card.get('unit_scale', 1.0):g}"
    if check_id == "uv_set_present":
        sets = card.get("uv_sets", [])
        return f"UVs present · {len(sets)} set{'' if len(sets) == 1 else 's'}"
    if check_id == "triangle_budget":
        spec = next((c for c in part.get("checks") or [] if c.get("id") == "triangle_budget"), None)
        limit = (spec or {}).get("params", {}).get("max")
        tris = card.get("triangles", 0)
        return f"Tris within budget · {tris:,} of {int(limit):,}" if limit else f"Tris within budget · {tris:,}"
    return f"{CHECK_WORDS.get(check_id, check_id)}: pass"


def draw_comments(layout: Any, part: dict[str, Any]) -> None:
    box = layout.box()
    row = box.row()
    row.label(text="Comments")
    row.operator(NKATA_OT_load_comments.bl_idname, text="", icon="FILE_REFRESH")
    comments = STATE.comments.get(part["id"])
    if not comments:
        box.label(text="No comments yet")
    for i, c in enumerate(comments or []):
        line = box.row()
        resolved = c.get("resolved_at") is not None
        op = line.operator(NKATA_OT_frame_pin.bl_idname, text=f"{i + 1}", icon="CHECKMARK" if resolved else "PINNED")
        op.index = i
        line.label(text=f"{(c.get('author') or {}).get('name', '')}: {c.get('body', '')}")
    box.operator(NKATA_OT_reply.bl_idname, text="Reply")


def draw_publish(layout: Any, part: dict[str, Any]) -> None:
    """The note, the details for engineers, Publish, and the card the next person will see.
    The four checks sit in their own box above (draw_checks). Publish waits for the note."""
    wm = bpy.context.window_manager
    note = str(getattr(wm, "nkata_note", "")).strip()
    layout.prop(wm, "nkata_note", text="", placeholder="What did you do, what will they get")
    details = layout.row()
    details.prop(wm, "nkata_details_open", text="Details for engineers", icon="TRIA_DOWN" if getattr(wm, "nkata_details_open", False) else "TRIA_RIGHT", emboss=False)
    if getattr(wm, "nkata_details_open", False):
        layout.prop(wm, "nkata_note_engineering", text="", placeholder="Names, pivots, anything they need")
    row = layout.row()
    row.scale_y = 1.4
    row.enabled = bool(note)
    op = row.operator(NKATA_OT_publish.bl_idname, text="Publish")
    op.ready = False
    small = layout.row()
    small.enabled = bool(note) and part.get("state") == "draft"
    op2 = small.operator(NKATA_OT_publish.bl_idname, text="Mark Ready")
    op2.ready = True
    card = STATE.card.get(part["id"])
    if card:
        layout.label(text=card_line(card), icon="INFO")
    if STATE.publish_line:
        layout.label(text=STATE.publish_line)


def card_line(card: dict[str, Any]) -> str:
    """What the next person sees: tris, textures, scale, UV sets. The artist sees it first."""
    sets = len(card.get("uv_sets", []))
    return f"{card.get('triangles', 0):,} tris · {len(card.get('textures', []))} textures · scale {card.get('unit_scale', 1.0):g} · {sets} UV set{'' if sets == 1 else 's'}"


def draw_presence(layout: Any, part: dict[str, Any]) -> None:
    here = [e for e in STATE.online if e.get("user", {}).get("id") != (STATE.me or {}).get("id")]
    if not here:
        layout.label(text="Only you here")
        return
    names = []
    for e in here:
        where = " in this part" if e.get("part_id") == part["id"] else ""
        names.append(f"{e['user']['name']}{where}")
    layout.label(text="Here: " + ", ".join(names))


class NKATA_PT_panel(bpy.types.Panel):
    bl_label = "Nkata"
    bl_idname = "NKATA_PT_panel"
    bl_space_type = "VIEW_3D"
    bl_region_type = "UI"
    bl_category = "Nkata"

    def draw(self, _context: bpy.types.Context) -> None:
        layout = self.layout
        part = STATE.part
        if part is None:
            draw_start(layout)
            return
        if STATE.error:
            layout.label(text=STATE.error, icon="ERROR")
        draw_header(layout, part)
        if STATE.unreal:
            draw_mirror(layout, part)
        draw_reference(layout, part)
        draw_checks(layout, part)
        draw_comments(layout, part)
        draw_publish(layout, part)
        draw_presence(layout, part)


CLASSES = (
    NKATA_OT_find_parts,
    NKATA_OT_start_part,
    NKATA_OT_retry_mirror,
    NKATA_OT_mirror_on_save,
    NKATA_OT_open_reference,
    NKATA_OT_run_checks,
    NKATA_OT_fix_checks,
    NKATA_OT_publish,
    NKATA_OT_reply,
    NKATA_OT_load_comments,
    NKATA_OT_frame_pin,
    NKATA_PT_panel,
)


def register() -> None:
    for cls in CLASSES:
        bpy.utils.register_class(cls)
    # The publish note lives on the window manager: it survives a redraw and clears on Publish.
    # https://docs.blender.org/api/current/bpy.props.html
    bpy.types.WindowManager.nkata_note = bpy.props.StringProperty(name="Note", maxlen=200, options={"TEXTEDIT_UPDATE"})
    bpy.types.WindowManager.nkata_note_engineering = bpy.props.StringProperty(name="Details for engineers", maxlen=2000)
    bpy.types.WindowManager.nkata_details_open = bpy.props.BoolProperty(name="Details for engineers", default=False)
    pins.register()


def unregister() -> None:
    pins.unregister()
    for name in ("nkata_note", "nkata_note_engineering", "nkata_details_open"):
        if hasattr(bpy.types.WindowManager, name):
            delattr(bpy.types.WindowManager, name)
    for cls in reversed(CLASSES):
        bpy.utils.unregister_class(cls)

"""The N-panel, v8 (docs/tasks/v8-prompts.md, step 12). Blender's own grays, sizes and spacing;
Nkata shows through the Publish button, the people on pins, and the small mark. Top to bottom:

1. "Connected to {project}", or one button "Add to {project}" when the file is outside it.
2. The team: who is in the project now, and who is in this file.
3. The four checks, live as the artist works (live.py throttles to one run every 2 s).
   A failed check says its fix in one line.
4. New comments, each with Jump to pin and Done; then the pins still open (v8 step 14).
5. The note (required), Details for engineers (collapsed), Publish with the app's labels.

Everything drawn comes from STATE, filled by the save hook, the live timer and the SSE
listener. The draw function never calls the agent. Operators call the agent and update STATE."""

from __future__ import annotations

import array
import time
from pathlib import Path
from typing import Any

import bpy

from . import checks, live, mapping, pins, save_hook
from . import kind as kind_rules
from .agent_client import AgentClient, AgentError
from .log import log
from .state import STATE

KIND_WORDS = {"object": "Object", "environment": "Environment"}


def _client_and_part() -> tuple[AgentClient, dict[str, Any]]:
    part = STATE.part
    root = mapping.find_project_root(Path(bpy.data.filepath)) if bpy.data.filepath else None
    if part is None or root is None:
        raise AgentError("no_part", "Save this file into the project first")
    return AgentClient(mapping.read_token(root)), part


def _collection(part: dict[str, Any]) -> Any:
    name = (part.get("mapping") or {}).get("collection")
    col = bpy.data.collections.get(name) if name else None
    if col is None:
        raise AgentError("no_collection", f"collection {name!r} is not in this file")
    return col


def asset_kind(part: dict[str, Any]) -> str:
    return STATE.kind.get(part["id"]) or ("environment" if part.get("kind") == "level_area" else "object")


def asset_budget(part: dict[str, Any]) -> int:
    group = kind_rules.group_of(STATE.rel_file or "")
    return live.budget_for(STATE.budgets, asset_kind(part), group, part.get("budget"))


def run_checks(part: dict[str, Any], fix: bool) -> list[dict[str, Any]]:
    """The four checks on the open scene with the project's budget; kept in STATE for the panel
    and the manifest. With fix, applies unit scale and texture names to the scene first."""
    col = _collection(part)
    if fix and bpy.context.mode != "OBJECT":
        # Edit mode keeps the mesh in its own buffer: writes are dropped. Leave it first.
        bpy.ops.object.mode_set(mode="OBJECT")
    facts = save_hook.gather_facts(col)
    budget = asset_budget(part)
    max_texture = (STATE.budgets or {}).get("max_texture")
    results, after = live.run_four(facts, budget, max_texture, fix=fix)
    if fix:
        apply_fixes(col, facts, after)
    with STATE.lock:
        STATE.checks[part["id"]] = results
        STATE.card[part["id"]] = checks.summary(after)
        STATE.checks_at = time.monotonic()
        STATE.dirty = True
    return results


def check_lines(part: dict[str, Any]) -> list[live.CheckLine]:
    return live.lines(STATE.checks.get(part["id"]) or [], STATE.card.get(part["id"], {}), asset_budget(part))


def apply_fixes(collection: Any, before: checks.SceneFacts, after: checks.SceneFacts) -> None:
    """Writes the fixers' results back into the scene: unit scale, object names, origins, textures."""
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
    same amount, so the geometry stays where the artist left it.
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


# ---- Add to {project}


def relink_textures() -> str:
    """Keeps every image resolving after the move: absolute paths when the files are there,
    packed into the .blend when any is missing. Returns which: "relinked" or "packed"."""
    images = [img for img in getattr(bpy.data, "images", []) or [] if str(getattr(img, "filepath", "") or "")]
    missing = [img for img in images if not getattr(img, "packed_file", None) and not Path(bpy.path.abspath(img.filepath)).is_file()]
    if missing:
        bpy.ops.file.pack_all()
        return "packed"
    bpy.ops.file.make_paths_absolute()
    return "relinked"


def add_target(root: Path, current: Path, kind: str) -> Path:
    """Where the file goes: <project>/<Objects or Environments>/<stem>/<stem>.blend."""
    group = "Environments" if kind == "environment" else "Objects"
    stem = current.stem or "model"
    return root / group / stem / f"{stem}.blend"


class NKATA_OT_add_to_project(bpy.types.Operator):
    bl_idname = "nkata.add_to_project"
    bl_label = "Add to project"
    bl_description = "Move this file into the project. Textures keep working. The team sees it on the next save"

    def execute(self, _context: bpy.types.Context) -> set[str]:
        root = mapping.current_project()
        if root is None:
            self.report({"WARNING"}, "Open the project in Nkata first")
            return {"CANCELLED"}
        if not bpy.data.filepath:
            self.report({"WARNING"}, "Save this file once, anywhere, then add it")
            return {"CANCELLED"}
        current = Path(bpy.data.filepath)
        guess = kind_rules.kind_from_scene(save_hook.scene_bounds(), save_hook.scene_skinned())
        target = add_target(root, current, guess)
        if target.exists():
            self.report({"WARNING"}, f"{target.name} is already in the project. Rename this file first")
            return {"CANCELLED"}
        how = relink_textures()
        target.parent.mkdir(parents=True, exist_ok=True)
        result = bpy.ops.wm.save_as_mainfile(filepath=str(target))
        if "FINISHED" not in result:
            self.report({"ERROR"}, f"Blender did not save: {result}")
            return {"CANCELLED"}
        if current.is_file() and current.resolve() != target.resolve():
            try:
                current.unlink()
            except OSError as e:
                log("add.old_file_stays", path=str(current), error=str(e))
        bpy.ops.wm.open_mainfile(filepath=str(target))
        rel = mapping.relative_file(root, target)
        with STATE.lock:
            STATE.added_line = f"Added to {STATE.project_name or root.name}. Textures {how}."
            STATE.dirty = True
        log("add.done", file=rel, textures=how)
        self.report({"INFO"}, STATE.added_line)
        return {"FINISHED"}


class NKATA_OT_set_kind(bpy.types.Operator):
    bl_idname = "nkata.set_kind"
    bl_label = "Kind"
    bl_description = "What this file is on the wall: an object turns on the stage, an environment shows its render"
    kind: bpy.props.StringProperty()  # type: ignore[valid-type]

    def execute(self, _context: bpy.types.Context) -> set[str]:
        part = STATE.part
        if part is None or self.kind not in KIND_WORDS:
            return {"CANCELLED"}
        kind_rules.remember(Path(bpy.data.filepath), self.kind)
        with STATE.lock:
            STATE.kind[part["id"]] = self.kind
            STATE.dirty = True
        log("kind.set", part_id=part["id"], kind=self.kind)
        return {"FINISHED"}


class NKATA_OT_fix_checks(bpy.types.Operator):
    bl_idname = "nkata.fix_checks"
    bl_label = "Fix"
    bl_description = "Apply the scale and rename the images, then check again"

    def execute(self, _context: bpy.types.Context) -> set[str]:
        try:
            _client, part = _client_and_part()
            results = run_checks(part, fix=True)
        except AgentError as e:
            self.report({"ERROR"}, e.message)
            return {"CANCELLED"}
        fixed = [r["check_id"] for r in results if r["auto_fixed"]]
        self.report({"INFO"}, "Fixed" if fixed else "Nothing to fix")
        return {"FINISHED"}


class NKATA_OT_publish(bpy.types.Operator):
    bl_idname = "nkata.publish"
    bl_label = "Publish"
    bl_description = "Hand this save to the team with one line on what changed"

    def execute(self, _context: bpy.types.Context) -> set[str]:
        wm = bpy.context.window_manager
        note = str(getattr(wm, "nkata_note", "")).strip()
        details = str(getattr(wm, "nkata_note_engineering", "")).strip()
        try:
            client, part = _client_and_part()
            results = run_checks(part, fix=True)
        except AgentError as e:
            self.report({"ERROR"}, e.message)
            return {"CANCELLED"}
        rows = check_lines(part)
        label = live.publish_label(rows, note)
        if label != "Publish":
            with STATE.lock:
                STATE.publish_line = "Fix the red check first." if "red" in label else "Write one line on what changed first."
                STATE.dirty = True
            self.report({"WARNING"}, STATE.publish_line)
            return {"CANCELLED"}
        try:
            res = client.publish(part["id"], results, False, note, details)
        except AgentError as e:
            self.report({"ERROR"}, e.message)
            return {"CANCELLED"}
        with STATE.lock:
            if res.published:
                STATE.publish_line = "Published. The team can see it now."
                STATE.decision_line = ""
                wm.nkata_note = ""
                wm.nkata_note_engineering = ""
            else:
                STATE.publish_line = "Fix the red check first."
            STATE.dirty = True
        if not res.published:
            self.report({"WARNING"}, STATE.publish_line)
            return {"CANCELLED"}
        log("publish.done", part_id=part["id"], version_id=res.version_id)
        return {"FINISHED"}


class NKATA_OT_reply(bpy.types.Operator):
    bl_idname = "nkata.reply"
    bl_label = "Comment"
    bl_description = "Pin a comment at the 3D cursor"
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
            STATE.seen_comments.add(str(pin.id))
            STATE.dirty = True
        return {"FINISHED"}


class NKATA_OT_frame_pin(bpy.types.Operator):
    bl_idname = "nkata.frame_pin"
    bl_label = "Jump to pin"
    index: bpy.props.IntProperty()  # type: ignore[valid-type]

    def execute(self, context: bpy.types.Context) -> set[str]:
        part = STATE.part
        if part is None:
            return {"CANCELLED"}
        comments = STATE.comments.get(part["id"], [])
        if not 0 <= self.index < len(comments):
            return {"CANCELLED"}
        pins.frame(context, comments[self.index]["point"])
        with STATE.lock:
            STATE.seen_comments.add(str(comments[self.index].get("id")))
            STATE.dirty = True
        return {"FINISHED"}


class NKATA_OT_settle_pin(bpy.types.Operator):
    """Done on a pin, or Reopen (v8 step 14). The agent asks the server, which decides who may;
    the panel then shows the comment as the server returned it."""

    bl_idname = "nkata.settle_pin"
    bl_label = "Done"
    index: bpy.props.IntProperty()  # type: ignore[valid-type]
    done: bpy.props.BoolProperty(default=True)  # type: ignore[valid-type]

    def execute(self, _context: bpy.types.Context) -> set[str]:
        part = STATE.part
        if part is None:
            return {"CANCELLED"}
        comments = STATE.comments.get(part["id"], [])
        if not 0 <= self.index < len(comments):
            return {"CANCELLED"}
        try:
            client, _ = _client_and_part()
            pin = client.settle_comment(part["id"], str(comments[self.index].get("id")), bool(self.done))
        except AgentError as e:
            self.report({"ERROR"}, e.message)
            return {"CANCELLED"}
        with STATE.lock:
            comments[self.index] = pin.to_dict()
            STATE.seen_comments.add(str(pin.id))
            STATE.dirty = True
        return {"FINISHED"}


# ---- draw


def _first_name(c: dict[str, Any]) -> str:
    return str((c.get("author") or {}).get("name", "")).split(" ")[0]


def draw_outside(layout: Any) -> None:
    """The file is outside the project (or not saved): one button, one line."""
    project = STATE.project_name or (mapping.current_project() or Path("")).name
    if STATE.added_line:
        layout.label(text=STATE.added_line, icon="CHECKMARK")
    if not project:
        layout.label(text="Open the project in Nkata first", icon="INFO")
        return
    row = layout.row()
    row.scale_y = 1.4
    row.operator(NKATA_OT_add_to_project.bl_idname, text=f"Add to {project}", icon="IMPORT")
    layout.label(text="Saves in the project reach the team in seconds")


def draw_connected(layout: Any, part: dict[str, Any]) -> None:
    project = STATE.project_name or "the project"
    layout.label(text=f"Connected to {project}", icon="CHECKMARK")
    if STATE.added_line:
        layout.label(text=STATE.added_line)
    if STATE.decision_line:
        layout.label(text=STATE.decision_line, icon="CHECKMARK" if STATE.decision_approved else "ERROR")
    current = asset_kind(part)
    row = layout.row(align=True)
    for key, word in KIND_WORDS.items():
        op = row.operator(NKATA_OT_set_kind.bl_idname, text=word, depress=(key == current))
        op.kind = key


def draw_team(layout: Any, part: dict[str, Any]) -> None:
    me = (STATE.me or {}).get("id")
    here = [e for e in STATE.online if e.get("user", {}).get("id") != me]
    if not here:
        layout.label(text="Only you in the project now", icon="USER")
        return
    row = layout.row(align=True)
    for e in here:
        name = str(e.get("user", {}).get("name") or "?")
        in_file = e.get("part_id") == part["id"]
        row.label(text=f"{name[:1].upper()} {name.split(' ')[0]}" + (" · in this file" if in_file else ""), icon="USER")


def draw_checks(layout: Any, part: dict[str, Any]) -> None:
    box = layout.box()
    rows = check_lines(part)
    fixable = False
    for r in rows:
        box.label(text=r.sentence, icon="CHECKMARK" if r.passed else "ERROR")
        if not r.passed and STATE.checks.get(part["id"]):
            box.label(text=r.fix)
            fixable |= r.key in ("textures", "scale")
    if fixable:
        box.operator(NKATA_OT_fix_checks.bl_idname, text="Fix")


def draw_comments(layout: Any, part: dict[str, Any]) -> None:
    """New comments first, each with Jump to pin and Done. Then the pins still open that the
    artist has already seen, so what the lead is waiting on stays in view until it is done."""
    comments = STATE.comments.get(part["id"]) or []
    fresh = [(i, c) for i, c in enumerate(comments) if str(c.get("id")) not in STATE.seen_comments]
    still_open = [(i, c) for i, c in enumerate(comments) if str(c.get("id")) in STATE.seen_comments and not c.get("resolved_at")]
    box = layout.box()
    if not fresh:
        box.label(text="No new comments")
    for i, c in fresh:
        line = box.row()
        line.label(text=f"{_first_name(c)}: {c.get('body', '')}", icon="PINNED")
        op = line.operator(NKATA_OT_frame_pin.bl_idname, text="Jump to pin")
        op.index = i
        if not c.get("resolved_at"):
            op = line.operator(NKATA_OT_settle_pin.bl_idname, text="Done")
            op.index = i
            op.done = True
    if still_open:
        box.label(text=f"Still open: {len(still_open)}")
        for i, c in still_open:
            line = box.row()
            line.label(text=f"{_first_name(c)}: {c.get('body', '')}", icon="PINNED")
            op = line.operator(NKATA_OT_frame_pin.bl_idname, text="Jump to pin")
            op.index = i
            op = line.operator(NKATA_OT_settle_pin.bl_idname, text="Done")
            op.index = i
            op.done = True
    box.operator(NKATA_OT_reply.bl_idname, text="Comment")


def draw_publish(layout: Any, part: dict[str, Any]) -> None:
    wm = bpy.context.window_manager
    note = str(getattr(wm, "nkata_note", "")).strip()
    layout.prop(wm, "nkata_note", text="", placeholder="What did you do, what will they get")
    details = layout.row()
    details.prop(wm, "nkata_details_open", text="Details for engineers", icon="TRIA_DOWN" if getattr(wm, "nkata_details_open", False) else "TRIA_RIGHT", emboss=False)
    if getattr(wm, "nkata_details_open", False):
        layout.prop(wm, "nkata_note_engineering", text="", placeholder="Names, pivots, anything they need")
    row = layout.row()
    row.scale_y = 1.4
    row.operator(NKATA_OT_publish.bl_idname, text=live.publish_label(check_lines(part), note))
    if STATE.publish_line:
        layout.label(text=STATE.publish_line)


class NKATA_PT_panel(bpy.types.Panel):
    bl_label = "Nkata"
    bl_idname = "NKATA_PT_panel"
    bl_space_type = "VIEW_3D"
    bl_region_type = "UI"
    bl_category = "Nkata"

    def draw(self, _context: bpy.types.Context) -> None:
        layout = self.layout
        part = STATE.part
        if STATE.error:
            layout.label(text=STATE.error, icon="ERROR")
        if part is None:
            draw_outside(layout)
            return
        draw_connected(layout, part)
        draw_team(layout, part)
        draw_checks(layout, part)
        draw_comments(layout, part)
        draw_publish(layout, part)


# ---- live: checks on scene change, the heartbeat

_throttle = live.Throttle(live.CHECK_EVERY_S)
_heartbeat = live.Heartbeat()


def on_depsgraph_update(*_args: Any) -> None:
    _throttle.mark()


def live_tick() -> float:
    """Every half second: re-run the checks when the scene changed and 2 s passed; send the
    heartbeat every 20 s with the open file."""
    now = time.monotonic()
    part = STATE.part
    if part is not None and _throttle.due(now):
        try:
            run_checks(part, fix=False)
        except (AgentError, RuntimeError, ValueError) as e:
            log("live.checks_failed", error=str(e))
    if part is not None and _heartbeat.due(now):
        try:
            client, _ = _client_and_part()
            res = client.presence(part["id"], STATE.rel_file)
            with STATE.lock:
                STATE.online = [e.to_dict() for e in res.online]
                STATE.dirty = True
        except AgentError as e:
            log("heartbeat.failed", error=str(e))
    return 0.5


CLASSES = (
    NKATA_OT_add_to_project,
    NKATA_OT_set_kind,
    NKATA_OT_fix_checks,
    NKATA_OT_publish,
    NKATA_OT_reply,
    NKATA_OT_frame_pin,
    NKATA_OT_settle_pin,
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
    handlers = bpy.app.handlers.depsgraph_update_post
    if on_depsgraph_update not in handlers:
        handlers.append(on_depsgraph_update)
    if not bpy.app.timers.is_registered(live_tick):
        bpy.app.timers.register(live_tick, persistent=True)
    pins.register()


def unregister() -> None:
    pins.unregister()
    if bpy.app.timers.is_registered(live_tick):
        bpy.app.timers.unregister(live_tick)
    handlers = bpy.app.handlers.depsgraph_update_post
    if on_depsgraph_update in handlers:
        handlers.remove(on_depsgraph_update)
    for name in ("nkata_note", "nkata_note_engineering", "nkata_details_open"):
        if hasattr(bpy.types.WindowManager, name):
            delattr(bpy.types.WindowManager, name)
    for cls in reversed(CLASSES):
        bpy.utils.unregister_class(cls)


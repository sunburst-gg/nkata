"""N-panel: part header and mirror status. Same seven elements as the UE5 panel, same words.
See docs/product.md, Surfaces, Blender panel. Only the first two elements ship in step 1."""

from __future__ import annotations

from pathlib import Path

import bpy

from . import mapping
from .agent_client import AgentClient, AgentError
from .log import log
from .state import STATE

STATE_WORDS = {"locked": "Locked", "draft": "Draft", "ready": "Ready", "approved": "Approved"}


class NKATA_OT_retry_mirror(bpy.types.Operator):
    bl_idname = "nkata.retry_mirror"
    bl_label = "Retry"
    bl_description = "Run the last mirror into UE5 again"

    def execute(self, _context: bpy.types.Context) -> set[str]:
        part = STATE.part
        root = mapping.find_project_root(Path(bpy.data.filepath)) if bpy.data.filepath else None
        if part is None or root is None:
            self.report({"WARNING"}, "No part is open")
            return {"CANCELLED"}
        try:
            res = AgentClient(mapping.read_token(root)).retry_mirror(part["id"])
        except AgentError as e:
            log("retry.failed", part_id=part["id"], error=str(e))
            self.report({"ERROR"}, e.message)
            return {"CANCELLED"}
        with STATE.lock:
            view = STATE.mirror_for(part["id"])
            view.halted = False
            view.status = "pending" if res.queued else view.status
            view.message = "Waiting for UE5" if res.queued else "Nothing to retry"
        return {"FINISHED"}


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
            layout.label(text="Save this file to find its part" if not STATE.error else STATE.error, icon="INFO")
            return
        owner = (part.get("owner") or {}).get("name") or "No owner"
        state_word = STATE_WORDS.get(str(part.get("state")), str(part.get("state")))
        lock = part.get("lock")
        lock_word = f"Open by {lock['holder']['name']}" if lock else "Not open"
        layout.label(text=f"{part.get('asset_name')} / {part.get('name')} · {state_word} · {owner} · {lock_word}")
        view = STATE.mirror_for(part["id"])
        if STATE.error:
            layout.label(text=STATE.error, icon="ERROR")
        row = layout.row()
        row.label(text=view.line(), icon="ERROR" if view.status == "failed" else "CHECKMARK" if view.status == "synced" else "TIME")
        if view.status == "failed" or view.halted:
            row.operator(NKATA_OT_retry_mirror.bl_idname, text="Retry")


CLASSES = (NKATA_OT_retry_mirror, NKATA_PT_panel)


def register() -> None:
    for cls in CLASSES:
        bpy.utils.register_class(cls)


def unregister() -> None:
    for cls in reversed(CLASSES):
        bpy.utils.unregister_class(cls)

"""The v8 N-panel (docs/tasks/v8-prompts.md, step 12) with bpy stubbed and a fake agent: the five
elements top to bottom, Add to {project}, the live checks and Fix, Publish with the app's
labels, comments with Jump to pin, the heartbeat, and the open flow."""

from __future__ import annotations

import json
import os
import tempfile
import threading
import types
import unittest
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from typing import Any
from unittest import mock

from . import conftest_shim  # noqa: F401
from . import bpy_stub

ID = "01ARZ3NDEKTSV4RRFFQ69G5FAV"
ID2 = "01BX5ZZKBKACTAV9WEVGEMMVRZ"
AT = "2026-10-05T12:00:00.000Z"
USER = {"id": ID2, "name": "Ada Okafor", "avatar_url": None}
CHIDI = {"id": "01CX5ZZKBKACTAV9WEVGEMMVRA", "name": "Chidi Eze", "avatar_url": None}
PART = {
    "id": ID, "asset_id": ID2, "asset_name": "Radio", "name": "model", "state": "draft", "owner": USER, "lock": None, "gate": {"after": []},
    "mapping": {"kind": "blend_collection", "file": "Props/Radio/Radio.blend", "collection": "model"}, "kind": "prop", "export_name": "SM_Radio",
    "checks": [], "reference_files": [], "waiting_on": [],
}
BUDGETS = {"prop": 30000, "vehicle": 60000, "character": 80000, "environment": 2000000, "max_texture": None}


class FakeAgent(BaseHTTPRequestHandler):
    calls: list[tuple[str, str, Any]] = []
    comments: list[dict[str, Any]] = []
    parts: list[dict[str, Any]] = [PART]
    refuse_open: bool = False
    budgets: dict[str, Any] | None = BUDGETS
    online: list[dict[str, Any]] = []

    def log_message(self, *_a: Any) -> None:
        return

    def _json(self, status: int, body: dict[str, Any]) -> None:
        data = json.dumps(body).encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def do_GET(self) -> None:  # noqa: N802
        FakeAgent.calls.append(("GET", self.path, None))
        if self.path == "/me":
            me = {"v": 1, "user": USER, "project": {"id": ID, "name": "Rising Sun", "folder_name": "rising-sun"}, "package_version": "0.1.0", "online": True, "spool_dir": "/tmp/spool", "mode": "sync", "mirror_paused": False, "unreal": False}
            if FakeAgent.budgets:
                me["budgets"] = FakeAgent.budgets
            return self._json(200, me)
        if self.path == "/parts" or self.path.startswith("/parts?"):
            return self._json(200, {"v": 1, "parts": FakeAgent.parts})
        if self.path.endswith("/comments"):
            return self._json(200, {"v": 1, "comments": FakeAgent.comments})
        return self._json(404, {"v": 1, "error": {"code": "not_found", "message": self.path}})

    def do_POST(self) -> None:  # noqa: N802
        n = int(self.headers.get("Content-Length") or 0)
        body = json.loads(self.rfile.read(n)) if n else None
        FakeAgent.calls.append(("POST", self.path, body))
        if self.path.endswith("/open") and FakeAgent.refuse_open:
            return self._json(403, {"v": 1, "error": {"code": "forbidden", "message": "an approved part is read-only unless you are an art director or producer"}})
        if self.path.endswith("/open"):
            return self._json(200, {"v": 1, "granted": True, "lock": {"holder": USER, "granted_at": AT, "heartbeat_at": AT, "expires_at": AT, "stale": False}})
        if self.path == "/presence":
            return self._json(200, {"v": 1, "online": [{"user": USER, "part_id": body["part_id"], "since": AT, "last_seen": AT}, *FakeAgent.online]})
        if self.path == "/assets":
            made = {**PART, "id": "01NEWPART0000000000000000A", "asset_name": body["name"], "mapping": {"kind": "blend_collection", "file": body["file"], "collection": "model"}}
            FakeAgent.parts = [*FakeAgent.parts, made]
            return self._json(201, {"v": 1, "part": made})
        if self.path.endswith("/publish"):
            blocked = [r for r in body["check_results"] if not r["passed"] and r["severity"] == "block"]
            if blocked:
                return self._json(200, {"v": 1, "published": False, "version_id": ID, "state": "draft", "blocked_by": blocked, "render_needed": False})
            return self._json(200, {"v": 1, "published": True, "version_id": ID, "state": "draft", "blocked_by": [], "render_needed": False})
        if self.path.endswith("/resolve") or self.path.endswith("/reopen"):
            cid = self.path.split("/")[-2]
            for c in FakeAgent.comments:
                if c["id"] == cid:
                    c["resolved_at"] = AT if self.path.endswith("/resolve") else None
                    return self._json(200, {"v": 1, "comment": c})
            return self._json(404, {"v": 1, "error": {"code": "not_found", "message": cid}})
        if self.path.endswith("/comments"):
            pin = {"id": f"01C0MMENT000000000000000{len(FakeAgent.comments) + 1:02d}"[:26], "part_id": ID, "version_id": ID2, "author": USER, "point": body["point"], "normal": body["normal"], "body": body["body"], "kind": body.get("kind", "pin"), "resolved_at": None, "created_at": AT}
            FakeAgent.comments.append(pin)
            return self._json(201, {"v": 1, "comment": pin})
        if self.path.endswith("/checks"):
            return self._json(200, {"v": 1, "version_id": ID, "recorded": len(body["results"])})
        if self.path.endswith("/saved"):
            return self._json(201, {"v": 1, "version_id": ID, "mirror": "skipped"})
        if self.path.endswith("/close"):
            return self._json(200, {"v": 1, "released": True})
        if self.path.endswith("/render"):
            return self._json(200, {"v": 1, "version_id": ID, "stored": True})
        return self._json(404, {"v": 1, "error": {"code": "not_found", "message": self.path}})


class FakeLayout:
    """Records what the panel draws: labels, operators, boxes, in order."""

    def __init__(self, sink: list[str] | None = None) -> None:
        self.lines: list[str] = sink if sink is not None else []
        self.enabled = True
        self.scale_y = 1.0

    def label(self, text: str = "", icon: str = "") -> None:
        self.lines.append(f"label:{text}")

    def operator(self, idname: str, text: str = "", icon: str = "", depress: bool = False) -> Any:
        self.lines.append(f"op:{idname}:{text}" + (":on" if depress else ""))
        return mock.MagicMock()

    def prop(self, data: Any, name: str, text: str = "", **_kw: Any) -> None:
        self.lines.append(f"prop:{name}:{getattr(data, name, '')}")

    def row(self, align: bool = False) -> FakeLayout:
        return FakeLayout(self.lines)

    def box(self) -> FakeLayout:
        self.lines.append("box")
        return FakeLayout(self.lines)

    def separator(self) -> None:
        self.lines.append("separator")


class PanelTest(unittest.TestCase):
    def setUp(self) -> None:
        self.tmp = tempfile.TemporaryDirectory()
        self.root = Path(self.tmp.name) / "rising-sun"
        (self.root / ".nkata-agent").mkdir(parents=True)
        (self.root / ".nkata-agent" / "token").write_text("tok")
        self.blend = self.root / "Props" / "Radio" / "Radio.blend"
        self.blend.parent.mkdir(parents=True)
        self.blend.write_bytes(b"")
        FakeAgent.calls = []
        FakeAgent.comments = []
        FakeAgent.parts = [PART]
        FakeAgent.budgets = BUDGETS
        FakeAgent.online = []
        FakeAgent.refuse_open = False
        self.server = ThreadingHTTPServer(("127.0.0.1", 0), FakeAgent)
        threading.Thread(target=self.server.serve_forever, daemon=True).start()
        self.radio = bpy_stub.FakeObject("Radio", coords=[0.0, 0.0, 0.0, 1.0, 0.0, 0.0, 0.0, 1.0, 0.0], materials=["M_Radio"])
        self.collection = bpy_stub.FakeCollection("model", [self.radio], [bpy_stub.FakeExporter()])
        self.bpy = bpy_stub.install({"model": self.collection}, str(self.blend))
        from nkata import panel, save_hook, state

        state.STATE.part = None
        state.STATE.last_hashes.clear()
        state.STATE.checks.clear()
        state.STATE.comments.clear()
        state.STATE.kind.clear()
        state.STATE.seen_comments.clear()
        state.STATE.online = []
        state.STATE.error = ""
        state.STATE.publish_line = ""
        state.STATE.added_line = ""
        state.STATE.project_name = ""
        state.STATE.budgets = None
        state.STATE.card.clear()
        self.bpy.context.window_manager.nkata_note = ""
        self.bpy.context.window_manager.nkata_note_engineering = ""
        self.panel = panel
        self.save_hook = save_hook
        self.state = state.STATE
        self.env = mock.patch.dict(os.environ, {"NKATA_AGENT_URL": f"http://127.0.0.1:{self.server.server_port}"})
        self.env.start()
        self.listener = mock.patch.object(save_hook, "_ensure_listener", lambda _c: None)
        self.listener.start()

    def tearDown(self) -> None:
        self.listener.stop()
        self.env.stop()
        self.server.shutdown()
        self.tmp.cleanup()

    def draw(self) -> list[str]:
        layout = FakeLayout()
        p = self.panel.NKATA_PT_panel()
        p.layout = layout
        p.draw(None)
        return layout.lines

    def test_open_reads_the_project_and_the_budgets_and_the_panel_shows_the_five_elements(self) -> None:
        out = self.save_hook.handle_open(str(self.blend))
        self.assertTrue(out["granted"])
        self.assertEqual(self.state.project_name, "Rising Sun")
        self.assertEqual(self.state.budgets, BUDGETS)
        self.assertEqual(self.state.kind[ID], "object", "Props is an object folder")
        lines = self.draw()
        text = "\n".join(lines)
        self.assertIn("label:Connected to Rising Sun", text)
        self.assertIn("op:nkata.set_kind:Object:on", text)
        self.assertIn("op:nkata.set_kind:Environment", text)
        self.assertIn("label:Only you in the project now", text)
        self.assertIn("label:Not checked yet.", text)
        self.assertIn("label:No new comments", text)
        self.assertIn("prop:nkata_note:", text)
        self.assertIn("op:nkata.publish:Publish, after the note", text, "nothing checked is not red")
        order = [lines.index(x) for x in ("label:Connected to Rising Sun", "label:Only you in the project now", "label:Not checked yet.", "label:No new comments", "op:nkata.publish:Publish, after the note")]
        self.assertEqual(order, sorted(order), "the five elements keep their order")
        for banned in ("Draft", "Locked", "Mark Ready", "Mirror", "gate", "state", "Reference"):
            self.assertNotIn(banned, text)

    def test_a_save_runs_the_four_checks_with_the_project_budget_and_fix_turns_them_green(self) -> None:
        self.bpy.context.scene.unit_settings.scale_length = 0.01
        self.bpy.data.images = [types.SimpleNamespace(name="radio diffuse", size=(2048, 2048), filepath="", packed_file=None)]
        self.save_hook.handle_open(str(self.blend))
        self.save_hook.handle_save(str(self.blend))
        results = self.state.checks[ID]
        self.assertEqual([r["check_id"] for r in results], ["texture_names", "unit_scale", "uv_set_present", "triangle_budget"])
        self.assertEqual([r["passed"] for r in results], [False, False, True, True])
        self.assertEqual(results[3]["message"], "", "the budget from the project, 30,000, holds one triangle")
        text = "\n".join(self.draw())
        self.assertIn("label:Rename the images T_<asset>_<map>. Fix does it.", text)
        self.assertIn("label:Apply scale in Blender. Fix does it.", text)
        self.assertIn("label:1 triangles, within budget of 30,000", text)
        self.assertIn("op:nkata.fix_checks:Fix", text)
        self.assertIn("op:nkata.publish:Publish, after the red one", text)
        self.assertEqual(self.panel.NKATA_OT_fix_checks().execute(None), {"FINISHED"})
        self.assertEqual(self.bpy.context.scene.unit_settings.scale_length, 1.0)
        self.assertEqual(self.bpy.data.images[0].name, "T_radio_diffuse")
        self.assertTrue(all(r["passed"] for r in self.state.checks[ID]))
        text = "\n".join(self.draw())
        self.assertIn("label:Textures named · 1", text)
        self.assertIn("label:Scale 1", text)
        self.assertIn("op:nkata.publish:Publish, after the note", text)
        # The GLB and the manifest sit next to the .blend, with the four checks inside.
        glb = self.blend.parent / ".nkata-exports" / (self.blend.stem + ".glb")
        self.assertTrue(glb.is_file())
        manifest = json.loads((self.blend.parent / ".nkata-exports" / (self.blend.stem + ".manifest.json")).read_text())
        self.assertEqual(manifest["asset_kind"], "object")
        self.assertEqual([c["key"] for c in manifest["checks"]], ["textures", "scale", "uv", "tris"])
        self.assertEqual([c["pass"] for c in manifest["checks"]], [False, False, True, True])
        saved = [c for c in FakeAgent.calls if c[1] == f"/parts/{ID}/saved"][-1][2]
        self.assertEqual(saved["spool_path"], str(glb))

    def test_the_budget_follows_the_kind_the_artist_picks(self) -> None:
        self.save_hook.handle_open(str(self.blend))
        op = self.panel.NKATA_OT_set_kind()
        op.kind = "environment"
        self.assertEqual(op.execute(None), {"FINISHED"})
        self.assertEqual(self.state.kind[ID], "environment")
        self.assertEqual(json.loads((self.blend.parent / ".nkata-exports" / (self.blend.stem + ".nkata.json")).read_text())["kind"], "environment")
        self.assertEqual(self.panel.asset_budget(self.state.part), 2_000_000)
        self.assertIn("op:nkata.set_kind:Environment:on", self.draw())
        # The pick survives the next open.
        self.save_hook.handle_open(str(self.blend))
        self.assertEqual(self.state.kind[ID], "environment")

    def test_an_environment_save_renders_the_still_and_posts_it(self) -> None:
        self.save_hook.handle_open(str(self.blend))
        op = self.panel.NKATA_OT_set_kind()
        op.kind = "environment"
        self.assertEqual(op.execute(None), {"FINISHED"})
        self.save_hook.handle_save(str(self.blend))
        renders = [c for c in self.bpy._ops.calls if c[0] == "render.render"]
        self.assertEqual(len(renders), 1)
        self.assertEqual(renders[0][1]["size"], (1600, 1000))
        self.assertTrue((self.blend.parent / ".nkata-exports" / (self.blend.stem + ".png")).is_file())
        posted = [c for c in FakeAgent.calls if c[1] == f"/parts/{ID}/render"]
        self.assertEqual(posted[0][2]["path"], str(self.blend.parent / ".nkata-exports" / (self.blend.stem + ".png")))
        self.assertEqual(self.bpy.context.scene.render.engine, "CYCLES", "the render settings come back")
        self.assertIsNone(self.bpy.context.scene.camera)

    def test_publish_needs_green_checks_and_a_note_then_publishes_with_the_labels(self) -> None:
        self.save_hook.handle_open(str(self.blend))
        self.bpy.context.scene.unit_settings.scale_length = 0.01
        op = self.panel.NKATA_OT_publish()
        self.assertEqual(op.execute(None), {"CANCELLED"})
        self.assertEqual(self.state.publish_line, "Write one line on what changed first.", "Fix runs first, so only the note is missing")
        self.bpy.context.window_manager.nkata_note = "Dial added."
        self.bpy.context.window_manager.nkata_note_engineering = "Pivot at the base."
        self.assertIn("op:nkata.publish:Publish", self.draw())
        self.assertEqual(op.execute(None), {"FINISHED"})
        self.assertEqual(self.state.publish_line, "Published. The team can see it now.")
        self.assertEqual(self.bpy.context.window_manager.nkata_note, "")
        published = [c for c in FakeAgent.calls if c[1] == f"/parts/{ID}/publish"][-1][2]
        self.assertEqual(published["note"], "Dial added.")
        self.assertEqual(published["note_engineering"], "Pivot at the base.")
        self.assertFalse(published["ready"])
        self.assertTrue(all(r["passed"] for r in published["check_results"]))
        self.assertEqual([c for c in self.bpy._ops.calls if c[0] == "export_scene.fbx"], [], "FBX only on demand (Decisions 15)")

    def test_comments_arrive_as_new_with_jump_to_pin_and_a_reply_pins_at_the_cursor(self) -> None:
        self.save_hook.handle_open(str(self.blend))
        self.state.apply_event({"kind": "comment.created", "comment": {"id": "other", "part_id": ID, "body": "Loosen the ridge.", "author": CHIDI, "point": [0, 0, 1], "resolved_at": None}})
        text = "\n".join(self.draw())
        self.assertIn("label:Chidi: Loosen the ridge.", text)
        self.assertIn("op:nkata.frame_pin:Jump to pin", text)
        jump = self.panel.NKATA_OT_frame_pin()
        jump.index = 0
        ctx = types.SimpleNamespace(scene=self.bpy.context.scene, screen=types.SimpleNamespace(areas=[]), temp_override=self.bpy.context.temp_override)
        self.assertEqual(jump.execute(ctx), {"FINISHED"})
        self.assertEqual(tuple(self.bpy.context.scene.cursor.location), (0.0, 0.0, 1.0))
        self.assertIn("label:No new comments", "\n".join(self.draw()), "a pin jumped to is seen")
        reply = self.panel.NKATA_OT_reply()
        reply.body = "Done."
        self.bpy.context.scene.cursor.location = (0.5, 0.25, 0.0)
        self.assertEqual(reply.execute(self.bpy.context), {"FINISHED"})
        sent = [c for c in FakeAgent.calls if c[1] == f"/parts/{ID}/comments" and c[0] == "POST"][0][2]
        self.assertEqual(sent["point"], [0.5, 0.25, 0.0])
        self.assertIn("label:No new comments", "\n".join(self.draw()), "my own comment is not new to me")

    def test_the_leads_decision_shows_in_the_panel_and_publish_clears_it(self) -> None:
        self.save_hook.handle_open(str(self.blend))
        self.state.apply_event({"kind": "comment.created", "comment": {"id": "c1", "part_id": ID, "body": "Loosen the ridge.", "author": CHIDI, "point": [0, 0, 1], "resolved_at": None}})
        self.state.apply_event({"kind": "review.decided", "part_id": ID, "actor_id": CHIDI["id"], "decision": "send_back", "note": "Loosen the ridge.", "score": 3})
        self.assertIn("label:Chidi sent it back: Loosen the ridge.", "\n".join(self.draw()))
        self.state.apply_event({"kind": "review.decided", "part_id": "someone-else", "actor_id": CHIDI["id"], "decision": "approve", "note": "", "score": 5})
        self.assertIn("Chidi sent it back", "\n".join(self.draw()), "a decision on another asset leaves this one alone")
        self.state.apply_event({"kind": "review.decided", "part_id": ID, "actor_id": "01UNKNOWN0000000000000000A", "decision": "approve", "note": "", "score": 5})
        self.assertIn("label:The lead approved your last Publish.", "\n".join(self.draw()))

    def test_a_pin_is_marked_done_from_the_panel_and_the_app_can_do_it_too(self) -> None:
        self.save_hook.handle_open(str(self.blend))
        FakeAgent.comments.append({"id": "01C0MMENT0000000000000000A", "part_id": ID, "version_id": ID2, "author": CHIDI, "point": [0, 0, 1], "normal": [0, 0, 1], "body": "Loosen the ridge.", "kind": "pin", "resolved_at": None, "created_at": AT})
        self.state.apply_event({"kind": "comment.created", "comment": dict(FakeAgent.comments[0])})
        text = "\n".join(self.draw())
        self.assertIn("op:nkata.settle_pin:Done", text, "a new open pin offers Done")
        jump = self.panel.NKATA_OT_frame_pin()
        jump.index = 0
        ctx = types.SimpleNamespace(scene=self.bpy.context.scene, screen=types.SimpleNamespace(areas=[]), temp_override=self.bpy.context.temp_override)
        jump.execute(ctx)
        text = "\n".join(self.draw())
        self.assertIn("label:Still open: 1", text, "a seen pin that is not done stays listed")
        done = self.panel.NKATA_OT_settle_pin()
        done.index = 0
        done.done = True
        self.assertEqual(done.execute(self.bpy.context), {"FINISHED"})
        self.assertEqual([c[1] for c in FakeAgent.calls if c[1].endswith("/resolve")], [f"/parts/{ID}/comments/01C0MMENT0000000000000000A/resolve"])
        self.assertEqual(self.state.comments[ID][0]["resolved_at"], AT)
        text = "\n".join(self.draw())
        self.assertNotIn("Still open", text)
        self.assertNotIn("op:nkata.settle_pin:Done", text)
        # The lead reopens it in the app: the event arrives whole and the pin is open again.
        self.state.apply_event({"kind": "comment.resolved", "comment": {**FakeAgent.comments[0], "resolved_at": None}})
        self.assertIsNone(self.state.comments[ID][0]["resolved_at"])
        self.assertIn("label:Still open: 1", "\n".join(self.draw()))

    def test_the_team_shows_who_is_in_the_project_and_in_this_file(self) -> None:
        FakeAgent.online = [{"user": CHIDI, "part_id": ID, "since": AT, "last_seen": AT}]
        self.save_hook.handle_open(str(self.blend))
        self.assertIn("label:C Chidi · in this file", self.draw())
        self.state.apply_event({"kind": "presence.changed", "online": [{"user": CHIDI, "part_id": None, "since": AT, "last_seen": AT}]})
        self.assertIn("label:C Chidi", self.draw())

    def test_the_heartbeat_carries_the_open_file_every_twenty_seconds(self) -> None:
        self.save_hook.handle_open(str(self.blend))
        FakeAgent.calls = []
        self.panel._heartbeat.last = -1e9
        self.panel.live_tick()
        beats = [c for c in FakeAgent.calls if c[1] == "/presence"]
        self.assertEqual(len(beats), 1)
        self.assertEqual(beats[0][2], {"v": 1, "part_id": ID, "file": "Props/Radio/Radio.blend"})
        self.panel.live_tick()
        self.assertEqual(len([c for c in FakeAgent.calls if c[1] == "/presence"]), 1, "not again within 20 s")

    def test_checks_re_run_on_a_scene_change_at_most_every_two_seconds(self) -> None:
        self.save_hook.handle_open(str(self.blend))
        self.panel._throttle.last = -1e9
        self.panel._throttle.dirty = False
        with mock.patch.object(self.panel, "run_checks", wraps=self.panel.run_checks) as run:
            self.panel.live_tick()
            self.assertEqual(run.call_count, 1, "a file just opened is checked once")
            self.panel._throttle.last = -1e9
            self.panel.live_tick()
            self.assertEqual(run.call_count, 1, "nothing changed, nothing ran")
            self.panel.on_depsgraph_update()
            self.panel.live_tick()
            self.assertEqual(run.call_count, 2, "a change runs them again")
        self.assertIn(ID, self.state.checks)
        self.assertTrue(all(r["passed"] for r in self.state.checks[ID]))
        self.assertIn("label:1 triangles, within budget of 30,000", self.draw())

    def test_a_file_outside_the_project_offers_add_to_project_and_the_move_keeps_textures(self) -> None:
        outside = Path(self.tmp.name) / "Desktop" / "Lamp.blend"
        outside.parent.mkdir()
        outside.write_bytes(b"BLENDER")
        self.bpy = bpy_stub.install({"model": self.collection}, str(outside))
        self.bpy.data.images = [types.SimpleNamespace(name="T_Lamp_D", size=(1024, 1024), filepath=str(outside.with_name("T_Lamp_D.png")), packed_file=None)]
        home = Path(self.tmp.name) / "home"
        (home / ".nkata").mkdir(parents=True)
        (home / ".nkata" / "agent.json").write_text(json.dumps({"v": 1, "folder": str(self.root), "port": 7420}))
        self.save_hook.register()
        with mock.patch.dict(os.environ, {"HOME": str(home)}):
            lines = self.draw()
            self.assertIn("op:nkata.add_to_project:Add to rising-sun", lines)
            op = self.panel.NKATA_OT_add_to_project()
            self.assertEqual(op.execute(None), {"FINISHED"})
        target = self.root / "Objects" / "Lamp" / "Lamp.blend"
        self.assertTrue(target.is_file())
        self.assertFalse(outside.exists(), "the old file is gone")
        self.assertEqual(Path(self.bpy.data.filepath), target)
        calls = [c[0] for c in self.bpy._ops.calls]
        self.assertIn("file.pack_all", calls, "a texture that is not on disk is packed")
        self.assertIn("wm.open_mainfile", calls)
        self.assertIn("Added to", self.state.added_line)
        self.assertIn("Textures packed", self.state.added_line)
        # The save made the asset: one file, one part, this person's, as an object in Objects.
        made = [c for c in FakeAgent.calls if c[1] == "/assets"]
        self.assertEqual(made[0][2], {"v": 1, "name": "Lamp", "file": "Objects/Lamp/Lamp.blend", "kind": "object", "group": "Objects"})
        self.assertEqual(self.state.part["mapping"]["file"], "Objects/Lamp/Lamp.blend")

    def test_add_to_project_relinks_when_every_texture_is_on_disk(self) -> None:
        outside = Path(self.tmp.name) / "Desktop" / "Lamp.blend"
        outside.parent.mkdir()
        outside.write_bytes(b"BLENDER")
        tex = outside.with_name("T_Lamp_D.png")
        tex.write_bytes(b"png")
        self.bpy = bpy_stub.install({"model": self.collection}, str(outside))
        self.bpy.data.images = [types.SimpleNamespace(name="T_Lamp_D", size=(1024, 1024), filepath=str(tex), packed_file=None)]
        home = Path(self.tmp.name) / "home"
        (home / ".nkata").mkdir(parents=True)
        (home / ".nkata" / "agent.json").write_text(json.dumps({"v": 1, "folder": str(self.root), "port": 7420}))
        with mock.patch.dict(os.environ, {"HOME": str(home)}):
            self.assertEqual(self.panel.NKATA_OT_add_to_project().execute(None), {"FINISHED"})
        calls = [c[0] for c in self.bpy._ops.calls]
        self.assertIn("file.make_paths_absolute", calls)
        self.assertNotIn("file.pack_all", calls)
        self.assertIn("Textures relinked", self.state.added_line)

    def test_an_approved_part_opens_read_only_in_plain_words_and_offers_no_publish(self) -> None:
        FakeAgent.refuse_open = True
        self.save_hook.handle_open(str(self.blend))
        lines = self.draw()
        self.assertIn("label:Approved. A lead can reopen it.", lines)
        self.assertFalse([x for x in lines if x.startswith("op:nkata.publish")], lines)
        FakeAgent.refuse_open = False
        self.save_hook.handle_open(str(self.blend))
        self.assertTrue([x for x in self.draw() if x.startswith("op:nkata.publish")], "a granted open publishes again")

    def test_the_checks_run_when_a_file_opens_not_only_after_an_edit(self) -> None:
        self.save_hook.handle_open(str(self.blend))
        self.assertFalse(self.state.checks.get(PART["id"]))
        self.panel._throttle.last = -1e9
        self.panel._throttle.dirty = False
        self.panel.live_tick()
        self.assertTrue(self.state.checks.get(PART["id"]), "the open file's checks ran without a scene change")

    def test_a_lost_animation_shows_under_the_checks_and_holds_publish(self) -> None:
        # v8 step 17: the export read back beside the scene. The scene has Walk; the GLB does not.
        from nkata import intact

        scene = intact.Side(materials=frozenset({"M_Radio"}), animations={"Walk": 1.25})
        written = intact.Side(materials=frozenset({"M_Radio"}))
        self.save_hook.handle_open(str(self.blend))
        with mock.patch.object(self.save_hook, "scene_side", return_value=(scene, [])), mock.patch.object(intact, "read_glb", return_value=written):
            self.save_hook.handle_save(str(self.blend))
        self.assertEqual(self.state.export[ID]["intact"], False)
        saved = [c for c in FakeAgent.calls if c[1].endswith("/saved")][-1][2]
        self.assertEqual(saved["manifest"]["export"]["losses"][0]["kind"], "animation", "the manifest carries the loss to the app")
        self.bpy.context.window_manager.nkata_note = "Walk cycle in."
        lines = self.draw()
        self.assertIn("label:Animations not in the export: Walk.", lines)
        self.assertIn("op:nkata.publish:Publish, after the export", lines)
        self.assertEqual(self.panel.NKATA_OT_publish().execute(None), {"CANCELLED"})
        self.assertFalse([c for c in FakeAgent.calls if c[1].endswith("/publish")], "nothing lost reaches the team")

    def test_an_intact_export_says_so_and_publishes(self) -> None:
        from nkata import intact

        scene = intact.Side(materials=frozenset({"M_Radio"}))
        self.save_hook.handle_open(str(self.blend))
        with mock.patch.object(self.save_hook, "scene_side", return_value=(scene, [])), mock.patch.object(intact, "read_glb", return_value=scene):
            self.save_hook.handle_save(str(self.blend))
        self.assertIn("label:Export intact.", self.draw())

    def test_the_scene_side_finds_textures_their_missing_files_and_the_animations(self) -> None:
        from nkata import intact

        here = Path(self.tmp.name) / "T_Radio_D.png"
        here.write_bytes(b"png")
        def image(name: str, path: str, packed: bool = False) -> types.SimpleNamespace:
            return types.SimpleNamespace(name=name, filepath=path, packed_file=object() if packed else None, source="FILE", type="IMAGE")
        nodes = [types.SimpleNamespace(type="TEX_IMAGE", image=image("T_Radio_D.png", str(here))),
                 types.SimpleNamespace(type="TEX_IMAGE", image=image("T_Radio_N.png", "//gone/T_Radio_N.png")),
                 types.SimpleNamespace(type="TEX_IMAGE", image=image("T_Radio_R.png", "//gone/T_Radio_R.png", packed=True)),
                 types.SimpleNamespace(type="BSDF_PRINCIPLED")]
        self.radio.material_slots = [types.SimpleNamespace(material=types.SimpleNamespace(name="M_Radio", node_tree=types.SimpleNamespace(nodes=nodes)))]
        walk = types.SimpleNamespace(name="Walk", frame_range=(1.0, 31.0))
        self.radio.animation_data = types.SimpleNamespace(action=walk, nla_tracks=[types.SimpleNamespace(strips=[types.SimpleNamespace(action=walk)])])
        self.bpy.context.scene.render = types.SimpleNamespace(fps=24, fps_base=1.0)
        scene, missing = self.save_hook.scene_side(self.collection)
        self.assertEqual(scene.materials, frozenset({"M_Radio"}))
        self.assertEqual(scene.textures, frozenset({"t_radio_d", "t_radio_n", "t_radio_r"}))
        self.assertEqual(missing, [intact.MissingFile("T_Radio_N.png", "//gone/T_Radio_N.png")], "a packed image is never missing")
        self.assertEqual(scene.animations, {"Walk": 1.25})

    def test_the_export_carries_the_animations_the_scene_has(self) -> None:
        bare = bpy_stub.FakeCollection("model", [self.radio])
        out = Path(self.tmp.name) / "x.glb"
        self.save_hook.export.export_collection(bare, out, "prop", skins=False, animations=True)
        kwargs = [c[1] for c in self.bpy._ops.calls if c[0] == "export_scene.gltf"][-1]
        self.assertTrue(kwargs["export_animations"])
        self.save_hook.export.export_fbx(bare, Path(self.tmp.name) / "x.fbx", "prop", rigged=True, animations=True)
        fbx = [c[1] for c in self.bpy._ops.calls if c[0] == "export_scene.fbx"][-1]
        self.assertEqual(fbx["object_types"], {"MESH", "ARMATURE"}, "a rigged prop keeps its rig")
        self.assertTrue(fbx["bake_anim"])

    def _pointer(self) -> Path:
        home = Path(self.tmp.name) / "home"
        (home / ".nkata").mkdir(parents=True)
        (home / ".nkata" / "agent.json").write_text(json.dumps({"v": 1, "folder": str(self.root), "port": 7420}))
        return home

    def test_an_unsaved_file_asks_for_a_name_and_saves_straight_into_the_project(self) -> None:
        # It had said "Save this file once, anywhere, then add it": a trip through a file dialog
        # for a file the next click moves anyway.
        self.bpy = bpy_stub.install({"model": self.collection}, "")
        self.bpy.data.images = []
        home = self._pointer()
        self.save_hook.register()
        with mock.patch.dict(os.environ, {"HOME": str(home)}):
            op = self.panel.NKATA_OT_add_to_project()
            self.assertEqual(op.invoke(self.bpy.context, None), {"RUNNING_MODAL"}, "an unsaved file asks for a name")
            op.name = "  "
            self.assertEqual(op.execute(None), {"CANCELLED"})
            op.name = "Lantern"
            self.assertEqual(op.execute(None), {"FINISHED"})
        target = self.root / "Objects" / "Lantern" / "Lantern.blend"
        self.assertTrue(target.is_file())
        made = [c for c in FakeAgent.calls if c[1] == "/assets"]
        self.assertEqual(made[0][2]["name"], "Lantern")

    def test_my_assets_with_no_save_yet_are_offered_and_start_saves_where_they_live(self) -> None:
        # An asset made ahead of time (the seed, the app) has its .blend path already; saved
        # anywhere else it would become a second asset.
        stall = {**PART, "id": "01MARKETSTA770000000000000", "asset_name": "Market stall", "mapping": {"kind": "blend_collection", "file": "Market stall/model.blend", "collection": "model"}}
        theirs = {**stall, "id": "01THERS0000000000000000000", "asset_name": "Ojukwu", "owner": {"id": "01SMNE0000000000000000000A", "name": "Ada", "avatar_url": None}, "mapping": {"kind": "blend_collection", "file": "Ojukwu/face.blend", "collection": "face"}}
        FakeAgent.parts = [PART, stall, theirs]
        self.bpy = bpy_stub.install({"model": self.collection}, "")
        home = self._pointer()
        self.save_hook.register()
        with mock.patch.dict(os.environ, {"HOME": str(home)}):
            self.panel.refresh_startable()
            self.assertEqual([p["asset_name"] for p in self.state.startable], ["Market stall"], "Radio is on disk, Ojukwu is Ada's")
            lines = self.draw()
            self.assertIn("label:Yours, waiting for a first save", lines)
            self.assertIn("op:nkata.start_part:Start Market stall", lines)
            op = self.panel.NKATA_OT_start_part()
            op.part_id = stall["id"]
            self.assertEqual(op.execute(None), {"FINISHED"})
        self.assertTrue((self.root / "Market stall" / "model.blend").is_file())
        self.assertEqual(self.state.startable, [])
        self.assertFalse([c for c in FakeAgent.calls if c[1] == "/assets"], "starting an asset makes no new one")

    def test_without_the_app_the_panel_says_so(self) -> None:
        self.bpy = bpy_stub.install({"model": self.collection}, "")
        with mock.patch.dict(os.environ, {"HOME": self.tmp.name}):
            self.assertIn("label:Open the project in Nkata first", self.draw())
            self.assertEqual(self.panel.NKATA_OT_add_to_project().execute(None), {"CANCELLED"})


class PinsTest(unittest.TestCase):
    def test_pure_helpers(self) -> None:
        from nkata import pins

        self.assertEqual(pins.pin_label(0, {"body": "Steam reads too strong in the key light here"}), "1 Steam reads too strong in the k…")
        self.assertFalse(pins.detached((0, 0, 0), 0.01))
        self.assertTrue(pins.detached((0, 0, 0), 0.2))
        self.assertFalse(pins.detached((0, 0, 0), None))

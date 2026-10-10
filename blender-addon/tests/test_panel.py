"""The N-panel's seven elements and the open flow, with bpy stubbed and a fake agent."""

from __future__ import annotations

import json
import os
import tempfile
import threading
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
USER = {"id": ID2, "name": "Ada", "avatar_url": None}
HOLDER = {"id": "01CX5ZZKBKACTAV9WEVGEMMVRA", "name": "Chidi", "avatar_url": None}
PART = {
    "id": ID, "asset_id": ID2, "asset_name": "Ojukwu", "name": "face", "state": "draft", "owner": USER, "lock": None, "gate": {"after": []},
    "mapping": {"kind": "blend_collection", "file": "Ojukwu/face.blend", "collection": "face"}, "kind": "character",
    "checks": [{"id": "unit_scale", "severity": "block", "params": {}}, {"id": "name_pattern", "severity": "block", "params": {"pattern": "SK_.*"}}, {"id": "triangle_budget", "severity": "block", "params": {"max": 60000}}],
    "reference_files": ["Ojukwu/ref/concept.png"], "waiting_on": [],
}


class FakeAgent(BaseHTTPRequestHandler):
    calls: list[tuple[str, str, Any]] = []
    held_by: dict[str, Any] | None = None
    comments: list[dict[str, Any]] = []

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
            return self._json(200, {"v": 1, "user": USER, "project": {"id": ID, "name": "P", "folder_name": "p"}, "package_version": "0.1.0", "online": True, "spool_dir": "/tmp/spool", "mode": "sync"})
        if self.path == "/parts" or self.path.startswith("/parts?"):
            return self._json(200, {"v": 1, "parts": [PART]})
        if self.path.endswith("/comments"):
            return self._json(200, {"v": 1, "comments": FakeAgent.comments})
        return self._json(404, {"v": 1, "error": {"code": "not_found", "message": self.path}})

    def do_POST(self) -> None:  # noqa: N802
        n = int(self.headers.get("Content-Length") or 0)
        body = json.loads(self.rfile.read(n)) if n else None
        FakeAgent.calls.append(("POST", self.path, body))
        if self.path.endswith("/open"):
            if FakeAgent.held_by:
                return self._json(409, {"v": 1, "granted": False, "lock": {"holder": FakeAgent.held_by, "granted_at": AT, "heartbeat_at": AT, "expires_at": AT, "stale": False}})
            return self._json(200, {"v": 1, "granted": True, "lock": {"holder": USER, "granted_at": AT, "heartbeat_at": AT, "expires_at": AT, "stale": False}})
        if self.path == "/presence":
            return self._json(200, {"v": 1, "online": [{"user": USER, "part_id": body["part_id"], "since": AT, "last_seen": AT}, {"user": HOLDER, "part_id": None, "since": AT, "last_seen": AT}]})
        if self.path.endswith("/publish"):
            blocked = [r for r in body["check_results"] if not r["passed"] and r["severity"] == "block"]
            if blocked:
                return self._json(200, {"v": 1, "published": False, "version_id": ID, "state": "draft", "blocked_by": blocked})
            return self._json(200, {"v": 1, "published": True, "version_id": ID, "state": "ready" if body["ready"] else "draft", "blocked_by": []})
        if self.path.endswith("/comments"):
            pin = {"id": ID, "part_id": ID, "version_id": ID2, "author": USER, "point": body["point"], "normal": body["normal"], "body": body["body"], "resolved_at": None, "created_at": AT}
            FakeAgent.comments.append(pin)
            return self._json(201, {"v": 1, "comment": pin})
        if self.path.endswith("/checks"):
            return self._json(200, {"v": 1, "version_id": ID, "recorded": len(body["results"])})
        if self.path.endswith("/saved"):
            return self._json(201, {"v": 1, "version_id": ID, "mirror": "skipped"})
        if self.path.endswith("/close"):
            return self._json(200, {"v": 1, "released": True})
        return self._json(404, {"v": 1, "error": {"code": "not_found", "message": self.path}})


class FakeLayout:
    """Records what the panel draws: labels, operators, boxes, in order."""

    def __init__(self, sink: list[str] | None = None) -> None:
        self.lines: list[str] = sink if sink is not None else []
        self.enabled = True
        self.scale_y = 1.0

    def label(self, text: str = "", icon: str = "") -> None:
        self.lines.append(f"label:{text}")

    def operator(self, idname: str, text: str = "", icon: str = "") -> Any:
        self.lines.append(f"op:{idname}:{text}")
        return mock.MagicMock()

    def row(self) -> FakeLayout:
        return FakeLayout(self.lines)

    def box(self) -> FakeLayout:
        self.lines.append("box")
        return FakeLayout(self.lines)


class PanelTest(unittest.TestCase):
    def setUp(self) -> None:
        self.tmp = tempfile.TemporaryDirectory()
        root = Path(self.tmp.name) / "rising-sun"
        (root / ".nkata-agent").mkdir(parents=True)
        (root / ".nkata-agent" / "token").write_text("tok")
        self.blend = root / "Ojukwu" / "face.blend"
        self.blend.parent.mkdir()
        self.blend.write_bytes(b"")
        (root / "Ojukwu" / "ref").mkdir()
        (root / "Ojukwu" / "ref" / "concept.png").write_bytes(b"png")
        FakeAgent.calls = []
        FakeAgent.held_by = None
        FakeAgent.comments = []
        self.server = ThreadingHTTPServer(("127.0.0.1", 0), FakeAgent)
        threading.Thread(target=self.server.serve_forever, daemon=True).start()
        self.face = bpy_stub.FakeObject("face body", coords=[0.0, 0.0, 0.0, 1.0, 0.0, 0.0, 0.0, 1.0, 0.0], materials=["M_Skin"])
        self.collection = bpy_stub.FakeCollection("face", [self.face, bpy_stub.FakeObject("Armature", kind="ARMATURE", bones=20)], [bpy_stub.FakeExporter()])
        self.bpy = bpy_stub.install({"face": self.collection}, str(self.blend))
        self.bpy.context.scene.unit_settings.scale_length = 0.01
        from nkata import panel, save_hook, state

        state.STATE.part = None
        state.STATE.last_hashes.clear()
        state.STATE.checks.clear()
        state.STATE.mirror.clear()
        state.STATE.comments.clear()
        state.STATE.online = []
        state.STATE.startable = []
        state.STATE.error = ""
        state.STATE.publish_line = ""
        self.panel = panel
        self.save_hook = save_hook
        self.state = state.STATE
        self.env = mock.patch.dict(os.environ, {"NKATA_AGENT_URL": f"http://127.0.0.1:{self.server.server_port}"})
        self.env.start()
        self.listener = mock.patch.object(save_hook, "_ensure_listener", lambda _c: None)
        self.listener.start()
        self.opened = mock.patch.object(panel, "open_with_os", lambda p: FakeAgent.calls.append(("OPEN", str(p), None)))
        self.opened.start()

    def tearDown(self) -> None:
        self.opened.stop()
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

    def test_open_takes_the_lock_and_the_panel_shows_all_seven_elements(self) -> None:
        out = self.save_hook.handle_open(str(self.blend))
        self.assertTrue(out["granted"])
        self.assertEqual(self.state.part["lock"]["holder"]["name"], "Ada")
        self.assertEqual([c[1] for c in FakeAgent.calls if c[0] == "POST"], [f"/parts/{ID}/open", "/presence", ])
        lines = self.draw()
        text = "\n".join(lines)
        self.assertIn("label:Ojukwu / face · Draft · Ada · Open by Ada", text)
        self.assertIn("label:Not mirrored yet", text)
        self.assertIn("label:Reference", text)
        self.assertIn("op:nkata.open_reference:concept.png", text)
        self.assertIn("label:Checks", text)
        self.assertIn("label:Checks run on save and on Publish", text)
        self.assertIn("label:No comments yet", text)
        self.assertIn("op:nkata.reply:Reply", text)
        self.assertIn("op:nkata.publish:Publish", text)
        self.assertIn("op:nkata.publish:Mark Ready", text)
        self.assertIn("label:Here: Chidi", text)
        order = [lines.index(x) for x in ("label:Ojukwu / face · Draft · Ada · Open by Ada", "label:Not mirrored yet", "label:Reference", "label:Checks", "label:Comments", "op:nkata.publish:Publish", "label:Here: Chidi")]
        self.assertEqual(order, sorted(order), "the seven elements keep their order")

    def test_a_held_part_shows_the_holder(self) -> None:
        FakeAgent.held_by = HOLDER
        out = self.save_hook.handle_open(str(self.blend))
        self.assertFalse(out["granted"])
        self.assertIn("Chidi has this part", self.state.error)
        self.assertIn("label:Ojukwu / face · Draft · Ada · Open by Chidi", self.draw())

    def test_a_save_runs_the_checks_and_fix_applies_scale_and_names(self) -> None:
        self.save_hook.handle_open(str(self.blend))
        self.save_hook.handle_save(str(self.blend))
        results = self.state.checks[ID]
        self.assertEqual([r["check_id"] for r in results], ["unit_scale", "name_pattern", "triangle_budget"])
        self.assertEqual([r["passed"] for r in results], [False, False, True])
        recorded = [c for c in FakeAgent.calls if c[1] == f"/parts/{ID}/checks"]
        self.assertEqual(len(recorded[0][2]["results"]), 3)
        text = "\n".join(self.draw())
        self.assertIn("label:Scale: unit scale is 0.01, expected 1.0", text)
        self.assertIn("op:nkata.fix_checks:Fix", text)
        op = self.panel.NKATA_OT_fix_checks()
        self.assertEqual(op.execute(None), {"FINISHED"})
        self.assertEqual(self.bpy.context.scene.unit_settings.scale_length, 1.0)
        self.assertEqual(self.face.name, "SK_face_body")
        self.assertTrue(all(r["passed"] for r in self.state.checks[ID]))
        self.assertIn("label:Scale: pass (fixed)", "\n".join(self.draw()))

    def test_publish_is_blocked_then_passes_and_marks_ready(self) -> None:
        self.save_hook.handle_open(str(self.blend))
        self.face.name = "SK_Face"
        op = self.panel.NKATA_OT_publish()
        op.ready = True
        # Fix is part of Publish: the scale fixes itself, so this publishes and marks Ready.
        self.assertEqual(op.execute(None), {"FINISHED"})
        self.assertEqual(self.state.part["state"], "ready")
        self.assertEqual(self.state.publish_line, "Published and marked Ready")
        published = [c for c in FakeAgent.calls if c[1] == f"/parts/{ID}/publish"]
        self.assertEqual(published[-1][2]["ready"], True)
        self.assertTrue(all(r["passed"] for r in published[-1][2]["check_results"]))
        # A failure Nkata cannot fix blocks.
        self.state.part = {**PART, "checks": [{"id": "triangle_budget", "severity": "block", "params": {"max": 0}}]}
        op2 = self.panel.NKATA_OT_publish()
        op2.ready = False
        self.assertEqual(op2.execute(None), {"CANCELLED"})
        self.assertEqual(self.state.publish_line, "1 checks block: Triangle budget")

    def test_reply_pins_a_comment_at_the_cursor_and_events_update_the_list(self) -> None:
        self.save_hook.handle_open(str(self.blend))
        op = self.panel.NKATA_OT_reply()
        op.body = "Nose wider."
        self.assertEqual(op.execute(self.bpy.context), {"FINISHED"})
        sent = [c for c in FakeAgent.calls if c[1] == f"/parts/{ID}/comments" and c[0] == "POST"][0][2]
        self.assertEqual(sent["point"], [0.5, 0.25, 0.0])
        self.assertEqual(len(self.state.comments[ID]), 1)
        self.state.apply_event({"kind": "comment.created", "comment": {"id": "other", "part_id": ID, "body": "Chin.", "author": HOLDER, "point": [0, 0, 0], "resolved_at": None}})
        self.state.apply_event({"kind": "comment.created", "comment": {"id": "other", "part_id": ID, "body": "Chin.", "author": HOLDER, "point": [0, 0, 0], "resolved_at": None}})
        self.assertEqual(len(self.state.comments[ID]), 2, "an event seen twice adds one pin")
        text = "\n".join(self.draw())
        self.assertIn("label:Ada: Nose wider.", text)
        self.assertIn("label:Chidi: Chin.", text)
        self.state.apply_event({"kind": "part.state", "part_id": ID, "from": "draft", "to": "ready"})
        self.assertEqual(self.state.part["state"], "ready")
        self.state.apply_event({"kind": "presence.changed", "online": [{"user": HOLDER, "part_id": ID, "since": AT, "last_seen": AT}]})
        self.assertIn("label:Here: Chidi in this part", "\n".join(self.draw()))
        self.state.apply_event({"kind": "lock.requested", "part_id": ID, "requester": HOLDER, "holder_id": ID2})
        self.assertIn("Chidi asked to open this part", self.state.publish_line)

    def test_start_a_part_names_the_collection_and_saves_where_the_part_lives(self) -> None:
        """A new project: no file yet. The panel lists my parts from the agent's pointer, and one
        click names the collection and saves the file at the mapped path, which takes the lock."""
        root = self.blend.parents[1]
        self.blend.unlink()
        home = Path(self.tmp.name) / "home"
        (home / ".nkata").mkdir(parents=True)
        (home / ".nkata" / "agent.json").write_text(json.dumps({"v": 1, "folder": str(root), "port": 7420}))
        self.collection.name = "Collection"
        self.bpy = bpy_stub.install({"Collection": self.collection}, "")
        self.save_hook.register()
        with mock.patch.dict(os.environ, {"HOME": str(home)}):
            lines = self.draw()
            self.assertIn("label:Save this file as a part, or start one", lines)
            self.assertIn("op:nkata.find_parts:Find my parts", lines)
            self.assertEqual(self.panel.NKATA_OT_find_parts().execute(None), {"FINISHED"})
            self.assertIn("op:nkata.start_part:Ojukwu / face", self.draw())
            start = self.panel.NKATA_OT_start_part()
            start.part_id = ID
            self.assertEqual(start.execute(None), {"FINISHED"})
        self.assertEqual(self.collection.name, "face")
        self.assertEqual(Path(self.bpy.data.filepath), self.blend)
        self.assertTrue(self.blend.is_file())
        self.assertEqual(self.state.part["id"], ID)
        posts = [c[1] for c in FakeAgent.calls if c[0] == "POST"]
        self.assertIn(f"/parts/{ID}/saved", posts)
        self.assertIn(f"/parts/{ID}/open", posts)
        self.assertIn("label:Ojukwu / face · Draft · Ada · Open by Ada", self.draw())
        self.assertEqual(self.state.startable, [])
        # Without the pointer, the panel says what to do.
        with mock.patch.dict(os.environ, {"HOME": self.tmp.name}):
            self.bpy = bpy_stub.install({"Collection": self.collection}, "")
            self.assertEqual(self.panel.NKATA_OT_find_parts().execute(None), {"CANCELLED"})
            self.assertIn("Open the project in the Nkata app first", bpy_stub.FakeOps.reports[-1])

    def test_open_reference_opens_the_file_on_this_machine(self) -> None:
        self.save_hook.handle_open(str(self.blend))
        op = self.panel.NKATA_OT_open_reference()
        op.path = "Ojukwu/ref/concept.png"
        self.assertEqual(op.execute(None), {"FINISHED"})
        self.assertTrue(any(c[0] == "OPEN" and c[1].endswith("concept.png") for c in FakeAgent.calls))
        op.path = "Ojukwu/ref/missing.png"
        self.assertEqual(op.execute(None), {"CANCELLED"})


class PinsTest(unittest.TestCase):
    def test_pure_helpers(self) -> None:
        from nkata import pins

        self.assertEqual(pins.pin_color({"resolved_at": None}), pins.OPEN_COLOR)
        self.assertEqual(pins.pin_color({"resolved_at": AT}), pins.RESOLVED_COLOR)
        self.assertEqual(pins.pin_label(0, {"body": "Steam reads too strong in the key light here"}), "1 Steam reads too strong in the k…")
        self.assertEqual(pins.pin_label(2, {"body": "Short"}), "3 Short")
        self.assertFalse(pins.detached((0, 0, 0), 0.01))
        self.assertTrue(pins.detached((0, 0, 0), 0.2))
        self.assertFalse(pins.detached((0, 0, 0), None))

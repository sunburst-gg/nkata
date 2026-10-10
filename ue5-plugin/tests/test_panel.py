"""The UE5 panel model against a fake agent, with no editor. Run: python3 -m unittest discover -s ue5-plugin/tests -t ue5-plugin"""

from __future__ import annotations

import json
import os
import sys
import threading
import unittest
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from typing import Any
from unittest import mock

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))

import draw_pins  # noqa: E402
import panel  # noqa: E402

ID = "01ARZ3NDEKTSV4RRFFQ69G5FAV"
ID2 = "01BX5ZZKBKACTAV9WEVGEMMVRZ"
ID3 = "01CX5ZZKBKACTAV9WEVGEMMVRA"
AT = "2026-10-05T12:00:00.000Z"
DIRECTOR = {"id": ID2, "name": "Emeka", "avatar_url": None}
ARTIST = {"id": ID3, "name": "Ada", "avatar_url": None}
LOCK = {"holder": ARTIST, "granted_at": AT, "heartbeat_at": AT, "expires_at": AT, "stale": False}
PARTS = [
    {"id": ID, "asset_id": ID2, "asset_name": "Ojukwu", "name": "lookdev", "state": "ready", "owner": ARTIST, "lock": None, "gate": {"after": ["rig"]},
     "mapping": {"kind": "ue_asset", "path": "/Game/Characters/Ojukwu/lookdev"}, "kind": "character",
     "checks": [{"id": "lod_count", "severity": "warn", "params": {"min": 3}}, {"id": "collision_present", "severity": "block", "params": {}}, {"id": "unit_scale", "severity": "block", "params": {}}],
     "reference_files": ["Ojukwu/ref/concept.png"], "waiting_on": []},
    {"id": ID3, "asset_id": ID3, "asset_name": "Enugu Market / square", "name": "blockout", "state": "draft", "owner": ARTIST, "lock": LOCK, "gate": {"after": []},
     "mapping": {"kind": "ue_area", "level": "Enugu Market", "area": "square"}, "kind": "level_area", "checks": [], "reference_files": [], "waiting_on": []},
    {"id": "01DX5ZZKBKACTAV9WEVGEMMVRB", "asset_id": ID3, "asset_name": "Enugu Market / square", "name": "layout", "state": "locked", "owner": None, "lock": None, "gate": {"after": ["blockout"]},
     "mapping": {"kind": "ue_area", "level": "Enugu Market", "area": "square"}, "kind": "level_area", "checks": [], "reference_files": [], "waiting_on": ["blockout"]},
]


class FakeAgent(BaseHTTPRequestHandler):
    calls: list[tuple[str, str, Any]] = []

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
            return self._json(200, {"v": 1, "user": DIRECTOR, "roles": ["artist", "art_director"], "project": {"id": ID, "name": "P", "folder_name": "p"}, "package_version": "0.1.0", "online": True, "spool_dir": "/tmp/spool", "mode": "sync", "mirror_paused": False})
        if self.path.startswith("/parts"):
            if "/mirror" in self.path:
                return self._json(200, {"v": 1, "mirror": {"part_id": ID, "status": "synced", "version_id": ID, "at": AT, "mirror_ms": 4200, "message": "", "failures": 0, "halted": False, "on_save": True}})
            if self.path.endswith("/comments"):
                return self._json(200, {"v": 1, "comments": [{"id": "c1", "part_id": ID, "version_id": ID, "author": ARTIST, "point": [0.1, 0.2, 0.3], "normal": [0, 0, 1], "body": "Steam too strong.", "kind": "pin", "resolved_at": None, "created_at": AT}]})
            return self._json(200, {"v": 1, "parts": PARTS})
        return self._json(404, {"v": 1, "error": {"code": "not_found", "message": self.path}})

    def do_POST(self) -> None:  # noqa: N802
        n = int(self.headers.get("Content-Length") or 0)
        body = json.loads(self.rfile.read(n)) if n else None
        FakeAgent.calls.append(("POST", self.path, body))
        if self.path.endswith("/open"):
            return self._json(200, {"v": 1, "granted": True, "lock": {**LOCK, "holder": DIRECTOR}})
        if self.path == "/presence":
            return self._json(200, {"v": 1, "online": [{"user": DIRECTOR, "part_id": body["part_id"], "since": AT, "last_seen": AT}, {"user": ARTIST, "part_id": ID, "since": AT, "last_seen": AT}]})
        if self.path.endswith("/review"):
            return self._json(201, {"v": 1, "review_id": ID, "state": "approved" if body["decision"] == "approve" else "draft"})
        if self.path.endswith("/checks"):
            return self._json(200, {"v": 1, "version_id": ID, "recorded": len(body["results"])})
        if self.path.endswith("/publish"):
            return self._json(200, {"v": 1, "published": True, "version_id": ID, "state": "ready" if body["ready"] else "draft", "blocked_by": [], "render_needed": False})
        if self.path.endswith("/comments"):
            return self._json(201, {"v": 1, "comment": {"id": "c2", "part_id": ID, "version_id": ID, "author": DIRECTOR, "point": body["point"], "normal": body["normal"], "body": body["body"], "kind": body.get("kind", "pin"), "resolved_at": None, "created_at": AT}})
        if self.path.endswith("/mirror/on-save"):
            return self._json(200, {"v": 1, "mirror": {"part_id": ID, "status": "pending", "version_id": ID, "at": None, "mirror_ms": None, "message": "Mirror on save is off", "failures": 0, "halted": False, "on_save": body["on_save"]}})
        if self.path.endswith("/close"):
            return self._json(200, {"v": 1, "released": True})
        return self._json(404, {"v": 1, "error": {"code": "not_found", "message": self.path}})


class FakeStaticMesh:
    def __init__(self, lods: int, collision: int) -> None:
        self._lods = lods
        geom = type("Geom", (), {"box_elems": [object()] * collision, "sphere_elems": [], "sphyl_elems": [], "convex_elems": []})()
        self.body_setup = type("Body", (), {"agg_geom": geom})()

    def get_num_lods(self) -> int:
        return self._lods


class UE5PanelTest(unittest.TestCase):
    def setUp(self) -> None:
        FakeAgent.calls = []
        self.server = ThreadingHTTPServer(("127.0.0.1", 0), FakeAgent)
        threading.Thread(target=self.server.serve_forever, daemon=True).start()
        self.env = mock.patch.dict(os.environ, {"NKATA_AGENT_URL": f"http://127.0.0.1:{self.server.server_port}", "NKATA_AGENT_TOKEN": "tok"})
        self.env.start()
        self.panel = panel.Panel.connect(Path("/nowhere"))

    def tearDown(self) -> None:
        self.env.stop()
        self.server.shutdown()

    def test_open_shows_the_seven_elements_and_review_for_a_director(self) -> None:
        part = self.panel.open(ID)
        self.assertEqual(part["lock"]["holder"]["name"], "Emeka")
        view = self.panel.view().to_dict()
        self.assertEqual(view["header"]["text"], "Ojukwu / lookdev · Ready · Ada · Open by Emeka")
        self.assertEqual(view["mirror"]["text"], f"Synced {AT} · Mirror on save: On")
        self.assertEqual(view["reference"][0]["text"], "concept.png")
        self.assertEqual(view["checks"][0]["text"], "Checks run on Publish")
        self.assertEqual(view["comments"][0]["text"], "1 Ada: Steam too strong.")
        self.assertEqual(view["comments"][-1]["action"], "reply")
        self.assertEqual([e["text"] for e in view["publish"]], ["Publish"], "a Ready part has no Mark Ready")
        self.assertEqual(view["presence"]["text"], "Here: Ada in this part")
        self.assertEqual([e["arg"] for e in view["review"]], ["approve", "send_back"])
        self.assertEqual(view["areas"], [])
        self.assertEqual(view["error"], "")

    def test_ue5_checks_run_on_the_asset_and_record(self) -> None:
        self.panel.open(ID)
        results = self.panel.run_checks(FakeStaticMesh(lods=2, collision=0))
        self.assertEqual([(r["check_id"], r["passed"]) for r in results], [("lod_count", False), ("collision_present", False)], "unit_scale is Blender's")
        self.assertEqual(results[0]["message"], "2 LODs of 3")
        recorded = [c for c in FakeAgent.calls if c[1] == f"/parts/{ID}/checks"]
        self.assertEqual(len(recorded[0][2]["results"]), 2)
        view = self.panel.view().to_dict()
        self.assertEqual(view["checks"][0]["text"], "LODs: 2 LODs of 3")
        self.assertEqual(view["checks"][1]["icon"], "block")
        ok = self.panel.run_checks(FakeStaticMesh(lods=3, collision=1))
        self.assertTrue(all(r["passed"] for r in ok))

    def test_review_reply_and_events(self) -> None:
        self.panel.open(ID)
        res = self.panel.review(4, "approve", "Good.")
        self.assertEqual(res["state"], "approved")
        self.assertEqual(self.panel.part["state"], "approved")
        sent = [c for c in FakeAgent.calls if c[1] == f"/parts/{ID}/review"][0][2]
        self.assertEqual(sent, {"v": 1, "score": 4, "decision": "approve", "note": "Good."})
        pin = self.panel.reply([0.5, 0.5, 1.0], [0, 0, 1], "Chin.")
        self.assertEqual(pin["body"], "Chin.")
        self.assertEqual(len(self.panel.comments), 2)
        self.panel.apply_event({"kind": "comment.created", "comment": {"id": "c3", "part_id": ID, "body": "Ear.", "author": ARTIST, "point": [0, 0, 0], "resolved_at": None}})
        self.panel.apply_event({"kind": "comment.created", "comment": {"id": "c3", "part_id": ID, "body": "Ear.", "author": ARTIST, "point": [0, 0, 0], "resolved_at": None}})
        self.assertEqual(len(self.panel.comments), 3)
        self.panel.apply_event({"kind": "part.state", "part_id": ID, "from": "approved", "to": "draft"})
        self.assertEqual(self.panel.part["state"], "draft")
        self.assertEqual([e.text for e in self.panel.view().publish], ["Publish", "Mark Ready"])
        self.panel.close()
        self.assertIsNone(self.panel.part)
        self.assertTrue(any(c[1] == f"/parts/{ID}/close" for c in FakeAgent.calls))

    def test_a_level_area_lists_its_areas_with_owners_and_locks(self) -> None:
        self.panel.open(ID3)
        view = self.panel.view().to_dict()
        self.assertEqual([e["text"] for e in view["areas"]], ["blockout · Ada · open by Emeka", "layout · No owner · free"])
        self.assertEqual(view["areas"][1]["action"], "open_area")

    def test_mirror_on_save_toggles_from_the_panel(self) -> None:
        self.panel.open(ID)
        self.assertTrue(self.panel.view().to_dict()["mirror"]["text"].endswith("Mirror on save: On"))
        self.assertEqual(self.panel.view().to_dict()["mirror"]["action"], "mirror_on_save")
        state = self.panel.set_mirror_on_save(False)
        self.assertEqual(state["on_save"], False)
        self.assertEqual([c for c in FakeAgent.calls if c[1].endswith("/mirror/on-save")][-1][2], {"v": 1, "on_save": False})

    def test_a_gated_part_says_what_it_waits_on(self) -> None:
        self.panel.open("01DX5ZZKBKACTAV9WEVGEMMVRB")
        self.assertEqual(self.panel.view().error, "Waits on blockout")


class DrawPinsTest(unittest.TestCase):
    def test_pure_helpers(self) -> None:
        self.assertEqual(draw_pins.to_cm([1.0, 2.0, 0.5]), (100.0, -200.0, 50.0))
        self.assertEqual(draw_pins.pin_color({"resolved_at": None}), draw_pins.OPEN_COLOR)
        self.assertEqual(draw_pins.pin_color({"resolved_at": AT}), draw_pins.RESOLVED_COLOR)

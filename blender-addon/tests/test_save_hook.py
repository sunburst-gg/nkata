"""The save flow end to end with bpy stubbed and a fake agent on a local port."""

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


class FakeAgent(BaseHTTPRequestHandler):
    spool_dir = ""
    saved: list[dict[str, Any]] = []
    parts: list[dict[str, Any]] = []

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
        if self.headers.get("Authorization") != "Bearer tok":
            return self._json(401, {"v": 1, "error": {"code": "unauthorized", "message": "no"}})
        if self.path == "/me":
            return self._json(200, {"v": 1, "user": {"id": ID, "name": "Ada", "avatar_url": None}, "project": {"id": ID, "name": "P", "folder_name": "p"}, "package_version": "0.1.0", "online": True, "spool_dir": self.spool_dir, "mode": "sync"})
        if self.path.startswith("/parts?"):
            return self._json(200, {"v": 1, "parts": self.parts})
        if self.path == "/events":
            self.send_response(200)
            self.send_header("Content-Type", "text/event-stream")
            self.end_headers()
            return
        return self._json(404, {"v": 1, "error": {"code": "not_found", "message": self.path}})

    def do_POST(self) -> None:  # noqa: N802
        length = int(self.headers.get("Content-Length") or 0)
        body = json.loads(self.rfile.read(length) or b"{}")
        if self.path.endswith("/saved"):
            FakeAgent.saved.append(body)
            return self._json(201, {"v": 1, "version_id": ID2, "mirror": "pending" if body["changed"] else "skipped"})
        return self._json(404, {"v": 1, "error": {"code": "not_found", "message": self.path}})


class SaveHookTest(unittest.TestCase):
    def setUp(self) -> None:
        self.tmp = tempfile.TemporaryDirectory()
        root = Path(self.tmp.name) / "rising-sun"
        (root / ".nkata-agent").mkdir(parents=True)
        (root / ".nkata-agent" / "token").write_text("tok")
        self.blend = root / "Ojukwu" / "face.blend"
        self.blend.parent.mkdir()
        self.blend.write_bytes(b"")
        FakeAgent.spool_dir = str(root / ".nkata-agent" / "spool")
        FakeAgent.saved = []
        FakeAgent.parts = [{"id": ID, "asset_id": ID2, "asset_name": "Ojukwu", "name": "face", "state": "draft", "owner": None, "lock": None, "gate": {"after": []}, "mapping": {"kind": "blend_collection", "file": "Ojukwu/face.blend", "collection": "face"}, "kind": "character"}]
        self.server = ThreadingHTTPServer(("127.0.0.1", 0), FakeAgent)
        threading.Thread(target=self.server.serve_forever, daemon=True).start()
        self.face = bpy_stub.FakeObject("Face", coords=[0.0, 0.0, 0.0, 1.0, 0.0, 0.0, 0.0, 1.0, 0.0], materials=["M_Skin"])
        self.collection = bpy_stub.FakeCollection("face", [self.face, bpy_stub.FakeObject("Armature", kind="ARMATURE", bones=42)], [bpy_stub.FakeExporter()])
        self.bpy = bpy_stub.install({"face": self.collection}, str(self.blend))
        from nkata import save_hook, state

        state.STATE.part = None
        state.STATE.last_hashes.clear()
        state.STATE.mirror.clear()
        state.STATE.error = ""
        self.save_hook = save_hook
        self.state = state.STATE
        self.env = mock.patch.dict(os.environ, {"NKATA_AGENT_URL": f"http://127.0.0.1:{self.server.server_port}"})
        self.env.start()
        # The SSE listener thread is covered by parse_sse; keep it off here.
        self.listener = mock.patch.object(save_hook, "_ensure_listener", lambda _c: None)
        self.listener.start()

    def tearDown(self) -> None:
        self.listener.stop()
        self.env.stop()
        self.server.shutdown()
        self.tmp.cleanup()

    def test_first_save_exports_second_save_skips_edit_exports_again(self) -> None:
        first = self.save_hook.handle_save(str(self.blend))
        self.assertTrue(first["changed"])
        self.assertEqual(len(FakeAgent.saved), 1)
        req = FakeAgent.saved[0]
        self.assertTrue(Path(req["spool_path"]).is_file())
        self.assertTrue(req["spool_path"].startswith(FakeAgent.spool_dir + "/" + ID + "/"))
        self.assertEqual(req["manifest"]["objects"][0]["name"], "Face")
        self.assertEqual(req["manifest"]["objects"][0]["triangles"], 1)
        self.assertEqual(req["manifest"]["objects"][0]["materials"], ["M_Skin"])
        self.assertEqual(req["manifest"]["armature"], "Armature")
        self.assertEqual(req["manifest"]["kind"], "character")
        self.assertEqual(req["manifest"]["bone_count"], 42)
        self.assertEqual(req["manifest"]["objects"][0]["origin"], [0.0, 0.0, 0.0])
        self.assertEqual(req["manifest"]["objects"][0]["scale"], [1.0, 1.0, 1.0])
        self.assertEqual(req["source_file"], "Ojukwu/face.blend")
        self.assertEqual(self.bpy._ops.calls[0][0], "collection.exporter_export")
        self.assertTrue(any(p.name.endswith(".manifest.json") for p in Path(req["spool_path"]).parent.iterdir()))
        self.assertEqual(self.state.mirror_for(ID).status, "pending")

        second = self.save_hook.handle_save(str(self.blend))
        self.assertFalse(second["changed"])
        self.assertEqual(FakeAgent.saved[1]["spool_path"], None)
        self.assertEqual(len(self.bpy._ops.calls), 1)
        self.assertEqual(self.state.mirror_for(ID).status, "skipped")

        self.face.material_slots = [bpy_stub.FakeSlot("M_Cloth")]
        third = self.save_hook.handle_save(str(self.blend))
        self.assertTrue(third["changed"])
        self.assertEqual(len(self.bpy._ops.calls), 2)

    def test_fallback_export_without_an_attached_exporter(self) -> None:
        self.collection.exporters = []
        self.save_hook.handle_save(str(self.blend))
        self.assertEqual(self.bpy._ops.calls[0][0], "export_scene.gltf")
        self.assertTrue(self.bpy._ops.calls[0][1]["use_active_collection"])
        self.assertTrue(self.bpy._ops.calls[0][1]["export_skins"], "a character exports with its armature")

    def _as_prop(self, obj: bpy_stub.FakeObject) -> None:
        FakeAgent.parts = [{**FakeAgent.parts[0], "kind": "prop", "asset_name": "Kettle", "name": "model", "mapping": {"kind": "blend_collection", "file": "Ojukwu/face.blend", "collection": "face"}}]
        self.collection.objects = [obj]
        self.collection.all_objects = [obj]
        self.collection.exporters = []

    def test_a_prop_exports_without_skins_and_records_its_origin(self) -> None:
        kettle = bpy_stub.FakeObject("Kettle", coords=[-0.5, -0.5, 0.0, 0.5, -0.5, 0.0, 0.0, 0.5, 0.3], location=(2.0, 3.0, 0.0))
        self._as_prop(kettle)
        out = self.save_hook.handle_save(str(self.blend))
        self.assertTrue(out["changed"])
        self.assertEqual(out["refused"], [])
        self.assertFalse(self.bpy._ops.calls[0][1]["export_skins"])
        req = FakeAgent.saved[0]
        self.assertEqual(req["manifest"]["kind"], "prop")
        self.assertIsNone(req["manifest"]["bone_count"])
        self.assertEqual(req["manifest"]["objects"][0]["origin"], [2.0, 3.0, 0.0])
        self.assertEqual(req["manifest"]["objects"][0]["bounds_min"], [1.5, 2.5, 0.0])

    def test_a_prop_off_its_base_or_scaled_is_refused_and_still_versions(self) -> None:
        floating = bpy_stub.FakeObject("Kettle", coords=[-0.5, -0.5, 0.2, 0.5, -0.5, 0.2, 0.0, 0.5, 0.5], scale=(2.0, 2.0, 2.0))
        self._as_prop(floating)
        out = self.save_hook.handle_save(str(self.blend))
        self.assertFalse(out["changed"])
        self.assertEqual(len(out["refused"]), 2)
        self.assertEqual(self.bpy._ops.calls, [])
        self.assertEqual(FakeAgent.saved[0]["changed"], False)
        self.assertIn("Export refused", self.state.error)
        self.assertIn("apply scale", self.state.error)
        self.assertIn("set origin to the bottom", self.state.error)
        self.assertEqual(self.state.last_hashes, {}, "a refused export is tried again on the next save")

    def test_gather_facts_reads_the_scene_for_the_checks(self) -> None:
        from nkata import checks

        facts = self.save_hook.gather_facts(self.collection, {"SK_Human": ("bone_0", "bone_1")})
        self.assertEqual(facts.unit_scale, 1.0)
        self.assertEqual([o.name for o in facts.objects], ["Face"])
        self.assertEqual(facts.objects[0].uv_layers, ("UVMap",))
        self.assertEqual(facts.objects[0].triangles, 1)
        self.assertEqual(len(facts.bone_names), 42)
        self.assertEqual(facts.textures[0].name, "T_Face_D")
        results, _ = checks.run_checks(["unit_scale", "uv_set_present", "texture_size", "rig_bone_count"], {"rig_bone_count": {"max": 50}}, {}, facts)
        self.assertTrue(all(r["passed"] for r in results), results)

    def test_file_outside_a_project_is_skipped(self) -> None:
        with tempfile.TemporaryDirectory() as d:
            out = self.save_hook.handle_save(str(Path(d) / "x.blend"))
        self.assertIn("skipped", out)
        self.assertEqual(FakeAgent.saved, [])

    def test_file_without_a_part_is_skipped(self) -> None:
        FakeAgent.parts = []
        out = self.save_hook.handle_save(str(self.blend))
        self.assertIn("skipped", out)
        self.assertIsNone(self.state.part)

    def test_agent_down_raises_a_typed_error_and_the_handler_keeps_the_save(self) -> None:
        with mock.patch.dict(os.environ, {"NKATA_AGENT_URL": "http://127.0.0.1:1"}):
            self.save_hook.on_save_post()
        self.assertIn("agent not reachable", self.state.error)


if __name__ == "__main__":
    unittest.main()

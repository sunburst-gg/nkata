"""The save flow end to end with bpy stubbed and a fake agent on a local port."""

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
NEW_PART = {
    "id": "01NEWPART0000000000000000A", "asset_id": ID2, "asset_name": "face", "name": "model", "state": "draft", "owner": {"id": ID, "name": "Ada", "avatar_url": None}, "lock": None,
    "gate": {"after": []}, "mapping": {"kind": "blend_collection", "file": "Ojukwu/face.blend", "collection": "model"}, "kind": "prop", "export_name": "SM_face", "checks": [], "reference_files": [], "waiting_on": [],
}


class FakeAgent(BaseHTTPRequestHandler):
    unreal = True
    spool_dir = ""
    saved: list[dict[str, Any]] = []
    opened: list[str] = []
    parts: list[dict[str, Any]] = []
    created: list[dict[str, Any]] = []

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
            return self._json(200, {"v": 1, "user": {"id": ID, "name": "Ada", "avatar_url": None}, "project": {"id": ID, "name": "P", "folder_name": "p"}, "package_version": "0.1.0", "online": True, "spool_dir": self.spool_dir, "mode": "sync", "mirror_paused": False, "unreal": FakeAgent.unreal})
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
        if self.path.endswith("/open"):
            FakeAgent.opened.append(self.path)
            at = "2026-10-05T12:00:00.000Z"
            return self._json(200, {"v": 1, "granted": True, "lock": {"holder": {"id": ID2, "name": "Ada", "avatar_url": None}, "granted_at": at, "heartbeat_at": at, "expires_at": at, "stale": False}})
        if self.path == "/presence":
            return self._json(200, {"v": 1, "online": []})
        if self.path == "/assets":
            FakeAgent.created.append(body)
            base = self.parts[0] if self.parts else NEW_PART
            made = {**base, "id": "01NEWPART0000000000000000A", "asset_name": body["name"], "mapping": {"kind": "blend_collection", "file": body["file"], "collection": "model"}}
            FakeAgent.parts = [*FakeAgent.parts, made]
            return self._json(201, {"v": 1, "part": made})
        if self.path.endswith("/render"):
            return self._json(200, {"v": 1, "version_id": ID, "stored": True})
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
        FakeAgent.opened = []
        FakeAgent.created = []
        FakeAgent.parts = [{"id": ID, "asset_id": ID2, "asset_name": "Ojukwu", "name": "face", "state": "draft", "owner": None, "lock": None, "gate": {"after": []}, "mapping": {"kind": "blend_collection", "file": "Ojukwu/face.blend", "collection": "face"}, "kind": "character", "checks": [{"id": "unit_scale", "severity": "block", "params": {}}, {"id": "triangle_budget", "severity": "block", "params": {"max": 60000}}], "reference_files": ["Ojukwu/ref/concept.png"], "waiting_on": []}]
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
        self.assertEqual(req["spool_path"], str(self.blend.parent / ".nkata-exports" / "face.glb"), "v8: the GLB sits beside the .blend in .nkata-exports, out of the sync")
        self.assertEqual(req["manifest"]["objects"][0]["name"], "Face")
        self.assertEqual(req["manifest"]["objects"][0]["triangles"], 1)
        self.assertEqual(req["manifest"]["objects"][0]["materials"], ["M_Skin"])
        self.assertEqual(req["manifest"]["armature"], "Armature")
        self.assertEqual(req["manifest"]["kind"], "character")
        self.assertEqual(req["manifest"]["bone_count"], 42)
        self.assertEqual(req["manifest"]["objects"][0]["origin"], [0.0, 0.0, 0.0])
        self.assertEqual(req["manifest"]["objects"][0]["scale"], [1.0, 1.0, 1.0])
        # The card reads these: UV sets per object, the textures, the unit scale.
        self.assertEqual(req["manifest"]["objects"][0]["uv_sets"], ["UVMap"])
        self.assertEqual(req["manifest"]["textures"], [{"name": "T_Face_D", "width": 2048, "height": 2048}])
        self.assertEqual(req["manifest"]["unit_scale"], 1.0)
        self.assertEqual(req["source_file"], "Ojukwu/face.blend")
        self.assertEqual(self.bpy._ops.calls[0][0], "collection.exporter_export")
        self.assertTrue((self.blend.parent / ".nkata-exports" / (self.blend.stem + ".manifest.json")).is_file())
        self.assertEqual(req["manifest"]["asset_kind"], "object")
        self.assertEqual([c["key"] for c in req["manifest"]["checks"]], ["textures", "scale", "uv", "tris"])
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

    def test_a_file_that_became_a_part_while_open_is_named_and_locked_on_save(self) -> None:
        """Create asset, From files in the folder, on a file Blender already has open: no open
        event ran. The first save names the only collection after the part and takes the lock."""
        self.collection.name = "Collection"
        self.bpy = bpy_stub.install({"Collection": self.collection}, str(self.blend))
        first = self.save_hook.handle_save(str(self.blend))
        self.assertTrue(first["changed"])
        self.assertEqual(self.collection.name, "face")
        self.assertEqual(FakeAgent.opened, [f"/parts/{ID}/open"])
        self.assertEqual(self.state.part["lock"]["holder"]["name"], "Ada")
        # The next save of the same part asks for no second lock.
        self.save_hook.handle_save(str(self.blend))
        self.assertEqual(len(FakeAgent.opened), 1)

    def test_fallback_export_without_an_attached_exporter(self) -> None:
        self.collection.exporters = []
        self.save_hook.handle_save(str(self.blend))
        self.assertEqual(self.bpy._ops.calls[0][0], "export_scene.gltf")
        self.assertTrue(self.bpy._ops.calls[0][1]["use_active_collection"])
        self.assertTrue(self.bpy._ops.calls[0][1]["export_skins"], "a character exports with its armature")

    def _as_prop(self, obj: bpy_stub.FakeObject) -> None:
        # The Object template's pivot rule: the base, as a note (step 21).
        pivot = {"id": "pivot_at_base", "severity": "note", "params": {"convention": "base"}}
        FakeAgent.parts = [{**FakeAgent.parts[0], "kind": "prop", "asset_name": "Kettle", "name": "model", "mapping": {"kind": "blend_collection", "file": "Ojukwu/face.blend", "collection": "face"}, "checks": [pivot]}]
        self.collection.objects = [obj]
        self.collection.all_objects = [obj]
        self.collection.exporters = []

    def test_a_prop_exports_without_skins_and_records_its_origin(self) -> None:
        kettle = bpy_stub.FakeObject("Kettle", coords=[-0.5, -0.5, 0.0, 0.5, -0.5, 0.0, 0.0, 0.5, 0.3], location=(2.0, 3.0, 0.0))
        self._as_prop(kettle)
        out = self.save_hook.handle_save(str(self.blend))
        self.assertTrue(out["changed"])
        self.assertFalse(self.bpy._ops.calls[0][1]["export_skins"])
        req = FakeAgent.saved[0]
        self.assertEqual(req["manifest"]["kind"], "prop")
        self.assertIsNone(req["manifest"]["bone_count"])
        self.assertEqual(req["manifest"]["objects"][0]["origin"], [2.0, 3.0, 0.0])
        self.assertEqual(req["manifest"]["objects"][0]["bounds_min"], [1.5, 2.5, 0.0])

    def test_with_unreal_off_a_prop_off_its_base_still_exports(self) -> None:
        """The pivot rule guards placed copies in Unreal. Coming soon means the GLB still ships."""
        FakeAgent.unreal = False
        FakeAgent.parts = [{**FakeAgent.parts[0], "kind": "prop"}]
        self.face.matrix_world[2][3] = 0.5
        out = self.save_hook.handle_save(str(self.blend))
        self.assertTrue(out["changed"])
        self.assertIsNotNone(FakeAgent.saved[0]["spool_path"])
        self.assertEqual(self.state.error, "")

    def test_a_prop_off_its_base_or_scaled_still_reaches_the_team_and_names_the_origin(self) -> None:
        # Saves are never refused: the team sees the work and the preview gets it. An origin off
        # the base is a note with Fix; scale is not a problem at all (UE 5.8 bakes object scale on
        # import, measured: a 2 m cube at scale 2 arrives 400 cm). docs/decisions.md, 2026-10-27.
        floating = bpy_stub.FakeObject("Kettle", coords=[-0.5, -0.5, 0.2, 0.5, -0.5, 0.2, 0.0, 0.5, 0.5], scale=(2.0, 2.0, 2.0))
        self._as_prop(floating)
        self.state.unreal = True
        out = self.save_hook.handle_save(str(self.blend))
        self.state.unreal = False
        self.assertTrue(out["changed"])
        self.assertIsNotNone(FakeAgent.saved[0]["spool_path"], "the export ran")
        self.assertEqual(self.state.error, "")
        pivot = [r for r in self.state.checks[FakeAgent.parts[0]["id"]] if r["check_id"] == "pivot_at_base"]
        self.assertEqual(len(pivot), 1)
        self.assertFalse(pivot[0]["passed"])
        self.assertEqual(pivot[0]["severity"], "note")
        self.assertIn("origin is", pivot[0]["message"])
        self.assertNotIn("scale", pivot[0]["message"])
        line = [c for c in FakeAgent.saved[0]["manifest"]["checks"] if c["key"] == "pivot"]
        self.assertEqual(line[0]["level"], "note")

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

    def test_blenders_own_images_are_not_textures(self) -> None:
        # Every file can carry the compositor's Viewer Node and a Render Result. They read as one
        # texture that failed the naming check on a model with no textures at all.
        import bpy

        bpy.data.images.append(types.SimpleNamespace(name="Viewer Node", type="COMPOSITING", size=(256, 256), filepath="", packed_file=None))
        bpy.data.images.append(types.SimpleNamespace(name="Render Result", type="RENDER_RESULT", size=(1920, 1080), filepath="", packed_file=None))
        self.assertEqual([t.name for t in self.save_hook.texture_facts()], ["T_Face_D"])

    def test_file_outside_a_project_is_skipped(self) -> None:
        with tempfile.TemporaryDirectory() as d:
            out = self.save_hook.handle_save(str(Path(d) / "x.blend"))
        self.assertIn("skipped", out)
        self.assertEqual(FakeAgent.saved, [])

    def test_a_file_without_a_part_becomes_an_asset_of_mine_on_save(self) -> None:
        """v8: a .blend saved into the project is an asset. One file, one part, this person's."""
        FakeAgent.parts = []
        out = self.save_hook.handle_save(str(self.blend))
        self.assertEqual(len(FakeAgent.created), 1)
        self.assertEqual(FakeAgent.created[0], {"v": 1, "name": "face", "file": "Ojukwu/face.blend", "kind": "object", "group": "Ojukwu"})
        self.assertEqual(out["part_id"], "01NEWPART0000000000000000A")
        self.assertTrue(out["changed"])
        self.assertEqual(self.state.part["mapping"]["file"], "Ojukwu/face.blend")

    def test_agent_down_raises_a_typed_error_and_the_handler_keeps_the_save(self) -> None:
        with mock.patch.dict(os.environ, {"NKATA_AGENT_URL": "http://127.0.0.1:1"}):
            self.save_hook.on_save_post()
        self.assertIn("agent not reachable", self.state.error)


if __name__ == "__main__":
    unittest.main()

from __future__ import annotations

import tempfile
import unittest
from pathlib import Path

from . import conftest_shim  # noqa: F401

import py as shared
from nkata import hashing, ids, manifest, mapping
from nkata.agent_client import parse_sse
from nkata.state import AddonState, MirrorView


class HashingTest(unittest.TestCase):
    def test_hash_changes_with_mesh_materials_and_transform(self) -> None:
        base = hashing.hash_object(b"abc", b"def", ["M_Skin"], [1.0] * 16)
        self.assertEqual(base, hashing.hash_object(b"abc", b"def", ["M_Skin"], [1.0] * 16))
        self.assertNotEqual(base, hashing.hash_object(b"abd", b"def", ["M_Skin"], [1.0] * 16))
        self.assertNotEqual(base, hashing.hash_object(b"abc", b"def", ["M_Cloth"], [1.0] * 16))
        self.assertNotEqual(base, hashing.hash_object(b"abc", b"def", ["M_Skin"], [1.0] * 15 + [2.0]))
        self.assertEqual(len(base), 64)

    def test_tiny_float_noise_does_not_change_the_hash(self) -> None:
        a = hashing.hash_object(b"", b"", [], [1.0000000001] + [0.0] * 15)
        b = hashing.hash_object(b"", b"", [], [1.0] + [0.0] * 15)
        self.assertEqual(a, b)

    def test_table_changed(self) -> None:
        self.assertTrue(hashing.hash_table_changed(None, {}))
        self.assertFalse(hashing.hash_table_changed({"a": "1"}, {"a": "1"}))
        self.assertTrue(hashing.hash_table_changed({"a": "1"}, {"a": "2"}))
        self.assertTrue(hashing.hash_table_changed({"a": "1"}, {"a": "1", "b": "1"}))
        self.assertTrue(hashing.hash_table_changed({"a": "1", "b": "1"}, {"a": "1"}))


class ManifestTest(unittest.TestCase):
    def test_builds_a_valid_manifest_and_writes_it(self) -> None:
        info = manifest.ObjectInfo("Face", 1200, ["M_Skin"], (-1.0, -1.0, 0.0), (1.0, 1.0, 2.0), "h", uv_sets=("UVMap", "Lightmap"))
        data = manifest.build_manifest([info], "Armature", "/Game/Characters/Ojukwu/face", textures=[("T_Face_D", 2048, 2048)], unit_scale=1.0)
        self.assertEqual(data["objects"][0]["triangles"], 1200)
        self.assertEqual(data["objects"][0]["uv_sets"], ["UVMap", "Lightmap"])
        self.assertEqual(data["textures"], [{"name": "T_Face_D", "width": 2048, "height": 2048}])
        self.assertEqual(data["unit_scale"], 1.0)
        self.assertEqual(data["armature"], "Armature")
        with tempfile.TemporaryDirectory() as d:
            p = Path(d) / "m.json"
            manifest.write_manifest(p, data)
            self.assertIn('"mirror_target": "/Game/Characters/Ojukwu/face"', p.read_text())

    def test_rejects_a_bad_manifest(self) -> None:
        info = manifest.ObjectInfo("Face", -1, [], (0, 0, 0), (0, 0, 0), "h")
        with self.assertRaises(shared.ValidationError):
            manifest.build_manifest([info], None, None)

    def test_static_problems(self) -> None:
        good = manifest.ObjectInfo("Stool", 10, [], (-1.0, -1.0, 0.0), (1.0, 1.0, 0.5), "h", (0.0, 0.0, 0.0), (1.0, 1.0, 1.0))
        self.assertEqual(manifest.static_problems([good]), [])
        within = manifest.ObjectInfo("Stool", 10, [], (-1.0, -1.0, 0.0005), (1.0, 1.0, 0.5), "h", (0.0, 0.0, 0.0), (1.0, 1.0, 1.0))
        self.assertEqual(manifest.static_problems([within]), [])
        high = manifest.ObjectInfo("Stool", 10, [], (-1.0, -1.0, 0.0), (1.0, 1.0, 0.5), "h", (0.0, 0.0, 0.2), (1.0, 1.0, 1.0))
        self.assertEqual(len(manifest.static_problems([high])), 1)
        self.assertIn("0.2 m above the base", manifest.static_problems([high])[0])
        # Scale is not a problem: UE 5.8 bakes object scale on import (measured 2026-10-27).
        scaled = manifest.ObjectInfo("Stool", 10, [], (-1.0, -1.0, 0.0), (1.0, 1.0, 0.5), "h", (0.0, 0.0, 0.0), (1.0, 1.0, 0.5))
        self.assertEqual(manifest.static_problems([scaled]), [])

    def test_bounds(self) -> None:
        self.assertEqual(manifest.bounds_of([(1, 2, 3), (-1, 5, 0)]), ((-1, 2, 0), (1, 5, 3)))
        self.assertEqual(manifest.bounds_of([]), ((0.0, 0.0, 0.0), (0.0, 0.0, 0.0)))


class StartableTest(unittest.TestCase):
    def parts(self) -> list[dict]:
        def blend(name: str, owner: dict | None) -> dict:
            return {"id": name, "name": name, "mapping": {"kind": "blend_collection", "file": f"A/{name}.blend", "collection": name}, "owner": owner}

        return [
            blend("mine", {"id": "me"}),
            blend("free", None),
            blend("theirs", {"id": "them"}),
            blend("ondisk", {"id": "me"}),
            {"id": "ue", "name": "ue", "mapping": {"kind": "ue_asset", "path": "/Game/A"}, "owner": None},
        ]

    def test_mine_and_free_parts_without_a_file_are_startable(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            (root / "A").mkdir()
            (root / "A" / "ondisk.blend").write_bytes(b"")
            names = [p["name"] for p in mapping.startable_parts(self.parts(), root, "me")]
        self.assertEqual(names, ["mine", "free"])

    def test_the_empty_line_says_why(self) -> None:
        no_part_line = mapping.no_part_line
        self.assertEqual(no_part_line([], "me"), "No parts yet. Create an asset in Nkata.")
        theirs = [p for p in self.parts() if p["name"] in ("theirs", "ue")]
        self.assertEqual(no_part_line(theirs, "me"), "No part is yours or free. Ask for one in Nkata.")
        self.assertEqual(no_part_line(self.parts(), "me"), "Every part of yours has a file. Open one.")


class MappingTest(unittest.TestCase):
    def test_finds_root_token_and_relative_file(self) -> None:
        with tempfile.TemporaryDirectory() as d:
            root = Path(d) / "rising-sun"
            (root / ".nkata-agent").mkdir(parents=True)
            (root / ".nkata-agent" / "token").write_text("tok\n")
            blend = root / "Ojukwu" / "face.blend"
            blend.parent.mkdir()
            blend.write_bytes(b"")
            self.assertEqual(mapping.find_project_root(blend), root)
            self.assertEqual(mapping.read_token(root), "tok")
            self.assertEqual(mapping.relative_file(root, blend), "Ojukwu/face.blend")
            self.assertIsNone(mapping.find_project_root(Path(d) / "elsewhere" / "x.blend"))

    def test_part_for_file(self) -> None:
        parts = [
            {"id": "a", "mapping": {"kind": "file", "path": "Ojukwu/face.blend"}},
            {"id": "b", "mapping": {"kind": "blend_collection", "file": "Ojukwu/face.blend", "collection": "face"}},
        ]
        self.assertEqual(mapping.part_for_file(parts, "Ojukwu/face.blend")["id"], "b")
        self.assertIsNone(mapping.part_for_file(parts, "Ojukwu/hair.blend"))


class IdsTest(unittest.TestCase):
    def test_ulid_shape(self) -> None:
        a, b = ids.new_id(), ids.new_id()
        self.assertEqual(len(a), 26)
        self.assertNotEqual(a, b)
        self.assertTrue(all(c in "0123456789ABCDEFGHJKMNPQRSTVWXYZ" for c in a))


class SseAndStateTest(unittest.TestCase):
    def test_parse_sse_frames(self) -> None:
        seen: list[dict] = []
        lines = [b": keep-alive\n", b"\n", b"event: nkata\n", b'data: {"kind": "mirror.result", "part_id": "p", "status": "synced", "message": "", "mirror_ms": 42}\n', b"\n", b"data: not json\n", b"\n"]
        parse_sse(iter(lines), seen.append)
        self.assertEqual(len(seen), 1)
        state = AddonState()
        state.apply_event(seen[0])
        self.assertEqual(state.mirror_for("p").status, "synced")
        self.assertTrue(state.dirty)

    def test_mirror_line_words(self) -> None:
        self.assertEqual(MirrorView("synced", at=100.0).line(now=104.0), "Synced 4 s ago")
        self.assertEqual(MirrorView("syncing").line(), "Syncing")
        self.assertEqual(MirrorView("failed", "no skeleton").line(), "Failed: no skeleton")
        self.assertEqual(MirrorView("pending", "Waiting for UE5").line(), "Waiting for UE5")
        self.assertEqual(MirrorView("skipped").line(), "Saved, nothing changed")
        self.assertEqual(MirrorView().line(), "Not mirrored yet")


if __name__ == "__main__":
    unittest.main()

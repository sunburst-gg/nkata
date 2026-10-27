"""The fixture corpus (fixtures/) read the way the add-on and the checks read real assets."""

from __future__ import annotations

import json
import struct
import unittest
from pathlib import Path

from . import conftest_shim  # noqa: F401

import py as shared
from nkata import checks

FIXTURES = Path(__file__).resolve().parents[2] / "fixtures"
GLB_MAGIC = 0x46546C67


def read_glb(path: Path) -> tuple[dict, bytes]:
    data = path.read_bytes()
    magic, version, total = struct.unpack_from("<III", data, 0)
    if magic != GLB_MAGIC or version != 2 or total != len(data):
        raise ValueError(f"{path} is not a glTF 2.0 binary")
    json_len, _kind = struct.unpack_from("<II", data, 12)
    doc = json.loads(data[20 : 20 + json_len])
    bin_len, _kind = struct.unpack_from("<II", data, 20 + json_len)
    return doc, data[28 + json_len : 28 + json_len + bin_len]


def facts_from_manifest(data: dict, bone_names: tuple[str, ...] = ()) -> checks.SceneFacts:
    objects = tuple(
        checks.ObjectFacts(o["name"], o["triangles"], ("UVMap",), tuple(o["bounds_min"]), tuple(o["origin"]))
        for o in data["objects"]
    )
    return checks.SceneFacts(unit_scale=1.0, objects=objects, textures=(checks.TextureFacts("T_D", 1024, 1024),), bone_names=bone_names, skeletons={"SK_Human": bone_names})


class FixtureCorpusTest(unittest.TestCase):
    def test_every_manifest_validates(self) -> None:
        manifests = sorted(FIXTURES.rglob("manifest.json"))
        self.assertEqual(len(manifests), 4)
        for path in manifests:
            data = json.loads(path.read_text())
            shared.validate_ObjectManifest(data)
            for o in data["objects"]:
                self.assertEqual(o["scale"], [1.0, 1.0, 1.0], path)

    def test_the_character_is_rigged_and_passes_its_checks(self) -> None:
        doc, _ = read_glb(FIXTURES / "character" / "ojukwu.glb")
        skeleton = json.loads((FIXTURES / "character" / "skeleton.json").read_text())
        self.assertEqual(len(doc["skins"][0]["joints"]), 20)
        self.assertEqual(len(skeleton["bones"]), 20)
        self.assertEqual(len(doc["materials"]), 2)
        self.assertEqual(doc["images"][0]["name"], "T_Ojukwu_D")
        data = json.loads((FIXTURES / "character" / "manifest.json").read_text())
        self.assertEqual(data["kind"], "character")
        self.assertEqual(data["bone_count"], 20)
        facts = facts_from_manifest(data, tuple(skeleton["bones"]))
        results, _ = checks.run_checks(
            ["unit_scale", "name_pattern", "triangle_budget", "uv_set_present", "texture_size", "rig_bone_names", "rig_bone_count"],
            {"name_pattern": {"pattern": "SK_.*"}, "triangle_budget": {"max": 60000}, "rig_bone_names": {"skeleton": "SK_Human"}, "rig_bone_count": {"max": 20}},
            {},
            facts,
        )
        self.assertTrue(all(r["passed"] for r in results), results)

    def test_every_prop_sits_on_its_base_and_has_two_lods_and_collision(self) -> None:
        props = sorted(p for p in (FIXTURES / "props").iterdir() if p.is_dir())
        self.assertEqual([p.name for p in props], ["kettle", "market_stall", "wooden_stool"])
        for folder in props:
            doc, _ = read_glb(folder / f"{folder.name}.glb")
            names = [m["name"] for m in doc["meshes"]]
            self.assertTrue(any(n.endswith("_LOD1") for n in names), names)
            self.assertIn("extent", json.loads((folder / "collision.json").read_text()))
            data = json.loads((folder / "manifest.json").read_text())
            self.assertEqual(data["kind"], "prop")
            results, _ = checks.run_checks(["name_pattern", "triangle_budget", "pivot_at_base"], {"name_pattern": {"pattern": "SM_.*"}, "triangle_budget": {"max": 15000}}, {}, facts_from_manifest(data))
            self.assertTrue(all(r["passed"] for r in results), results)

    def test_the_level_area_has_eight_tagged_actors(self) -> None:
        area = json.loads((FIXTURES / "level_area" / "square.json").read_text())
        self.assertEqual(area["level"], "Enugu Market")
        self.assertEqual(len(area["actors"]), 8)
        self.assertTrue(all("nkata.area=square" in a["tags"] for a in area["actors"]))

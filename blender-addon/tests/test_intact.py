"""Did the export keep what the scene has (intact.py, v8 step 17)."""

from __future__ import annotations

import json
import struct
import tempfile
import unittest
from pathlib import Path

from . import conftest_shim  # noqa: F401

from nkata import intact


def glb(doc: dict) -> bytes:
    """A GLB as the spec lays it out: the header, then the JSON chunk padded to four bytes."""
    body = json.dumps(doc).encode()
    body += b" " * (-len(body) % 4)
    return struct.pack("<III", intact.GLB_MAGIC, 2, 12 + 8 + len(body)) + struct.pack("<II", len(body), intact.CHUNK_JSON) + body


CHARACTER = {
    "asset": {"version": "2.0"},
    "materials": [{"name": "M_Skin"}, {"name": "M_Cloth"}],
    "images": [{"name": "T_Face_D", "mimeType": "image/png", "bufferView": 0}],
    "nodes": [{"name": "root"}, {"name": "hand_L"}, {"name": "Body", "mesh": 0, "skin": 0}],
    "skins": [{"joints": [0, 1]}],
    "accessors": [{"min": [0.0], "max": [1.25]}, {"min": [0.04], "max": [1.0]}],
    "animations": [{"name": "Walk", "samplers": [{"input": 0}, {"input": 1}]}],
}


class ReadTest(unittest.TestCase):
    def test_reads_materials_textures_bones_and_animation_length(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            p = Path(tmp) / "a.glb"
            p.write_bytes(glb(CHARACTER))
            side = intact.read_glb(p)
        self.assertEqual(side.materials, frozenset({"M_Skin", "M_Cloth"}))
        self.assertEqual(side.textures, frozenset({"t_face_d"}))
        self.assertEqual(side.bones, ("root", "hand_L"))
        self.assertEqual(side.animations, {"Walk": 1.25})

    def test_a_file_that_is_not_a_glb_says_so(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            p = Path(tmp) / "a.glb"
            p.write_bytes(b"BLENDER-v400" + b"\0" * 20)
            with self.assertRaises(intact.GlbError):
                intact.read_glb(p)

    def test_image_names_compare_without_extension_or_case(self) -> None:
        self.assertEqual(intact.stem("T_Face_D.png"), "t_face_d")
        self.assertEqual(intact.stem("//textures/T_Face_D.PNG"), "t_face_d")
        self.assertEqual(intact.stem("T_Face.v2"), "t_face")
        self.assertEqual(intact.stem("Viewer Node"), "viewer node")


class LossTest(unittest.TestCase):
    scene = intact.Side(
        materials=frozenset({"M_Skin", "M_Cloth", "M_Eyes"}),
        textures=frozenset({"t_face_d", "t_face_n", "t_eyes_d"}),
        bones=("root", "hand_L", "hand_R"),
        animations={"Walk": 1.25, "Idle": 2.0},
    )

    def test_an_intact_export_says_so(self) -> None:
        result = intact.check(self.scene, [], self.scene, ["root", "hand_L", "hand_R"])
        self.assertEqual(result, {"intact": True, "losses": []})
        self.assertEqual(intact.lines(result), ["Export intact."])

    def test_each_kind_of_loss_says_what_and_which(self) -> None:
        export = intact.side_of(CHARACTER)
        result = intact.check(self.scene, [intact.MissingFile("T_Eyes_D.png", "//tex/T_Eyes_D.png")], export, None)
        self.assertFalse(result["intact"])
        by_kind = {loss["kind"]: loss for loss in result["losses"]}
        self.assertEqual(by_kind["texture_file"]["sentence"], "T_Eyes_D.png is not on disk: //tex/T_Eyes_D.png. Find it or pack it.")
        self.assertEqual(by_kind["texture"]["names"], ["t_face_n"], "a missing file is said once, as missing")
        self.assertIn("Principled BSDF", by_kind["texture"]["sentence"])
        self.assertEqual(by_kind["material"]["names"], ["M_Eyes"])
        self.assertEqual(by_kind["bone"]["names"], ["hand_R"])
        self.assertEqual(by_kind["animation"]["sentence"], "Animations not in the export: Idle.")

    def test_bones_gone_since_the_last_save_are_named(self) -> None:
        now = intact.Side(bones=("root", "hand_L"))
        result = intact.check(now, [], now, ["root", "hand_L", "hand_R"])
        self.assertTrue(result["intact"], "the export holds what the scene has")
        self.assertEqual(result["bones_changed"], ["hand_R"])
        self.assertEqual(intact.lines(result), ["Bones gone since the last save: hand_R."])
        self.assertEqual(intact.bones_gone(None, ("root",)), [])

    def test_long_lists_are_cut_to_three(self) -> None:
        scene = intact.Side(materials=frozenset({"A", "B", "C", "D", "E"}))
        (loss,) = intact.losses(scene, [], intact.Side())
        self.assertEqual(loss["sentence"], "Materials not in the export: A, B, C and 2 more.")


if __name__ == "__main__":
    unittest.main()

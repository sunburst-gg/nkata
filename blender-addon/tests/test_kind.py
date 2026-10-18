"""The asset kind decision, pure: subfolder first, then the rig, then the size, then the pick."""

from __future__ import annotations

import tempfile
import unittest
from pathlib import Path

from . import conftest_shim  # noqa: F401

from nkata import kind

SMALL = [((0.0, 0.0, 0.0), (1.0, 1.0, 2.0))]
BIG = [((-20.0, -20.0, 0.0), (20.0, 20.0, 8.0))]
SPREAD = [((float(i), 0.0, 0.0), (float(i) + 0.5, 0.5, 1.0)) for i in range(14)]


class KindTest(unittest.TestCase):
    def test_the_first_subfolder_names_it(self) -> None:
        self.assertEqual(kind.group_of("Props/Radio/Radio.blend"), "Props")
        self.assertEqual(kind.group_of("Radio.blend"), None)
        self.assertEqual(kind.kind_from_group("Environments"), "environment")
        self.assertEqual(kind.kind_from_group("Levels"), "environment")
        self.assertEqual(kind.kind_from_group("Characters"), "object")
        self.assertEqual(kind.kind_from_group("Vehicles"), "object")
        self.assertEqual(kind.kind_from_group("Props"), "object")
        self.assertIsNone(kind.kind_from_group("Scratch"))
        self.assertIsNone(kind.kind_from_group(None))

    def test_the_scene_decides_when_the_folder_does_not(self) -> None:
        self.assertEqual(kind.kind_from_scene(SMALL, skinned=False), "object")
        self.assertEqual(kind.kind_from_scene(BIG, skinned=False), "environment")
        self.assertEqual(kind.kind_from_scene(BIG, skinned=True), "object", "a skinned rig is a character, an object")
        self.assertEqual(kind.kind_from_scene(SPREAD, skinned=False), "environment")
        self.assertEqual(kind.kind_from_scene(SPREAD[:5], skinned=False), "object")
        self.assertEqual(kind.kind_from_scene([], skinned=False), "object")

    def test_decide_in_order_and_the_pick_is_remembered_per_asset(self) -> None:
        self.assertEqual(kind.decide("Environments/Market/Market.blend", SMALL, skinned=False), "environment")
        self.assertEqual(kind.decide("Scratch/Big.blend", BIG, skinned=False), "environment")
        self.assertEqual(kind.decide("Scratch/Big.blend", BIG, skinned=False, remembered="object"), "object")
        with tempfile.TemporaryDirectory() as tmp:
            blend = Path(tmp) / "Props" / "Radio.blend"
            blend.parent.mkdir()
            blend.write_bytes(b"")
            self.assertIsNone(kind.read_remembered(blend))
            kind.remember(blend, "environment")
            self.assertEqual(kind.read_remembered(blend), "environment")
            self.assertEqual(kind.decide("Props/Radio.blend", SMALL, skinned=False, remembered=kind.read_remembered(blend)), "environment")
            kind.memory_path(blend).write_text("not json")
            self.assertIsNone(kind.read_remembered(blend))


if __name__ == "__main__":
    unittest.main()

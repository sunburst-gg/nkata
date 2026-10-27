"""Did the import keep what the export held (verify.py, v8 step 17, item 7)."""

from __future__ import annotations

import os
import sys
import unittest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "scripts"))

import verify  # noqa: E402

# What UE 5.8 made of the add-on's Hero.glb, as measured (docs/decisions.md, 2026-10-27).
HERO = {"materials": ["M_Hero"], "bones": ["root", "chest"], "animations": [{"name": "SK_Hero_Anim", "seconds": 1.2916666}]}


class VerifyTest(unittest.TestCase):
    def test_the_measured_import_is_intact_and_says_what_walk_became(self) -> None:
        expected = {"materials": ["M_Hero"], "bones": ["root", "chest"], "animations": [{"name": "Walk", "seconds": 1.25}]}
        result = verify.differences(expected, HERO)
        self.assertTrue(result["intact"], result)
        self.assertEqual(result["animations"], [{"blender": "Walk", "unreal": "SK_Hero_Anim", "seconds": 1.25, "unreal_seconds": 1.2916666}])

    def test_each_kind_of_loss_says_which(self) -> None:
        expected = {"materials": ["M_Hero", "M_Eyes"], "bones": ["root", "chest", "hand_L"], "animations": [{"name": "Walk", "seconds": 1.25}, {"name": "Idle", "seconds": 4.0}]}
        result = verify.differences(expected, HERO)
        self.assertFalse(result["intact"])
        self.assertEqual(result["lines"], ["Materials not in Unreal: M_Eyes.", "Bones not in Unreal: hand_L.", "Animations not in Unreal: Idle."])

    def test_a_name_unreal_kept_wins_over_a_length(self) -> None:
        got = [{"name": "SK_Hero_Idle", "seconds": 1.25}, {"name": "SK_Hero_Walk", "seconds": 1.29}]
        pairs, missing = verify.pair_animations([{"name": "Walk", "seconds": 1.25}], got)
        self.assertEqual((pairs[0]["unreal"], missing), ("SK_Hero_Walk", []))

    def test_a_static_mesh_has_no_bones_or_animations_to_lose(self) -> None:
        self.assertEqual(verify.differences({"materials": ["M_Kettle"]}, {"materials": ["M_Kettle"]}), {"intact": True, "lines": [], "animations": []})


if __name__ == "__main__":
    unittest.main()

"""The plain line an environment mirror reports (import_environment.py, v8 step 18)."""

from __future__ import annotations

import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))

import import_environment  # noqa: E402


class ShortfallTest(unittest.TestCase):
    def test_fewer_meshes_than_the_export_held_say_how_many(self) -> None:
        self.assertEqual(import_environment.mesh_shortfall(12, 12), "")
        self.assertEqual(import_environment.mesh_shortfall(12, 14), "", "instanced copies may add components")
        self.assertEqual(import_environment.mesh_shortfall(12, 9), "3 of 12 meshes not in Unreal.")

    def test_the_stage_actor_is_named_after_the_asset(self) -> None:
        self.assertEqual(import_environment.stage_label("Station"), "Nkata Station")


if __name__ == "__main__":
    unittest.main()

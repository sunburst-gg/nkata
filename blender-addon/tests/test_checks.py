from __future__ import annotations

import unittest

from . import conftest_shim  # noqa: F401

from nkata import checks
from nkata.checks import ObjectFacts, SceneFacts, TextureFacts

SEV = {c: "block" for c in checks.BLENDER_CHECKS}
SEV["texture_size"] = "warn"


def facts(**over: object) -> SceneFacts:
    base = SceneFacts(
        unit_scale=1.0,
        objects=(
            ObjectFacts("SM_Kettle", 1200, ("UVMap",), (-0.2, -0.2, 0.0), (0.0, 0.0, 0.0)),
            ObjectFacts("SM_Kettle_Lid", 300, ("UVMap",), (-0.1, -0.1, 0.0), (0.0, 0.0, 0.0)),
        ),
        textures=(TextureFacts("T_Kettle_D", 2048, 2048),),
        bone_names=("root", "spine", "head"),
        skeletons={"SK_Human": ("root", "spine", "head")},
    )
    return SceneFacts(**{**base.__dict__, **over})


class ChecksTest(unittest.TestCase):
    def test_every_blender_check_has_a_contract_and_an_implementation(self) -> None:
        import json
        from pathlib import Path

        contracts = Path(__file__).resolve().parents[2] / "shared" / "checks"
        for check_id in checks.BLENDER_CHECKS:
            contract = json.loads((contracts / f"{check_id}.json").read_text())
            self.assertIn("blender", contract["applies_to"], check_id)
            self.assertIn(check_id, checks.CHECKS)
            self.assertEqual(contract["auto_fix"], check_id in checks.FIXERS, check_id)

    def test_all_pass_on_a_clean_prop(self) -> None:
        results, _ = checks.run_checks(
            list(checks.BLENDER_CHECKS),
            {"name_pattern": {"pattern": "SM_.*"}, "triangle_budget": {"max": 15000}, "rig_bone_names": {"skeleton": "SK_Human"}, "rig_bone_count": {"max": 100}},
            SEV,
            facts(),
        )
        self.assertEqual([r["check_id"] for r in results], list(checks.BLENDER_CHECKS))
        self.assertTrue(all(r["passed"] for r in results), results)
        self.assertEqual(checks.blocked_by(results), [])

    def test_unit_scale_and_names_fix_and_report_it(self) -> None:
        bad = facts(unit_scale=0.01, objects=(ObjectFacts("kettle body", 10, ("UVMap",), (0, 0, 0), (0, 0, 0)),))
        results, after = checks.run_checks(["unit_scale", "name_pattern"], {"name_pattern": {"pattern": "SM_.*"}}, SEV, bad)
        self.assertEqual([(r["passed"], r["auto_fixed"]) for r in results], [(True, True), (True, True)])
        self.assertEqual(after.unit_scale, 1.0)
        self.assertEqual(after.objects[0].name, "SM_kettle_body")
        unfixed, _ = checks.run_checks(["unit_scale"], {}, SEV, bad, fix=False)
        self.assertEqual((unfixed[0]["passed"], unfixed[0]["auto_fixed"]), (False, False))
        self.assertIn("0.01", unfixed[0]["message"])

    def test_pivot_moves_to_the_base_and_reports_it(self) -> None:
        bad = facts(objects=(ObjectFacts("SM_Crate", 12, ("UVMap",), (-1.0, -1.0, 0.5), (0.0, 0.0, 1.0)),))
        results, after = checks.run_checks(["pivot_at_base"], {}, SEV, bad)
        self.assertEqual((results[0]["passed"], results[0]["auto_fixed"]), (True, True))
        self.assertEqual(after.objects[0].origin, (0.0, 0.0, 0.5))
        unfixed, _ = checks.run_checks(["pivot_at_base"], {}, SEV, bad, fix=False)
        self.assertFalse(unfixed[0]["passed"])
        self.assertIn("SM_Crate", unfixed[0]["message"])

    def test_blocking_failures_and_warnings(self) -> None:
        bad = facts(
            objects=(ObjectFacts("SM_Big", 20000, (), (-1, -1, 0.0), (0, 0, 0.5)),),
            textures=(TextureFacts("T_Odd", 3000, 2048), TextureFacts("T_Huge", 8192, 8192)),
            bone_names=("root", "spine", "tail"),
        )
        results, _ = checks.run_checks(
            ["triangle_budget", "uv_set_present", "texture_size", "rig_bone_names", "rig_bone_count", "pivot_at_base"],
            {"triangle_budget": {"max": 15000}, "rig_bone_names": {"skeleton": "SK_Human"}, "rig_bone_count": {"max": 2}, "texture_size": {"max": 4096}},
            SEV,
            bad,
            fix=False,
        )
        by_id = {r["check_id"]: r for r in results}
        self.assertFalse(by_id["triangle_budget"]["passed"])
        self.assertIn("20,000 triangles of 15,000", by_id["triangle_budget"]["message"])
        self.assertIn("SM_Big", by_id["uv_set_present"]["message"])
        self.assertIn("T_Odd", by_id["texture_size"]["message"])
        self.assertIn("T_Huge", by_id["texture_size"]["message"])
        self.assertIn("missing head", by_id["rig_bone_names"]["message"])
        self.assertIn("extra tail", by_id["rig_bone_names"]["message"])
        self.assertEqual(by_id["rig_bone_count"]["message"], "3 bones of 2")
        self.assertIn("SM_Big", by_id["pivot_at_base"]["message"])
        self.assertEqual(checks.blocked_by(results), ["triangle_budget", "uv_set_present", "rig_bone_names", "rig_bone_count", "pivot_at_base"])

    def test_a_check_with_a_missing_param_fails_and_does_not_raise(self) -> None:
        results, _ = checks.run_checks(["name_pattern", "triangle_budget"], {}, SEV, facts())
        by_id = {r["check_id"]: r for r in results}
        self.assertFalse(by_id["name_pattern"]["passed"])
        self.assertFalse(by_id["name_pattern"]["auto_fixed"])
        self.assertIn("no pattern", by_id["name_pattern"]["message"])
        self.assertIn("no max", by_id["triangle_budget"]["message"])

    def test_checks_blender_does_not_own_are_skipped(self) -> None:
        results, _ = checks.run_checks(["lod_count", "collision_present", "unit_scale"], {}, SEV, facts())
        self.assertEqual([r["check_id"] for r in results], ["unit_scale"])

    def test_conform_name(self) -> None:
        self.assertEqual(checks.conform_name("kettle body.001", "^SM_.*$"), "SM_kettle_body_001")
        self.assertEqual(checks.conform_name("SM_Kettle", "^SM_.*$"), "SM_Kettle")
        self.assertEqual(checks.conform_name("Kettle", ".*"), "Kettle")

"""The v8 panel's pure parts: budgets per kind, the four check lines, the Publish label, the
throttle and the heartbeat clocks, the pin colors."""

from __future__ import annotations

import unittest

from . import conftest_shim  # noqa: F401

from nkata import checks, live, pins

FACTS = checks.SceneFacts(unit_scale=1.0, objects=(checks.ObjectFacts("Radio", 16_200, ("UVMap",), (0.0, 0.0, 0.0), (0.0, 0.0, 0.0)),), textures=(checks.TextureFacts("T_Radio_D", 2048, 2048),))
BUDGETS = {"prop": 30_000, "vehicle": 60_000, "character": 80_000, "environment": 2_000_000, "max_texture": None}


class BudgetTest(unittest.TestCase):
    def test_the_budget_comes_from_the_project_by_kind_and_group_never_from_the_file(self) -> None:
        self.assertEqual(live.budget_for(BUDGETS, "object", "Props"), 30_000)
        self.assertEqual(live.budget_for(BUDGETS, "object", "Vehicles"), 60_000)
        self.assertEqual(live.budget_for(BUDGETS, "object", "Characters"), 80_000)
        self.assertEqual(live.budget_for(BUDGETS, "environment", None), 2_000_000)
        self.assertEqual(live.budget_for(BUDGETS, "object", "Props", override=45_000), 45_000)
        self.assertEqual(live.budget_for(None, "object", None), 30_000, "the defaults when the agent is older")
        self.assertEqual(live.budget_for({"prop": 50_000}, "object", "Props"), 50_000)

    def test_the_four_specs_carry_the_budget_and_the_texture_limit(self) -> None:
        sp = live.specs(50_000, 2048)
        self.assertEqual([c["id"] for c in sp], ["texture_names", "unit_scale", "uv_set_present", "triangle_budget", "texture_size"])
        self.assertEqual(sp[3]["params"], {"max": 50_000})
        self.assertEqual(len(live.specs(50_000)), 4)


class LinesTest(unittest.TestCase):
    def test_a_pass_says_its_number_and_a_fail_says_the_problem_and_the_fix(self) -> None:
        results, _ = live.run_four(FACTS, 30_000)
        rows = live.lines(results, checks.summary(FACTS), 30_000)
        self.assertEqual([r.key for r in rows], ["textures", "scale", "uv", "tris"])
        self.assertTrue(all(r.passed for r in rows))
        self.assertEqual(rows[0].sentence, "Textures named · 1")
        self.assertEqual(rows[1].sentence, "Scale 1")
        self.assertEqual(rows[2].sentence, "UVs present · 1 set")
        self.assertEqual(rows[3].sentence, "16,200 triangles, within budget of 30,000")
        over, _ = live.run_four(FACTS, 15_000)
        rows = live.lines(over, checks.summary(FACTS), 15_000)
        self.assertFalse(rows[3].passed)
        self.assertIn("16200", rows[3].sentence.replace(",", ""))
        self.assertEqual(rows[3].fix, "Over budget. Decimate or split the mesh.")
        self.assertEqual(live.manifest_checks(rows)[3], {"key": "tris", "pass": False, "sentence": rows[3].sentence, "fix": rows[3].fix})
        pending = live.lines([], {}, 30_000)
        self.assertTrue(all(r.sentence == "Not checked yet." and not r.passed for r in pending))

    def test_the_publish_label_follows_the_app(self) -> None:
        ok, _ = live.run_four(FACTS, 30_000)
        rows = live.lines(ok, checks.summary(FACTS), 30_000)
        self.assertEqual(live.publish_label(rows, ""), "Publish, after the note")
        self.assertEqual(live.publish_label(rows, "Dial added."), "Publish")
        red, _ = live.run_four(FACTS, 100)
        self.assertEqual(live.publish_label(live.lines(red, checks.summary(FACTS), 100), "Dial added."), "Publish, after the red one")


class ClockTest(unittest.TestCase):
    def test_checks_run_at_most_every_two_seconds_and_only_after_a_change(self) -> None:
        t = live.Throttle(2.0)
        self.assertFalse(t.due(0.0), "nothing changed yet")
        t.mark()
        self.assertTrue(t.due(0.0))
        t.mark()
        self.assertFalse(t.due(1.0))
        self.assertTrue(t.due(2.0))
        self.assertFalse(t.due(10.0), "no change since")

    def test_the_heartbeat_fires_every_twenty_seconds(self) -> None:
        h = live.Heartbeat()
        self.assertTrue(h.due(0.0))
        self.assertFalse(h.due(19.0))
        self.assertTrue(h.due(20.0))


class PinColorTest(unittest.TestCase):
    def test_pins_take_the_commenters_color_and_hash_like_the_app(self) -> None:
        a = pins.person_color({"author": {"id": "01ADA000000000000000000000"}, "resolved_at": None})
        b = pins.person_color({"author": {"id": "01EMEKA00000000000000000000"}, "resolved_at": None})
        self.assertEqual(len(a), 4)
        self.assertEqual(a[3], 1.0)
        self.assertEqual(pins.person_color({"author": {"id": "01ADA000000000000000000000"}, "resolved_at": "x"})[3], pins.RESOLVED_ALPHA)
        self.assertEqual(pins.color_index("a"), (97 % 8))
        self.assertEqual(pins.color_index("ab"), ((97 * 31 + 98) % 8))
        self.assertNotEqual(a[:3], b[:3])
        self.assertEqual(len(pins.octahedron((0.0, 0.0, 0.0), 1.0)), 24)
        self.assertEqual(pins.pin_label(2, {"body": "Short"}), "3 Short")


if __name__ == "__main__":
    unittest.main()

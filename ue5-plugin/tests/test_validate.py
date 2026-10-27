"""What Unreal's validators said, as findings the agent records (validate.py, v8 step 22)."""

from __future__ import annotations

import os
import sys
import unittest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "scripts"))

import validate  # noqa: E402


class ValidateTest(unittest.TestCase):
    def test_errors_come_first_in_the_validators_own_words_and_blanks_are_dropped(self) -> None:
        got = validate.findings_of("Door", ["Static mesh Door must start with SM_.", "  "], ["Door has no LODs."])
        self.assertEqual(
            got,
            [
                {"asset": "Door", "level": "error", "message": "Static mesh Door must start with SM_."},
                {"asset": "Door", "level": "warning", "message": "Door has no LODs."},
            ],
        )
        self.assertEqual(validate.findings_of("SM_Door", [], None), [])

    def test_each_asset_the_import_made_is_validated_once(self) -> None:
        paths = ["/Game/Nkata/_Preview/Door/model/Door.Door", "/Game/Nkata/_Preview/Door/model/M_Wood.M_Wood", "/Game/Nkata/_Preview/Door/model/Door.Door", ""]
        self.assertEqual(validate.unique_paths(paths), paths[:2])


if __name__ == "__main__":
    unittest.main()

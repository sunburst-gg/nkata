"""The pure parts of the area export, with no editor. The export itself is @needs_editor."""

from __future__ import annotations

import sys
import unittest
from pathlib import Path
from types import SimpleNamespace

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))

import export_area  # noqa: E402


class ExportAreaTest(unittest.TestCase):
    def test_tagged_picks_only_the_area(self) -> None:
        actors = [
            SimpleNamespace(name="Stall", tags=["nkata.area=square", "prop"]),
            SimpleNamespace(name="Well", tags=["nkata.area=north"]),
            SimpleNamespace(name="Light", tags=[]),
            SimpleNamespace(name="NoTags"),
        ]
        self.assertEqual([a.name for a in export_area.tagged(actors, "square")], ["Stall"])
        self.assertEqual(export_area.tagged(actors, "east"), [])
        self.assertEqual(export_area.area_tag("square"), "nkata.area=square")

    def test_refuses_outside_the_editor(self) -> None:
        import io
        from contextlib import redirect_stdout

        args = Path(__file__).resolve().parent / "_area.args.json"
        args.write_text('{"v": 1, "part_id": "p", "version_id": "v", "level": "Enugu Market", "area": "square", "out_path": "/tmp/x.glb"}', encoding="utf-8")
        try:
            out = io.StringIO()
            with redirect_stdout(out):
                export_area.main(["export_area.py", str(args)])
            self.assertIn('"ok": false', out.getvalue())
            self.assertIn("run inside the editor", out.getvalue())
        finally:
            args.unlink()


if __name__ == "__main__":
    unittest.main()

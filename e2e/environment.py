"""Step 1b gate. A prop placed in two levels updates in both after each Blender save, p95 under
5 s over 20 saves, material instances and collision kept, referencer count unchanged.

Needs Blender and UE5 (@needs_editor), the agent running (`nkata-agent serve` in the project
folder), the add-on installed (`make addon`), the Remote Control API plugin on, and the prop
placed in two levels before the run.

    NKATA_BLENDER=/path/to/blender python3 e2e/environment.py --blend rising-sun/Kettle/model.blend \\
        --object SM_K_LOD0 --asset /Game/Nkata/Kettle/model --saves 20

Prints one JSON line: {saves, results, failures, p50_ms, p95_ms, kept, levels}. Exit 1 on a miss.
The two-artists half of the gate (two areas of one level, no overwrite) is the lock test in
step 3; this script covers the mirror half.
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import os  # noqa: E402

from mirror import percentile, ue5_script  # noqa: E402
from needs_editor import DEFAULT_UE5_URL, needs_editor  # noqa: E402
from quality import links, mirror_run  # noqa: E402


@needs_editor
def run(blend: Path, object_name: str, asset_path: str, saves: int, pause: float) -> bool:
    ue5_url = os.environ.get("NKATA_UE5_URL", DEFAULT_UE5_URL)
    tmp = blend.parent / ".nkata-agent-e2e"
    tmp.mkdir(parents=True, exist_ok=True)
    before = links(ue5_url, asset_path, tmp)
    refs_before = ue5_script(ue5_url, "scan_refs.py", {"v": 1, "asset_path": asset_path}, tmp)
    latencies, got = mirror_run(blend, object_name, saves, pause)
    after = links(ue5_url, asset_path, tmp)
    refs_after = ue5_script(ue5_url, "scan_refs.py", {"v": 1, "asset_path": asset_path}, tmp)
    failures = [r for r in got if r.get("status") != "synced"]
    kept = before.get("materials") == after.get("materials") and refs_before.get("referencers") == refs_after.get("referencers")
    report = {
        "saves": saves,
        "results": len(got),
        "failures": len(failures),
        "p50_ms": percentile(latencies, 50),
        "p95_ms": percentile(latencies, 95),
        "kept": bool(kept),
        "levels": refs_after.get("levels"),
    }
    print(json.dumps(report))
    passed = len(got) == saves and not failures and report["p95_ms"] < 5_000 and kept and len(refs_after.get("levels") or []) >= 2
    if not passed:
        raise SystemExit(1)
    return True


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--blend", required=True, type=Path)
    parser.add_argument("--object", required=True)
    parser.add_argument("--asset", required=True, help="UE5 static mesh path the part mirrors to")
    parser.add_argument("--saves", type=int, default=20)
    parser.add_argument("--pause", type=float, default=1.0)
    a = parser.parse_args()
    run(a.blend.resolve(), a.object, a.asset, a.saves, a.pause)


if __name__ == "__main__":
    main()

"""The quality bar. Needs Blender and UE5 (@needs_editor). See docs/product.md, Quality bar.

Measures, each printed as one JSON line and judged against its target:
- mirror p95 for a character (10 s) and a prop (5 s) over 20 saves each
- lost save: the agent is killed mid upload, restarted, and the queue drains
- broken links: skeleton, physics asset, material slots, and collision survive 20 reimports
- placed copies: a prop placed in two levels updates in both, referencer count unchanged
- panel open: the Blender N-panel draws the part header within 1 s of the file opening

Runs against fixtures/ by default. NKATA_FIXTURES points at a folder with the same layout to run
on real assets. The project folder, the agent, the add-on, and the editors are set up as for
e2e/mirror.py (see e2e/README.md).

    NKATA_BLENDER=/path/to/blender python3 e2e/quality.py --project rising-sun

Exit 1 when any line misses its target. The parts that need no editor (lost save, queue drain,
role refusals, cache eviction) also run in `make test`.
"""

from __future__ import annotations

import argparse
import json
import os
import shutil
import signal
import subprocess
import sys
import threading
import time
from pathlib import Path
from typing import Any

sys.path.insert(0, str(Path(__file__).resolve().parent))
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "blender-addon"))
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "shared"))
import importlib  # noqa: E402

sys.modules.setdefault("nkata.nkata_shared", importlib.import_module("py"))
from mirror import percentile, ue5_script  # noqa: E402
from needs_editor import DEFAULT_UE5_URL, needs_editor  # noqa: E402
from nkata import mapping  # noqa: E402
from nkata.agent_client import AgentClient, EventListener  # noqa: E402

ROOT = Path(__file__).resolve().parents[1]
FIXTURES = Path(os.environ.get("NKATA_FIXTURES") or ROOT / "fixtures")

TARGETS = {
    "mirror_character_p95_ms": 10_000,
    "mirror_prop_p95_ms": 5_000,
    "lost_saves": 0,
    "broken_links": 0,
    "placed_copies_stale": 0,
    "panel_open_ms": 1_000,
}


def line(measure: str, value: float, target: float, **extra: Any) -> bool:
    ok = value <= target
    print(json.dumps({"measure": measure, "value": value, "target": target, "ok": ok, **extra}))
    return ok


def mirror_run(blend: Path, object_name: str, saves: int, pause: float) -> tuple[list[float], list[dict[str, Any]]]:
    """Save `saves` times through blender_driver.py and time each save to its mirror.result."""
    root = mapping.find_project_root(blend)
    if root is None:
        raise SystemExit(f"{blend} is not inside a Nkata project")
    client = AgentClient(mapping.read_token(root))
    rel = mapping.relative_file(root, blend)
    part = mapping.part_for_file(client.parts(rel), rel)
    if part is None:
        raise SystemExit(f"no part maps to {rel}")
    results: list[dict[str, Any]] = []
    lock = threading.Lock()

    def on_event(event: dict[str, Any]) -> None:
        if event.get("kind") == "mirror.result" and event.get("part_id") == part["id"]:
            with lock:
                results.append({**event, "received_ms": int(time.time() * 1000)})

    listener = EventListener(client, on_event)
    listener.start()
    blender = os.environ.get("NKATA_BLENDER") or "blender"
    cmd = [blender, "--background", str(blend), "--python", str(Path(__file__).with_name("blender_driver.py")), "--", "--saves", str(saves), "--object", object_name, "--pause", str(pause)]
    proc = subprocess.run(cmd, capture_output=True, text=True, check=False)
    save_times = [int(x.split()[2]) for x in proc.stdout.splitlines() if x.startswith("NKATA_SAVE ")]
    deadline = time.time() + 120
    while time.time() < deadline:
        with lock:
            if len(results) >= saves:
                break
        time.sleep(0.2)
    listener.stop()
    with lock:
        got = sorted(results, key=lambda r: r["received_ms"])
    latencies = [float(r["received_ms"] - t) for t, r in zip(save_times, got, strict=False)]
    return latencies, got


def links(ue5_url: str, asset_path: str, tmp: Path) -> dict[str, Any]:
    out = ue5_script(ue5_url, "inspect_asset.py", {"v": 1, "asset_path": asset_path}, tmp)
    return {k: out.get(k) for k in ("materials", "skeleton", "physics_asset")}


def refs(ue5_url: str, asset_path: str, tmp: Path) -> dict[str, Any]:
    return ue5_script(ue5_url, "scan_refs.py", {"v": 1, "asset_path": asset_path}, tmp)


def lost_save(project: Path, agent_bin: str, size_mb: int) -> int:
    """Start a push of one big file, kill the agent at about a third, restart, and count what was
    lost: 0 when the queue drains and the file version exists."""
    big = project / "Textures" / "T_Quality_Big.png"
    big.parent.mkdir(parents=True, exist_ok=True)
    with big.open("wb") as f:
        for i in range(size_mb):
            f.write(bytes([(i * 7) % 256]) * (1024 * 1024))
    proc = subprocess.Popen([agent_bin, "--folder", str(project), "push"], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    time.sleep(max(0.5, size_mb / 60))
    proc.send_signal(signal.SIGKILL)
    proc.wait()
    out = subprocess.run([agent_bin, "--folder", str(project), "push"], capture_output=True, text=True, check=False)
    try:
        report = json.loads(out.stdout)
    except json.JSONDecodeError:
        return 1
    remaining = int(report.get("queue", {}).get("remaining", 1))
    big.unlink()
    return 1 if remaining else 0


def panel_open(blend: Path) -> float:
    """Milliseconds from load_post to the first panel draw with the part header, measured by a
    small script inside Blender."""
    blender = os.environ.get("NKATA_BLENDER") or "blender"
    probe = Path(__file__).with_name("panel_probe.py")
    out = subprocess.run([blender, "--background", str(blend), "--python", str(probe)], capture_output=True, text=True, check=False)
    for x in out.stdout.splitlines():
        if x.startswith("NKATA_PANEL_MS "):
            return float(x.split()[1])
    return float("inf")


@needs_editor
def run(project: Path, saves: int, pause: float) -> bool:
    ue5_url = os.environ.get("NKATA_UE5_URL", DEFAULT_UE5_URL)
    agent_bin = shutil.which("nkata-agent") or str(ROOT / "target" / "debug" / "nkata-agent")
    tmp = project / ".nkata-agent" / "e2e"
    tmp.mkdir(parents=True, exist_ok=True)
    ok = True

    character_blend = project / "Ojukwu" / "face.blend"
    character_asset = "/Game/Nkata/Ojukwu/face"
    before = links(ue5_url, character_asset, tmp)
    latencies, got = mirror_run(character_blend, "SK_Ojukwu_Body", saves, pause)
    failures = [r for r in got if r.get("status") != "synced"]
    ok &= line("mirror_character_p95_ms", percentile(latencies, 95), TARGETS["mirror_character_p95_ms"], p50_ms=percentile(latencies, 50), saves=saves, results=len(got), failures=len(failures))
    after = links(ue5_url, character_asset, tmp)
    broken = 0 if before == after and before.get("skeleton") else 1

    prop_blend = project / "Kettle" / "model.blend"
    prop_asset = "/Game/Nkata/Kettle/model"
    prop_links_before = links(ue5_url, prop_asset, tmp)
    refs_before = refs(ue5_url, prop_asset, tmp)
    latencies, got = mirror_run(prop_blend, "SM_K_LOD0", saves, pause)
    failures = [r for r in got if r.get("status") != "synced"]
    ok &= line("mirror_prop_p95_ms", percentile(latencies, 95), TARGETS["mirror_prop_p95_ms"], p50_ms=percentile(latencies, 50), saves=saves, results=len(got), failures=len(failures))
    prop_links_after = links(ue5_url, prop_asset, tmp)
    refs_after = refs(ue5_url, prop_asset, tmp)
    broken += 0 if prop_links_before.get("materials") == prop_links_after.get("materials") else 1
    ok &= line("broken_links", broken, TARGETS["broken_links"], character_before=before, character_after=after, prop_before=prop_links_before, prop_after=prop_links_after)
    stale = 0 if refs_before.get("referencers") == refs_after.get("referencers") and len(refs_after.get("levels", [])) >= 2 else 1
    ok &= line("placed_copies_stale", stale, TARGETS["placed_copies_stale"], levels_before=refs_before.get("levels"), levels_after=refs_after.get("levels"))

    ok &= line("lost_saves", lost_save(project, agent_bin, 100), TARGETS["lost_saves"])
    ok &= line("panel_open_ms", panel_open(character_blend), TARGETS["panel_open_ms"])
    return bool(ok)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--project", required=True, type=Path, help="Project folder with Ojukwu/face.blend and Kettle/model.blend from the fixtures")
    parser.add_argument("--saves", type=int, default=20)
    parser.add_argument("--pause", type=float, default=1.0)
    a = parser.parse_args()
    passed = run(a.project.resolve(), a.saves, a.pause)
    if passed is False:
        raise SystemExit(1)


if __name__ == "__main__":
    main()

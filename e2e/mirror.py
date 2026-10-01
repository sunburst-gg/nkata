"""Step 1 gate. One artist saves a part in Blender 20 times and sees UE5 update each time,
p95 under 10 s, materials and physics kept.

Needs Blender and UE5 (@needs_editor), the agent running (`nkata-agent serve` in the project
folder), the add-on installed in Blender (`make addon`), and the Remote Control API plugin on.

    NKATA_BLENDER=/path/to/blender python3 e2e/mirror.py --blend rising-sun/Ojukwu/face.blend \\
        --object Face --asset /Game/Nkata/Ojukwu/face --saves 20

Prints one JSON line: {saves, results, failures, p50_ms, p95_ms, kept}. Exit 1 when the gate fails.
"""

from __future__ import annotations

import argparse
import json
import os
import subprocess
import sys
import threading
import time
import urllib.request
from pathlib import Path
from typing import Any

sys.path.insert(0, str(Path(__file__).resolve().parent))
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "blender-addon"))
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "shared"))
import importlib  # noqa: E402

sys.modules.setdefault("nkata.nkata_shared", importlib.import_module("py"))
from needs_editor import DEFAULT_UE5_URL, needs_editor  # noqa: E402
from nkata import mapping  # noqa: E402
from nkata.agent_client import AgentClient, EventListener  # noqa: E402

SCRIPTS = Path(__file__).resolve().parents[1] / "ue5-plugin" / "scripts"


def percentile(values: list[float], p: float) -> float:
    if not values:
        return 0.0
    ordered = sorted(values)
    k = max(0, min(len(ordered) - 1, round(p / 100 * (len(ordered) - 1))))
    return ordered[k]


def ue5_script(url: str, script: str, args: dict[str, Any], tmp: Path) -> dict[str, Any]:
    """Runs a ue5-plugin script through Remote Control the same way the agent does."""
    args_file = tmp / f"{script}.args.json"
    args_file.write_text(json.dumps(args))
    body = {
        "objectPath": "/Script/PythonScriptPlugin.Default__PythonScriptLibrary",
        "functionName": "ExecutePythonCommandEx",
        "parameters": {"PythonCommand": f'"{SCRIPTS / script}" "{args_file}"', "ExecutionMode": "ExecuteFile", "FileExecutionScope": "Private"},
        "generateTransaction": False,
    }
    req = urllib.request.Request(url.rstrip("/") + "/remote/object/call", data=json.dumps(body).encode(), method="PUT")
    req.add_header("Content-Type", "application/json")
    with urllib.request.urlopen(req, timeout=120) as res:
        out = json.loads(res.read())
    for line in reversed(out.get("LogOutput", [])):
        text = line.get("Output", "").strip()
        if text.startswith("NKATA_RESULT "):
            return json.loads(text[len("NKATA_RESULT ") :])
    return {"ok": False, "message": "no result line"}


@needs_editor
def run(blend: Path, object_name: str, asset_path: str, saves: int, pause: float) -> dict[str, Any]:
    root = mapping.find_project_root(blend)
    if root is None:
        raise SystemExit(f"{blend} is not inside a Nkata project (no .nkata-agent folder above it)")
    client = AgentClient(mapping.read_token(root))
    ue5_url = os.environ.get("NKATA_UE5_URL", DEFAULT_UE5_URL)
    tmp = root / ".nkata-agent" / "e2e"
    tmp.mkdir(parents=True, exist_ok=True)
    rel = mapping.relative_file(root, blend)
    part = mapping.part_for_file(client.parts(rel), rel)
    if part is None:
        raise SystemExit(f"no part maps to {rel}")

    before = ue5_script(ue5_url, "inspect_asset.py", {"v": 1, "asset_path": asset_path}, tmp)

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
    save_times = [int(line.split()[2]) for line in proc.stdout.splitlines() if line.startswith("NKATA_SAVE ")]
    if proc.returncode != 0 or len(save_times) != saves:
        raise SystemExit(f"Blender run failed ({proc.returncode}), {len(save_times)} saves seen:\n{proc.stderr[-2000:]}")

    deadline = time.time() + 60
    while time.time() < deadline:
        with lock:
            if len(results) >= saves:
                break
        time.sleep(0.2)
    listener.stop()

    with lock:
        got = sorted(results, key=lambda r: r["received_ms"])
    latencies = [r["received_ms"] - t for t, r in zip(save_times, got, strict=False)]
    failures = [r for r in got if r.get("status") != "synced"]
    after = ue5_script(ue5_url, "inspect_asset.py", {"v": 1, "asset_path": asset_path}, tmp)
    kept = before.get("ok") and after.get("ok") and before.get("materials") == after.get("materials") and before.get("physics_asset") == after.get("physics_asset")

    report = {
        "saves": saves,
        "results": len(got),
        "failures": len(failures),
        "failure_messages": [f.get("message") for f in failures][:5],
        "p50_ms": percentile(latencies, 50),
        "p95_ms": percentile(latencies, 95),
        "max_ms": max(latencies) if latencies else None,
        "kept": bool(kept),
        "before": before,
        "after": after,
    }
    print(json.dumps(report))
    passed = len(got) == saves and not failures and report["p95_ms"] < 10_000 and kept
    if not passed:
        raise SystemExit(1)
    return report


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--blend", required=True, type=Path)
    parser.add_argument("--object", required=True)
    parser.add_argument("--asset", required=True, help="UE5 asset path the part mirrors to")
    parser.add_argument("--saves", type=int, default=20)
    parser.add_argument("--pause", type=float, default=1.0)
    a = parser.parse_args()
    run(a.blend.resolve(), a.object, a.asset, a.saves, a.pause)


if __name__ == "__main__":
    main()

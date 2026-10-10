"""Capture the active viewport on Mark Ready. The agent stores the PNG as the version's render.

Args file: {v, part_id, version_id, out_path, width, height}. The editor writes the screenshot
on its next frame, so this script returns the path it will land on and the agent waits for the
file: https://dev.epicgames.com/documentation/en-us/unreal-engine/python-api/class/AutomationLibrary
"""

from __future__ import annotations

import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from _result import emit, read_args  # noqa: E402

try:
    import unreal
except ImportError:  # pragma: no cover - only inside the editor
    unreal = None


def screenshot_name(version_id: str) -> str:
    return f"nkata_{version_id}.png"


def main(argv: list[str]) -> None:
    args = read_args(argv)
    if unreal is None:
        emit(False, "unreal module not available: run inside the editor")
        return
    name = screenshot_name(str(args["version_id"]))
    width = int(args.get("width") or 1280)
    height = int(args.get("height") or 720)
    # Lands in <Project>/Saved/Screenshots/<Platform>/<name> on the next frame.
    started = unreal.AutomationLibrary.take_high_res_screenshot(width, height, name)
    if not started:
        emit(False, "the editor refused the screenshot: no viewport is active")
        return
    path = os.path.join(unreal.Paths.convert_relative_path_to_full(unreal.Paths.screen_shot_dir()), name)
    emit(True, "", path=path, version_id=str(args["version_id"]))


if __name__ == "__main__":
    try:
        main(sys.argv)
    except Exception as e:  # noqa: BLE001 - the agent needs one line, whatever failed
        emit(False, f"{type(e).__name__}: {e}")

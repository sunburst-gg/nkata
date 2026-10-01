"""Runs inside Blender (background). Opens the part file, nudges one vertex, saves, repeats.
Prints one line per save: NKATA_SAVE <n> <unix_ms>. The e2e script matches each save with the
mirror.result that follows on the agent's SSE stream.

blender --background <file.blend> --python e2e/blender_driver.py -- --saves 20 --object Face
"""

from __future__ import annotations

import argparse
import sys
import time

import bpy


def main() -> None:
    argv = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []
    parser = argparse.ArgumentParser()
    parser.add_argument("--saves", type=int, default=20)
    parser.add_argument("--object", required=True, help="Mesh object to nudge on each save")
    parser.add_argument("--pause", type=float, default=1.0, help="Seconds between saves")
    args = parser.parse_args(argv)

    obj = bpy.data.objects[args.object]
    for n in range(1, args.saves + 1):
        # A real edit: move the first vertex a little so the hash changes every time.
        v = obj.data.vertices[0]
        v.co.z += 0.001
        obj.data.update()
        bpy.ops.wm.save_mainfile()
        print(f"NKATA_SAVE {n} {int(time.time() * 1000)}", flush=True)
        time.sleep(args.pause)


if __name__ == "__main__":
    main()

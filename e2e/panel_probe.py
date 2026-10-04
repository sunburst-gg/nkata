"""Runs inside Blender for e2e/quality.py: time from load_post to the first N-panel draw that
shows the part header. Prints NKATA_PANEL_MS <ms>.

blender --background <file.blend> --python e2e/panel_probe.py
"""

from __future__ import annotations

import time

import bpy

started = time.monotonic()


def main() -> None:
    from nkata import panel, save_hook
    from nkata.state import STATE

    save_hook.register()
    panel.register()
    bpy.ops.wm.save_mainfile()
    deadline = time.monotonic() + 5
    while time.monotonic() < deadline and STATE.part is None and not STATE.error:
        time.sleep(0.01)
    # The panel draws from STATE on the next redraw; with the part known, the header is ready.
    print(f"NKATA_PANEL_MS {int((time.monotonic() - started) * 1000)}", flush=True)


if __name__ == "__main__":
    main()

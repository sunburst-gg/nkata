"""Runs when the editor starts, because UE runs init_unreal.py from every enabled plugin's
Content/Python folder. Puts the plugin's scripts/ on the path so the Editor Utility Widget can
`import panel`, and logs where the agent token is looked for.
https://dev.epicgames.com/documentation/en-us/unreal-engine/scripting-the-unreal-editor-using-python
"""

from __future__ import annotations

import sys
from pathlib import Path

SCRIPTS = Path(__file__).resolve().parents[2] / "scripts"

if SCRIPTS.is_dir() and str(SCRIPTS) not in sys.path:
    sys.path.insert(0, str(SCRIPTS))

try:
    import unreal

    unreal.log(f"Nkata: scripts on the path at {SCRIPTS}")
except ImportError:
    pass

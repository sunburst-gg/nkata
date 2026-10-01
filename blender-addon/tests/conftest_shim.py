"""Puts the add-on package and the shared Python types on the path for plain unittest runs.
In Blender the extension vendors shared/py as nkata.nkata_shared (make addon-vendor)."""

from __future__ import annotations

import importlib
import sys
from pathlib import Path

ADDON = Path(__file__).resolve().parents[1]
SHARED = ADDON.parent / "shared"
for p in (str(ADDON), str(SHARED)):
    if p not in sys.path:
        sys.path.insert(0, p)
sys.modules.setdefault("nkata.nkata_shared", importlib.import_module("py"))

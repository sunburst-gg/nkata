"""Marker for tests that need Blender and UE5 on the machine.

A test decorated with @needs_editor runs only when both are reachable:
- NKATA_BLENDER: path to the Blender 4.2+ binary.
- NKATA_UE5_URL: the Remote Control API of a running editor (default http://127.0.0.1:30010).
Otherwise it prints why it was skipped and exits 0, so `make test` stays green without editors.
"""

from __future__ import annotations

import functools
import os
import shutil
import sys
import urllib.error
import urllib.request
from collections.abc import Callable
from typing import Any

DEFAULT_UE5_URL = "http://127.0.0.1:30010"


def editors_available() -> str | None:
    """None when both editors are reachable, else the reason they are not."""
    blender = os.environ.get("NKATA_BLENDER") or shutil.which("blender")
    if not blender or not os.path.exists(blender):
        return "Blender not found: set NKATA_BLENDER to the Blender 4.2+ binary"
    url = os.environ.get("NKATA_UE5_URL", DEFAULT_UE5_URL).rstrip("/")
    try:
        urllib.request.urlopen(url + "/remote/info", timeout=2).read()
    except (urllib.error.URLError, TimeoutError, OSError) as e:
        return f"UE5 Remote Control not reachable at {url}: {e}"
    return None


def needs_editor(fn: Callable[..., Any]) -> Callable[..., Any]:
    @functools.wraps(fn)
    def wrapper(*args: Any, **kwargs: Any) -> Any:
        reason = editors_available()
        if reason is not None:
            print(f"SKIPPED {fn.__name__}: {reason}")
            return None
        return fn(*args, **kwargs)

    wrapper.needs_editor = True  # type: ignore[attr-defined]
    return wrapper


if __name__ == "__main__":
    reason = editors_available()
    print(reason or "editors available")
    sys.exit(0)

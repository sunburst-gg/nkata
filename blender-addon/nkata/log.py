"""Structured logs, one JSON line per event, to stderr. Blender shows stderr in the console."""

from __future__ import annotations

import json
import sys
import time
from typing import Any


def log(event: str, **fields: Any) -> None:
    record: dict[str, Any] = {"at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()), "source": "blender-addon", "event": event}
    record.update(fields)
    sys.stderr.write(json.dumps(record, default=str) + "\n")
    sys.stderr.flush()

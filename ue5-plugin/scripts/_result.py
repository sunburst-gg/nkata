"""Result line every Nkata script prints last. The agent reads it from the Remote Control log output."""

from __future__ import annotations

import json
import sys
from typing import Any

RESULT_PREFIX = "NKATA_RESULT "


def emit(ok: bool, message: str = "", **extra: Any) -> None:
    payload: dict[str, Any] = {"ok": ok, "message": message}
    payload.update(extra)
    print(RESULT_PREFIX + json.dumps(payload))
    sys.stdout.flush()


def read_args(argv: list[str]) -> dict[str, Any]:
    """The agent passes one argument: the path of a JSON file with the call arguments."""
    if len(argv) < 2:
        raise ValueError("expected the args file path as the only argument")
    with open(argv[1], encoding="utf-8") as f:
        data = json.load(f)
    if not isinstance(data, dict):
        raise ValueError("args file must hold a JSON object")
    return data

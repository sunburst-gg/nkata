"""The v8 panel's live parts, without bpy: the four checks as the artist works, throttled to one
run every 2 s on a scene change; the heartbeat to the agent every 20 s with the open file; the
check specs from the project's budgets; the Publish label. docs/tasks/v8-prompts.md, step 12."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any

from . import checks

CHECK_EVERY_S = 2.0
HEARTBEAT_EVERY_S = 20.0

# v8 keys for the four checks, in panel order, and the Blender check that runs each.
KEYS = (("textures", "texture_names"), ("scale", "unit_scale"), ("uv", "uv_set_present"), ("tris", "triangle_budget"))
FIX = {
    "textures": "Rename the images T_<asset>_<map>. Fix does it.",
    "scale": "Apply scale in Blender. Fix does it.",
    "uv": "Unwrap the mesh.",
    "tris": "Over budget. Decimate or split the mesh.",
}
DEFAULT_BUDGETS = {"prop": 30_000, "vehicle": 60_000, "character": 80_000, "environment": 2_000_000, "max_texture": None}


def budget_for(budgets: dict[str, Any] | None, kind: str, group: str | None, override: int | None = None) -> int:
    """The triangle budget this asset draws on: its override, else the project's number for its
    kind and group. Never a number from this file (step 13, 3b)."""
    b = budgets or DEFAULT_BUDGETS
    if override:
        return int(override)
    if kind == "environment":
        return int(b.get("environment", DEFAULT_BUDGETS["environment"]))
    g = (group or "").lower()
    if g.startswith("vehicle"):
        return int(b.get("vehicle", DEFAULT_BUDGETS["vehicle"]))
    if g.startswith("character"):
        return int(b.get("character", DEFAULT_BUDGETS["character"]))
    return int(b.get("prop", DEFAULT_BUDGETS["prop"]))


def specs(budget: int, max_texture: int | None = None) -> list[dict[str, Any]]:
    """The four checks with their params, all blocking."""
    out = [
        {"id": "texture_names", "severity": "block", "params": {"pattern": "T_.*"}},
        {"id": "unit_scale", "severity": "block", "params": {}},
        {"id": "uv_set_present", "severity": "block", "params": {}},
        {"id": "triangle_budget", "severity": "block", "params": {"max": int(budget)}},
    ]
    if max_texture:
        out.append({"id": "texture_size", "severity": "block", "params": {"max": int(max_texture)}})
    return out


@dataclass(frozen=True)
class CheckLine:
    key: str
    passed: bool
    sentence: str
    fix: str
    # Not run yet: neither a pass nor a fail, and never the red one Publish waits on.
    pending: bool = False


def lines(results: list[dict[str, Any]], card: dict[str, Any], budget: int) -> list[CheckLine]:
    """The four lines the panel shows and the manifest carries: a pass says its number, a fail
    says the problem in one line and its fix in the next."""
    by_id = {r["check_id"]: r for r in results}
    out: list[CheckLine] = []
    for key, check_id in KEYS:
        r = by_id.get(check_id)
        if r is None:
            out.append(CheckLine(key, False, "Not checked yet.", FIX[key], pending=True))
            continue
        if r["passed"]:
            out.append(CheckLine(key, True, green_sentence(key, card, budget), FIX[key]))
        else:
            out.append(CheckLine(key, False, str(r["message"]).rstrip(".") + ".", FIX[key]))
    return out


def green_sentence(key: str, card: dict[str, Any], budget: int) -> str:
    if key == "textures":
        n = len(card.get("textures", []))
        return f"Textures named · {n}" if n else "Textures named · none"
    if key == "scale":
        return f"Scale {card.get('unit_scale', 1.0):g}"
    if key == "uv":
        sets = card.get("uv_sets", [])
        return f"UVs present · {len(sets)} set{'' if len(sets) == 1 else 's'}"
    return f"{card.get('triangles', 0):,} triangles, within budget of {budget:,}"


def manifest_checks(rows: list[CheckLine]) -> list[dict[str, Any]]:
    return [{"key": r.key, "pass": r.passed, "sentence": r.sentence, "fix": r.fix} for r in rows]


def _first(user: dict[str, Any] | None) -> str:
    return str((user or {}).get("name") or "Someone").split(" ")[0]


def who_has_it(part: dict[str, Any], me: dict[str, Any] | None) -> str:
    """The line under the connection when this file is not mine to send (v8 step 16, item 5):
    someone else has it open, or someone else owns the asset. Empty when it is mine."""
    my_id = (me or {}).get("id")
    lock = part.get("lock") or {}
    holder = lock.get("holder") if isinstance(lock, dict) else None
    if holder and holder.get("id") != my_id:
        name = _first(holder)
        return f"{name} has this file open. Your saves stay on this computer until {name} closes it."
    owner = part.get("owner")
    if owner and owner.get("id") != my_id:
        name = _first(owner)
        return f"{name} owns this asset. Only {name} or a lead can send saves of it to the team."
    return ""


def save_refused_line(code: str, message: str) -> str:
    """A refused save in plain words. The file on disk is untouched either way."""
    if code == "lock_held":
        name = message.removesuffix(" has this part").strip().split(" ")[0] or "Someone"
        return f"{name} has this file open. Your save stays on this computer."
    if code == "forbidden":
        return "Only the owner or a lead can send saves of this file. Your save stays on this computer."
    if code == "gate_closed":
        return "This asset waits on another one first. Your save stays on this computer."
    return message


def open_refused_line(code: str, message: str) -> str:
    """A refused open in plain words, short enough for the sidebar."""
    if code == "forbidden":
        return "Approved. A lead can reopen it."
    if code == "gate_closed":
        return "This asset waits on another one first."
    return message


def publish_label(rows: list[CheckLine], note: str) -> str:
    """The app's labels: a red check first, then the note, then Publish. A check not run yet is
    not red: Publish runs the checks itself (the app's rule since v8 step 11)."""
    if any(not r.passed and not r.pending for r in rows):
        return "Publish, after the red one"
    if not note.strip():
        return "Publish, after the note"
    return "Publish"


class Throttle:
    """At most one run every `every` seconds, and only when something changed since."""

    def __init__(self, every: float) -> None:
        self.every = every
        self.last = -1e9
        self.dirty = False

    def mark(self) -> None:
        self.dirty = True

    def due(self, now: float) -> bool:
        if not self.dirty or now - self.last < self.every:
            return False
        self.dirty = False
        self.last = now
        return True


class Heartbeat:
    """Every 20 s, the agent hears which file is open. Nothing while no file is."""

    def __init__(self, every: float = HEARTBEAT_EVERY_S) -> None:
        self.every = every
        self.last = -1e9

    def due(self, now: float) -> bool:
        if now - self.last < self.every:
            return False
        self.last = now
        return True


def run_four(facts: checks.SceneFacts, budget: int, max_texture: int | None = None, fix: bool = False) -> tuple[list[dict[str, Any]], checks.SceneFacts]:
    """The four checks on the scene facts, with the budget from the project."""
    sp = specs(budget, max_texture)
    ids = [c["id"] for c in sp]
    params = {c["id"]: dict(c["params"]) for c in sp}
    sev = {c["id"]: c["severity"] for c in sp}
    return checks.run_checks(ids, params, sev, facts, fix=fix)

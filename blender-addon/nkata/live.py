"""The v8 panel's live parts, without bpy: the four checks as the artist works, throttled to one
run every 2 s on a scene change; the heartbeat to the agent every 20 s with the open file; the
check specs from the project's budgets; the Publish label. docs/tasks/v8-prompts.md, step 12."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any

from . import checks

CHECK_EVERY_S = 2.0
HEARTBEAT_EVERY_S = 20.0

# v8 keys for the four checks, in panel order, and the Blender check that runs each. The pivot
# line follows when the template runs it (step 21).
KEYS = (("textures", "texture_names"), ("scale", "unit_scale"), ("uv", "uv_set_present"), ("tris", "triangle_budget"), ("pivot", "pivot_at_base"))
FIX = {
    "textures": "Rename the images T_<asset>_<map>. Fix does it.",
    "scale": "Apply scale in Blender. Fix does it.",
    "uv": "Unwrap the mesh.",
    "tris": "Over budget. Decimate or split the mesh.",
    "pivot": "Fix origin moves it to the base. A pivot off the base on purpose needs a lead to accept it.",
}
FIX_GRID = "Snap the origin to the low corner on the grid. A pivot off the grid on purpose needs a lead to accept it."
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


def specs(budget: int, max_texture: int | None = None, template: list[dict[str, Any]] | None = None) -> list[dict[str, Any]]:
    """The four checks with their params, then the pivot rule when the template runs it. Each
    takes the template's level when the template names it, else block (step 21). The budget is
    always the project's."""
    named = {c["id"]: c for c in template or []}

    def level(check_id: str) -> str:
        return str(named[check_id]["severity"]) if check_id in named else "block"

    out = [
        {"id": "texture_names", "severity": level("texture_names"), "params": {"pattern": "T_.*"}},
        {"id": "unit_scale", "severity": level("unit_scale"), "params": {}},
        {"id": "uv_set_present", "severity": level("uv_set_present"), "params": {}},
        {"id": "triangle_budget", "severity": level("triangle_budget"), "params": {"max": int(budget)}},
    ]
    if max_texture:
        out.append({"id": "texture_size", "severity": "block", "params": {"max": int(max_texture)}})
    pivot = named.get("pivot_at_base")
    if pivot is not None and (pivot.get("params") or {}).get("convention", "base") != "authored":
        out.append({"id": "pivot_at_base", "severity": level("pivot_at_base"), "params": dict(pivot.get("params") or {})})
    return out


@dataclass(frozen=True)
class CheckLine:
    key: str
    passed: bool
    sentence: str
    fix: str
    # Not run yet: neither a pass nor a fail, and never the red one Publish waits on.
    pending: bool = False
    # The template's level (step 21): only a failing block line holds Publish.
    level: str = "block"
    # A lead accepted this failing check: who and why, in one line. Empty otherwise.
    accepted: str = ""

    @property
    def holds(self) -> bool:
        return not self.passed and not self.pending and self.level == "block" and not self.accepted


def lines(results: list[dict[str, Any]], card: dict[str, Any], budget: int, exceptions: list[dict[str, Any]] | None = None) -> list[CheckLine]:
    """The four lines the panel shows and the manifest carries, then the pivot line when it ran: a
    pass says its number, a fail says the problem in one line and its fix in the next."""
    by_id = {r["check_id"]: r for r in results}
    taken = {str(e.get("check_id")): e for e in exceptions or []}
    out: list[CheckLine] = []
    for key, check_id in KEYS:
        r = by_id.get(check_id)
        if r is None:
            if key != "pivot":
                out.append(CheckLine(key, False, "Not checked yet.", FIX[key], pending=True))
            continue
        level = str(r.get("severity", "block"))
        fix = FIX_GRID if key == "pivot" and "grid" in str(r["message"]) else FIX[key]
        if r["passed"]:
            sentence = "Pivot follows the project's rule." if key == "pivot" else green_sentence(key, card, budget)
            out.append(CheckLine(key, True, sentence, fix, level=level))
        else:
            e = taken.get(check_id)
            accepted = f"Accepted by {_first(e.get('by'))}: {e.get('reason', '')}" if e else ""
            message = str(r["message"]).rstrip(".")
            out.append(CheckLine(key, False, message[:1].upper() + message[1:] + ".", fix, level=level, accepted=accepted))
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


VALIDATORS = "unreal_validators"


def validator_line(findings: list[dict[str, Any]], exceptions: list[dict[str, Any]] | None = None) -> CheckLine | None:
    """What Unreal's validators said about the preview, as one line in their words, one finding
    per row of the sentence (v8 step 22). An error holds Publish, as a block check does; warnings
    alone are shown. None when they found nothing or did not run."""
    if not findings:
        return None
    ordered = sorted(findings, key=lambda f: f.get("level") != "error")
    errors = any(f.get("level") == "error" for f in findings)
    sentence = "\n".join(f"Unreal: {f.get('asset')}: {f.get('message')}" for f in ordered)
    e = next((x for x in exceptions or [] if x.get("check_id") == VALIDATORS), None)
    accepted = f"Accepted by {_first(e.get('by'))}: {e.get('reason', '')}" if e else ""
    return CheckLine("unreal", False, sentence, "Fix it in Blender and save again, or a lead accepts it.", level="block" if errors else "warn", accepted=accepted)


def manifest_checks(rows: list[CheckLine]) -> list[dict[str, Any]]:
    return [{"key": r.key, "pass": r.passed, "level": r.level, "sentence": r.sentence, "fix": r.fix} for r in rows]


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
    not red: Publish runs the checks itself (the app's rule since v8 step 11). Only a failing
    block level check nobody accepted is red (step 21)."""
    if any(r.holds for r in rows):
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


def run_four(
    facts: checks.SceneFacts, budget: int, max_texture: int | None = None, fix: bool = False, template: list[dict[str, Any]] | None = None
) -> tuple[list[dict[str, Any]], checks.SceneFacts]:
    """The four checks on the scene facts, with the budget from the project, and the pivot rule
    when the template runs it. Fix never moves an origin: Fix origin does, when asked, because a
    pivot off the base can be on purpose."""
    sp = specs(budget, max_texture, template)
    ids = [c["id"] for c in sp]
    params = {c["id"]: dict(c["params"]) for c in sp}
    sev = {c["id"]: c["severity"] for c in sp}
    return checks.run_checks(ids, params, sev, facts, fix=fix, never_fix=frozenset({"pivot_at_base"}))

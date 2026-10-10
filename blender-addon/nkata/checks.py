"""Checks that run in Blender on Publish. Pure functions over SceneFacts so they run without bpy;
save_hook gathers the facts. Contracts: shared/checks/<id>.json. Results: shared CheckResult.
See docs/engineering.md, Checks.

Each check returns (passed, message, fixed). A fixer returns the new facts after the fix, so the
check runs again and reports auto_fixed. Only unit_scale and name_pattern fix."""

from __future__ import annotations

import re
from collections.abc import Callable
from dataclasses import dataclass, field, replace
from typing import Any

from . import nkata_shared as shared

# Blender runs these. lod_count, collision_present, and metahuman_dna_present run in UE5.
BLENDER_CHECKS = (
    "unit_scale",
    "name_pattern",
    "triangle_budget",
    "uv_set_present",
    "texture_size",
    "rig_bone_names",
    "rig_bone_count",
    "pivot_at_base",
)

PIVOT_TOLERANCE_M = 0.001


@dataclass(frozen=True)
class ObjectFacts:
    name: str
    triangles: int
    uv_layers: tuple[str, ...]
    bounds_min: tuple[float, float, float]
    origin: tuple[float, float, float]


@dataclass(frozen=True)
class TextureFacts:
    name: str
    width: int
    height: int


@dataclass(frozen=True)
class SceneFacts:
    unit_scale: float
    objects: tuple[ObjectFacts, ...]
    textures: tuple[TextureFacts, ...] = ()
    bone_names: tuple[str, ...] = ()
    """Bone names the rig must match, by skeleton name. Filled from the template reference."""
    skeletons: dict[str, tuple[str, ...]] = field(default_factory=dict)


Outcome = tuple[bool, str]
Fixer = Callable[[SceneFacts, dict[str, Any]], SceneFacts]


def _unit_scale(facts: SceneFacts, params: dict[str, Any]) -> Outcome:
    expected = float(params.get("expected", 1.0))
    ok = abs(facts.unit_scale - expected) < 1e-6
    return ok, "" if ok else f"unit scale is {facts.unit_scale}, expected {expected}"


def _fix_unit_scale(facts: SceneFacts, params: dict[str, Any]) -> SceneFacts:
    return replace(facts, unit_scale=float(params.get("expected", 1.0)))


def _name_pattern(facts: SceneFacts, params: dict[str, Any]) -> Outcome:
    pattern = re.compile(str(params["pattern"]))
    bad = [o.name for o in facts.objects if not pattern.fullmatch(o.name)]
    return not bad, "" if not bad else f"{len(bad)} names do not match {pattern.pattern}: {', '.join(bad[:5])}"


def conform_name(name: str, pattern: str) -> str:
    """The closest name that matches a pattern of the form PREFIX_{name}: prefix added, spaces and
    dots replaced. A pattern with no literal prefix leaves the name unchanged."""
    cleaned = re.sub(r"[^A-Za-z0-9_]", "_", name)
    prefix = re.match(r"\^?([A-Za-z0-9_]+)", pattern)
    if prefix and not cleaned.startswith(prefix.group(1)):
        cleaned = prefix.group(1) + cleaned
    return cleaned


def _fix_name_pattern(facts: SceneFacts, params: dict[str, Any]) -> SceneFacts:
    pattern = str(params["pattern"])
    return replace(facts, objects=tuple(replace(o, name=conform_name(o.name, pattern)) for o in facts.objects))


def _triangle_budget(facts: SceneFacts, params: dict[str, Any]) -> Outcome:
    total = sum(o.triangles for o in facts.objects)
    limit = int(params["max"])
    return total <= limit, "" if total <= limit else f"{total:,} triangles of {limit:,}"


def _uv_set_present(facts: SceneFacts, params: dict[str, Any]) -> Outcome:
    name = params.get("name")
    missing = [o.name for o in facts.objects if not o.uv_layers or (name and name not in o.uv_layers)]
    return not missing, "" if not missing else f"no UV set on {', '.join(missing[:5])}"


def _texture_size(facts: SceneFacts, params: dict[str, Any]) -> Outcome:
    limit = int(params.get("max", 4096))
    bad = [t.name for t in facts.textures if t.width > limit or t.height > limit or not _power_of_two(t.width) or not _power_of_two(t.height)]
    return not bad, "" if not bad else f"{len(bad)} textures over {limit} or not a power of two: {', '.join(bad[:5])}"


def _power_of_two(n: int) -> bool:
    return n > 0 and (n & (n - 1)) == 0


def _rig_bone_names(facts: SceneFacts, params: dict[str, Any]) -> Outcome:
    skeleton = str(params["skeleton"])
    expected = facts.skeletons.get(skeleton)
    if expected is None:
        return False, f"skeleton {skeleton} is not in the reference"
    missing = [b for b in expected if b not in facts.bone_names]
    extra = [b for b in facts.bone_names if b not in expected]
    ok = not missing and not extra
    parts = []
    if missing:
        parts.append(f"missing {', '.join(missing[:5])}")
    if extra:
        parts.append(f"extra {', '.join(extra[:5])}")
    return ok, "" if ok else "; ".join(parts)


def _rig_bone_count(facts: SceneFacts, params: dict[str, Any]) -> Outcome:
    limit = int(params["max"])
    n = len(facts.bone_names)
    return n <= limit, "" if n <= limit else f"{n} bones of {limit}"


def _pivot_at_base(facts: SceneFacts, params: dict[str, Any]) -> Outcome:
    high = [o.name for o in facts.objects if abs(o.origin[2] - o.bounds_min[2]) > PIVOT_TOLERANCE_M]
    return not high, "" if not high else f"origin is not at the base of {', '.join(high[:5])}"


CHECKS: dict[str, Callable[[SceneFacts, dict[str, Any]], Outcome]] = {
    "unit_scale": _unit_scale,
    "name_pattern": _name_pattern,
    "triangle_budget": _triangle_budget,
    "uv_set_present": _uv_set_present,
    "texture_size": _texture_size,
    "rig_bone_names": _rig_bone_names,
    "rig_bone_count": _rig_bone_count,
    "pivot_at_base": _pivot_at_base,
}

FIXERS: dict[str, Fixer] = {"unit_scale": _fix_unit_scale, "name_pattern": _fix_name_pattern}


def run_checks(
    check_ids: list[str],
    params: dict[str, dict[str, Any]],
    severities: dict[str, str],
    facts: SceneFacts,
    fix: bool = True,
) -> tuple[list[dict[str, Any]], SceneFacts]:
    """Runs the template's checks that Blender owns, in template order. Applies fixes when asked
    and reports auto_fixed. Returns the results and the facts after any fix, so the caller can
    write the fixes back into the scene. Checks Blender does not own are skipped: UE5 runs them."""
    results: list[dict[str, Any]] = []
    for check_id in check_ids:
        run = CHECKS.get(check_id)
        if run is None:
            continue
        p = dict(params.get(check_id) or {})
        passed, message = _run_one(run, facts, p)
        fixed = False
        if not passed and fix and check_id in FIXERS and _has_params(check_id, p):
            facts = FIXERS[check_id](facts, p)
            passed, message = run(facts, p)
            fixed = passed
        results.append(
            shared.validate_CheckResult(
                {"check_id": check_id, "severity": severities.get(check_id, "block"), "passed": passed, "auto_fixed": fixed, "message": message}
            ).to_dict()
        )
    return results, facts


def _run_one(run: Callable[[SceneFacts, dict[str, Any]], Outcome], facts: SceneFacts, params: dict[str, Any]) -> Outcome:
    """A check whose template left out a required param fails with a message instead of raising,
    so one bad template line never breaks the save."""
    try:
        return run(facts, params)
    except KeyError as e:
        return False, f"the template sets no {e.args[0]} for this check"


def _has_params(check_id: str, params: dict[str, Any]) -> bool:
    return check_id != "name_pattern" or "pattern" in params


def blocked_by(results: list[dict[str, Any]]) -> list[str]:
    """Checks that stop Publish: failed and blocking."""
    return [r["check_id"] for r in results if not r["passed"] and r["severity"] == "block"]

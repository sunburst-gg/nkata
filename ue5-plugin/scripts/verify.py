"""Did the import keep what the export held? (docs/tasks/v8-17-export-intact.md, item 7)

The import script reads the assets Unreal made and hands them here with what the manifest says
the export held. Pure, no unreal module, so it tests outside the editor.

Measured on UE 5.8 with a glTF from the add-on (docs/decisions.md, 2026-10-27): material slots
keep the Blender material names and the skeleton keeps the bone names, but an animation arrives
named after the mesh (SK_Hero_Anim, not Walk) and one frame longer (Unreal counts the last
frame). So animations pair by name when Unreal kept it, else by the closest length, and the
result says which Blender action became which sequence.
"""

from __future__ import annotations

from typing import Any

# One frame at 24 fps, and a little: the length Unreal reports counts the last frame.
LENGTH_TOLERANCE_S = 0.0625


def _names(names: list[str]) -> str:
    shown = ", ".join(names[:3])
    return shown if len(names) <= 3 else f"{shown} and {len(names) - 3} more"


def pair_animations(expected: list[dict[str, Any]], got: list[dict[str, Any]]) -> tuple[list[dict[str, Any]], list[str]]:
    """Each Blender animation with the sequence it became, and the ones that did not arrive."""
    left = list(got)
    pairs: list[dict[str, Any]] = []
    missing: list[str] = []
    for want in expected:
        name = str(want["name"])
        match = next((g for g in left if str(g["name"]) == name or str(g["name"]).endswith("_" + name)), None)
        if match is None:
            close = sorted((g for g in left if abs(float(g["seconds"]) - float(want["seconds"])) <= LENGTH_TOLERANCE_S), key=lambda g: abs(float(g["seconds"]) - float(want["seconds"])))
            match = close[0] if close else None
        if match is None:
            missing.append(name)
            continue
        left.remove(match)
        pairs.append({"blender": name, "unreal": str(match["name"]), "seconds": float(want["seconds"]), "unreal_seconds": float(match["seconds"])})
    return pairs, missing


def differences(expected: dict[str, Any], got: dict[str, Any]) -> dict[str, Any]:
    """What the export held that Unreal does not have, in the add-on's words."""
    lines: list[str] = []
    materials = sorted(set(expected.get("materials") or []) - set(got.get("materials") or []))
    if materials:
        lines.append(f"Materials not in Unreal: {_names(materials)}.")
    have = set(got.get("bones") or [])
    bones = [b for b in expected.get("bones") or [] if b not in have]
    if bones:
        lines.append(f"Bones not in Unreal: {_names(bones)}.")
    pairs, missing = pair_animations(list(expected.get("animations") or []), list(got.get("animations") or []))
    if missing:
        lines.append(f"Animations not in Unreal: {_names(missing)}.")
    return {"intact": not lines, "lines": lines, "animations": pairs}

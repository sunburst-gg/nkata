"""manifest.json written next to the export: objects, triangle counts, materials, bounds,
armature name, and the hash table. Shape: shared ObjectManifest."""

from __future__ import annotations

import json
from dataclasses import dataclass
from pathlib import Path
from typing import Any

from . import nkata_shared as shared

Vec3 = tuple[float, float, float]


@dataclass(frozen=True)
class ObjectInfo:
    name: str
    triangles: int
    materials: list[str]
    bounds_min: Vec3
    bounds_max: Vec3
    hash: str
    origin: Vec3 = (0.0, 0.0, 0.0)
    scale: Vec3 = (1.0, 1.0, 1.0)
    uv_sets: tuple[str, ...] = ()


def build_manifest(
    objects: list[ObjectInfo],
    armature: str | None,
    mirror_target: str | None,
    kind: str = "character",
    bone_count: int | None = None,
    textures: list[tuple[str, int, int]] | None = None,
    unit_scale: float | None = None,
    asset_kind: str | None = None,
    checks: list[dict[str, Any]] | None = None,
    bones: list[str] | None = None,
    animations: dict[str, float] | None = None,
    export: dict[str, Any] | None = None,
) -> dict[str, Any]:
    """Validated against the shared schema before it leaves the add-on. Textures and the unit
    scale feed the publish card (docs/tasks/07-blender-first.md, slice 4)."""
    data: dict[str, Any] = {
        "v": 1,
        "kind": kind,
        "objects": [
            {
                "name": o.name,
                "triangles": o.triangles,
                "materials": list(o.materials),
                "bounds_min": [float(x) for x in o.bounds_min],
                "bounds_max": [float(x) for x in o.bounds_max],
                "hash": o.hash,
                "origin": [float(x) for x in o.origin],
                "scale": [float(x) for x in o.scale],
                "uv_sets": list(o.uv_sets),
            }
            for o in objects
        ],
        "bone_count": bone_count,
        "armature": armature,
        "mirror_target": mirror_target,
        "textures": [{"name": n, "width": int(w), "height": int(h)} for n, w, h in (textures or [])],
    }
    if unit_scale is not None:
        data["unit_scale"] = float(unit_scale)
    # v8 (step 13): the wall's kind and the four checks with their sentences and fixes.
    if asset_kind is not None:
        data["asset_kind"] = asset_kind
    if checks is not None:
        data["checks"] = [dict(c) for c in checks]
    # v8 step 17: the rig by name, the animations the export holds, and the export read back.
    if bones:
        data["bones"] = list(bones)
    if animations:
        data["animations"] = [{"name": n, "seconds": float(s)} for n, s in sorted(animations.items())]
    if export is not None:
        data["export"] = export
    return shared.validate_ObjectManifest(data).to_dict()


# A prop sits on its origin and exports at scale 1. See docs/engineering.md, The mirror, step 2.
PIVOT_TOLERANCE_M = 0.001
SCALE_TOLERANCE = 0.0001


def static_problems(objects: list[ObjectInfo]) -> list[str]:
    """Why a prop export is refused: an origin off the base of the bounds, or a scale not 1.
    Pure, so it runs without bpy. Empty means the export may run."""
    problems: list[str] = []
    for o in objects:
        if any(abs(float(v) - 1.0) > SCALE_TOLERANCE for v in o.scale):
            problems.append(f"{o.name}: scale is {tuple(round(float(v), 4) for v in o.scale)}, apply scale so it is 1, 1, 1")
        if abs(float(o.origin[2]) - float(o.bounds_min[2])) > PIVOT_TOLERANCE_M:
            problems.append(f"{o.name}: origin is {round(float(o.origin[2]) - float(o.bounds_min[2]), 4)} m above the base, set origin to the bottom")
    return problems


def write_manifest(path: Path, manifest: dict[str, Any]) -> None:
    path.write_text(json.dumps(manifest, indent=2), encoding="utf-8")


def bounds_of(points: list[tuple[float, float, float]]) -> tuple[tuple[float, float, float], tuple[float, float, float]]:
    if not points:
        return (0.0, 0.0, 0.0), (0.0, 0.0, 0.0)
    xs, ys, zs = zip(*points, strict=True)
    return (min(xs), min(ys), min(zs)), (max(xs), max(ys), max(zs))

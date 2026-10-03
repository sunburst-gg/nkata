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


def build_manifest(
    objects: list[ObjectInfo],
    armature: str | None,
    mirror_target: str | None,
    kind: str = "character",
    bone_count: int | None = None,
) -> dict[str, Any]:
    """Validated against the shared schema before it leaves the add-on."""
    data = {
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
            }
            for o in objects
        ],
        "bone_count": bone_count,
        "armature": armature,
        "mirror_target": mirror_target,
    }
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

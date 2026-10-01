"""manifest.json written next to the export: objects, triangle counts, materials, bounds,
armature name, and the hash table. Shape: shared ObjectManifest."""

from __future__ import annotations

import json
from dataclasses import dataclass
from pathlib import Path
from typing import Any

from . import nkata_shared as shared


@dataclass(frozen=True)
class ObjectInfo:
    name: str
    triangles: int
    materials: list[str]
    bounds_min: tuple[float, float, float]
    bounds_max: tuple[float, float, float]
    hash: str


def build_manifest(objects: list[ObjectInfo], armature: str | None, mirror_target: str | None) -> dict[str, Any]:
    """Validated against the shared schema before it leaves the add-on."""
    data = {
        "v": 1,
        "objects": [
            {
                "name": o.name,
                "triangles": o.triangles,
                "materials": list(o.materials),
                "bounds_min": [float(x) for x in o.bounds_min],
                "bounds_max": [float(x) for x in o.bounds_max],
                "hash": o.hash,
            }
            for o in objects
        ],
        "armature": armature,
        "mirror_target": mirror_target,
    }
    return shared.validate_ObjectManifest(data).to_dict()


def write_manifest(path: Path, manifest: dict[str, Any]) -> None:
    path.write_text(json.dumps(manifest, indent=2), encoding="utf-8")


def bounds_of(points: list[tuple[float, float, float]]) -> tuple[tuple[float, float, float], tuple[float, float, float]]:
    if not points:
        return (0.0, 0.0, 0.0), (0.0, 0.0, 0.0)
    xs, ys, zs = zip(*points, strict=True)
    return (min(xs), min(ys), min(zs)), (max(xs), max(ys), max(zs))

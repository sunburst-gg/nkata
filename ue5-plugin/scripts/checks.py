"""Checks that run in UE5 on Publish: LOD count, collision, MetaHuman DNA, triangle budget, names.

Args file: {v, asset_path, checks: [{id, severity, params}]}. Result: {ok, results: [CheckResult]}.
Contracts: shared/checks/<id>.json. The agent posts the results with Publish.
See docs/engineering.md, Checks.

StaticMesh: https://dev.epicgames.com/documentation/en-us/unreal-engine/python-api/class/StaticMesh
SkeletalMesh: https://dev.epicgames.com/documentation/en-us/unreal-engine/python-api/class/SkeletalMesh
"""

from __future__ import annotations

import os
import re
import sys
from collections.abc import Callable
from typing import Any

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from _result import emit, read_args  # noqa: E402

try:
    import unreal
except ImportError:  # pragma: no cover - only inside the editor
    unreal = None

Outcome = tuple[bool, str]


def lod_count(asset: Any, params: dict[str, Any]) -> Outcome:
    want = int(params.get("min", 3))
    if hasattr(asset, "get_num_lods"):
        n = int(asset.get_num_lods())
    else:
        n = len(getattr(asset, "lod_info", []) or [])
    return n >= want, "" if n >= want else f"{n} LODs of {want}"


def collision_present(asset: Any, _params: dict[str, Any]) -> Outcome:
    body = getattr(asset, "body_setup", None)
    geom = getattr(body, "agg_geom", None) if body is not None else None
    n = 0
    if geom is not None:
        for key in ("box_elems", "sphere_elems", "sphyl_elems", "convex_elems"):
            n += len(getattr(geom, key, []) or [])
    if n == 0 and hasattr(asset, "get_num_sections") and isinstance(asset, unreal.StaticMesh):
        # Complex collision as simple counts: the mesh itself is the collision.
        settings = getattr(body, "collision_trace_flag", None)
        if settings is not None and "COMPLEX_AS_SIMPLE" in str(settings):
            n = 1
    return n > 0, "" if n > 0 else "no collision on the asset"


def metahuman_dna_present(asset: Any, _params: dict[str, Any]) -> Outcome:
    data = getattr(asset, "asset_user_data", None) or []
    found = any("DNA" in type(d).__name__ for d in data)
    return found, "" if found else "no MetaHuman DNA asset user data on the mesh"


def triangle_budget(asset: Any, params: dict[str, Any]) -> Outcome:
    limit = int(params["max"])
    n = 0
    if isinstance(asset, unreal.StaticMesh):
        n = int(asset.get_num_triangles(0))
    elif hasattr(asset, "get_num_triangles"):
        n = int(asset.get_num_triangles(0))
    return n <= limit, "" if n <= limit else f"{n:,} triangles of {limit:,}"


def name_pattern(asset: Any, params: dict[str, Any]) -> Outcome:
    pattern = re.compile(str(params["pattern"]))
    name = str(asset.get_name())
    ok = pattern.fullmatch(name) is not None
    return ok, "" if ok else f"{name} does not match {pattern.pattern}"


CHECKS: dict[str, Callable[[Any, dict[str, Any]], Outcome]] = {
    "lod_count": lod_count,
    "collision_present": collision_present,
    "metahuman_dna_present": metahuman_dna_present,
    "triangle_budget": triangle_budget,
    "name_pattern": name_pattern,
}


def main(argv: list[str]) -> None:
    args = read_args(argv)
    if unreal is None:
        emit(False, "unreal module not available: run inside the editor")
        return
    asset_path = str(args["asset_path"])
    asset = unreal.EditorAssetLibrary.load_asset(asset_path)
    if asset is None:
        emit(False, "asset not found", asset_path=asset_path)
        return
    results = []
    for spec in args.get("checks", []):
        run = CHECKS.get(str(spec["id"]))
        if run is None:
            continue
        passed, message = run(asset, dict(spec.get("params") or {}))
        results.append({"check_id": spec["id"], "severity": spec.get("severity", "block"), "passed": passed, "auto_fixed": False, "message": message})
    emit(True, "", asset_path=asset_path, results=results)


if __name__ == "__main__":
    try:
        main(sys.argv)
    except Exception as e:  # noqa: BLE001 - the agent needs one line, whatever failed
        emit(False, f"{type(e).__name__}: {e}")

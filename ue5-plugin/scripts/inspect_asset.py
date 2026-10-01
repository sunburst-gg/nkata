"""Report what the mirror must keep on an asset: material slot names, skeleton, physics asset.

Args file: {v, asset_path}. The e2e script compares the report before and after 20 reimports.
"""

from __future__ import annotations

import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from _result import emit, read_args  # noqa: E402

try:
    import unreal
except ImportError:  # pragma: no cover - only inside the editor
    unreal = None


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
    materials = [str(m.material_slot_name) for m in getattr(asset, "materials", []) or []]
    if not materials and hasattr(asset, "static_materials"):
        materials = [str(m.material_slot_name) for m in asset.static_materials]
    skeleton = getattr(asset, "skeleton", None)
    physics = getattr(asset, "physics_asset", None)
    emit(
        True,
        "",
        asset_path=asset_path,
        kind=type(asset).__name__,
        materials=materials,
        skeleton=skeleton.get_path_name() if skeleton is not None else None,
        physics_asset=physics.get_path_name() if physics is not None else None,
    )


if __name__ == "__main__":
    try:
        main(sys.argv)
    except Exception as e:  # noqa: BLE001 - the agent needs one line, whatever failed
        emit(False, f"{type(e).__name__}: {e}")

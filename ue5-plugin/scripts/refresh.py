"""Rescan a content path and sync the Content Browser to an asset.

Args file: {v, asset_path}. Used after a Retry and by the panel's refresh button.
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
    registry = unreal.AssetRegistryHelpers.get_asset_registry()
    registry.scan_paths_synchronous([os.path.dirname(asset_path)], True)
    exists = unreal.EditorAssetLibrary.does_asset_exist(asset_path)
    if exists:
        unreal.EditorAssetLibrary.sync_browser_to_objects([asset_path])
    emit(True, "" if exists else "asset not found after rescan", asset_path=asset_path, exists=exists)


if __name__ == "__main__":
    try:
        main(sys.argv)
    except Exception as e:  # noqa: BLE001 - the agent needs one line, whatever failed
        emit(False, f"{type(e).__name__}: {e}")

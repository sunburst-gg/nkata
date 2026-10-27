"""Finding what an import made. Interchange files a glTF import under
<destination>/<file>/{SkeletalMeshes,StaticMeshes,Materials,Textures}/ and names the mesh after
the file's mesh, not destination_name; imported_object_paths[0] is often a texture or the
skeleton (measured on UE 5.8, docs/decisions.md, 2026-10-27). So both import scripts look for
the mesh by class, under the destination and among what the import returned.
"""

from __future__ import annotations

from typing import Any

try:
    import unreal
except ImportError:  # pragma: no cover - only inside the editor
    unreal = None


def find_existing(destination_path: str, asset_name: str, cls: Any) -> Any | None:
    """The part's mesh from an earlier import: the one named asset_name, else the only one."""
    meshes = []
    for path in unreal.EditorAssetLibrary.list_assets(destination_path, recursive=True):
        asset = unreal.EditorAssetLibrary.load_asset(path)
        if isinstance(asset, cls):
            meshes.append(asset)
    named = [m for m in meshes if m.get_name() == asset_name]
    if named:
        return named[0]
    return meshes[0] if len(meshes) == 1 else None


def imported_mesh(paths: list[str], cls: Any) -> Any | None:
    """The mesh among what the import made."""
    for path in paths:
        asset = unreal.EditorAssetLibrary.load_asset(path)
        if isinstance(asset, cls):
            return asset
    return None

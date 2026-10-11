"""Export a level area as one GLB on Mark Ready. The agent stores it as the version's model, so a
viewer walks the area in the app without Unreal.

Args file: {v, part_id, version_id, level, area, out_path}. The actors are the ones tagged
`nkata.area=<area>` in the open level (docs/engineering.md, Environment: One File Per Actor).
Epic's glTF exporter does the work: materials baked to textures, centimeters to meters.
GLTFExporter.export_to_gltf:
https://dev.epicgames.com/documentation/en-us/unreal-engine/python-api/class/GLTFExporter
GLTFExportOptions:
https://dev.epicgames.com/documentation/en-us/unreal-engine/python-api/class/GLTFExportOptions
"""

from __future__ import annotations

import os
import sys
from typing import Any

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from _result import emit, read_args  # noqa: E402

try:
    import unreal
except ImportError:  # pragma: no cover - only inside the editor
    unreal = None

AREA_TAG = "nkata.area"


def area_tag(area: str) -> str:
    return f"{AREA_TAG}={area}"


def tagged(actors: list[Any], area: str) -> list[Any]:
    """The actors whose tags hold `nkata.area=<area>`. Tags are compared as plain strings."""
    want = area_tag(area)
    out: list[Any] = []
    for actor in actors:
        tags = getattr(actor, "tags", None) or []
        if any(str(t) == want for t in tags):
            out.append(actor)
    return out


def export_options() -> Any:
    """Baked materials so the viewer gets textures, meters, no lights or cameras from the editor."""
    options = unreal.GLTFExportOptions()
    options.export_uniform_scale = 0.01
    options.bake_material_inputs = unreal.GLTFMaterialBakeMode.USE_MESH_DATA
    options.export_proxy_materials = True
    options.export_lights = False
    options.export_cameras = False
    options.export_hidden_in_game = False
    options.export_vertex_colors = False
    options.texture_image_format = unreal.GLTFTextureImageFormat.PNG
    options.skip_near_default_values = True
    return options


def main(argv: list[str]) -> None:
    args = read_args(argv)
    if unreal is None:
        emit(False, "unreal module not available: run inside the editor")
        return
    area = str(args["area"])
    out_path = str(args["out_path"])
    actors = list(unreal.get_editor_subsystem(unreal.EditorActorSubsystem).get_all_level_actors())
    picked = tagged(actors, area)
    if not picked:
        emit(False, f"no actor in the open level is tagged {area_tag(area)}")
        return
    os.makedirs(os.path.dirname(out_path), exist_ok=True)
    messages = unreal.GLTFExporter.export_to_gltf(None, out_path, export_options(), set(picked))
    if not os.path.isfile(out_path):
        why = "; ".join(str(m) for m in (getattr(messages, "errors", None) or [])) or "the exporter wrote nothing"
        emit(False, f"export failed: {why}")
        return
    emit(True, "", path=out_path, version_id=str(args["version_id"]), actors=len(picked))


if __name__ == "__main__":
    try:
        main(sys.argv)
    except Exception as e:  # noqa: BLE001 - the agent needs one line, whatever failed
        emit(False, f"{type(e).__name__}: {e}")

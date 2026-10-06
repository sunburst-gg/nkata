"""Comment pins in the UE5 editor. Until the C++ viewport module exists, the widget lists pins
and frames the camera on one (docs/engineering.md, Comment pins).

Args file: {v, action: "list" | "frame", asset_path, pins: [CommentPin], index}.
- list: draws one debug sphere per pin for 60 s at the pin's point in the actor's world space
  and returns the world points.
- frame: moves the level viewport camera to look at pin `index` from 1.5 m away.

Pin points are in the part's local space. For a static mesh placed once, the first placed actor
gives the transform; a mesh placed many times shows the pin on each copy.

EditorLevelLibrary: https://dev.epicgames.com/documentation/en-us/unreal-engine/python-api/class/EditorLevelLibrary
UnrealEditorSubsystem: https://dev.epicgames.com/documentation/en-us/unreal-engine/python-api/class/UnrealEditorSubsystem
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

PIN_RADIUS_CM = 4.0
FRAME_DISTANCE_CM = 150.0
OPEN_COLOR = (255, 158, 51)
RESOLVED_COLOR = (115, 115, 115)


def pin_color(pin: dict[str, Any]) -> tuple[int, int, int]:
    return RESOLVED_COLOR if pin.get("resolved_at") else OPEN_COLOR


def to_cm(point: list[float]) -> tuple[float, float, float]:
    """Blender metres, z up, right handed to Unreal centimetres, z up, left handed: y flips."""
    x, y, z = (float(v) for v in point)
    return (x * 100.0, -y * 100.0, z * 100.0)


def actors_using(asset_path: str) -> list[Any]:
    subsystem = unreal.get_editor_subsystem(unreal.EditorActorSubsystem)
    out = []
    for actor in subsystem.get_all_level_actors():
        comp = actor.get_component_by_class(unreal.StaticMeshComponent) or actor.get_component_by_class(unreal.SkeletalMeshComponent)
        if comp is None:
            continue
        mesh = getattr(comp, "static_mesh", None) or getattr(comp, "skeletal_mesh_asset", None) or getattr(comp, "skeletal_mesh", None)
        if mesh is not None and mesh.get_path_name().split(".")[0] == asset_path:
            out.append(actor)
    return out


def world_points(actors: list[Any], pin: dict[str, Any]) -> list[Any]:
    local = unreal.Vector(*to_cm(pin["point"]))
    return [a.get_actor_transform().transform_location(local) for a in actors]


def main(argv: list[str]) -> None:
    args = read_args(argv)
    if unreal is None:
        emit(False, "unreal module not available: run inside the editor")
        return
    actors = actors_using(str(args["asset_path"]))
    pins = list(args.get("pins") or [])
    if not actors:
        emit(False, "the asset is not placed in the open level", asset_path=args["asset_path"])
        return
    if args.get("action") == "frame":
        pin = pins[int(args.get("index", 0))]
        target = world_points(actors, pin)[0]
        normal = unreal.Vector(*to_cm(pin.get("normal") or [0, 0, 1]))
        normal = normal.normal() if normal.length() > 0 else unreal.Vector(0, 0, 1)
        eye = target + normal * FRAME_DISTANCE_CM
        rotation = unreal.MathLibrary.find_look_at_rotation(eye, target)
        unreal.get_editor_subsystem(unreal.UnrealEditorSubsystem).set_level_viewport_camera_info(eye, rotation)
        emit(True, "", framed=int(args.get("index", 0)))
        return
    world = unreal.get_editor_subsystem(unreal.UnrealEditorSubsystem).get_editor_world()
    drawn = []
    for pin in pins:
        color = unreal.LinearColor(*(c / 255.0 for c in pin_color(pin)), 1.0)
        for p in world_points(actors, pin):
            unreal.SystemLibrary.draw_debug_sphere(world, p, PIN_RADIUS_CM, 12, color, 60.0, 1.0)
            drawn.append([p.x, p.y, p.z])
    emit(True, "", pins=len(pins), copies=len(actors), points=drawn)


if __name__ == "__main__":
    try:
        main(sys.argv)
    except Exception as e:  # noqa: BLE001 - the agent needs one line, whatever failed
        emit(False, f"{type(e).__name__}: {e}")

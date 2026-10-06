"""Comment pins in the 3D viewport. A gpu overlay draws one mark per pin at the comment's point
in the part's local space; the N-panel list frames the view on a pin. Same mark in both editors
(docs/product.md, open questions, Design).

gpu: https://docs.blender.org/api/current/gpu.html
blf: https://docs.blender.org/api/current/blf.html
Pure helpers (pin_color, pin_label, detached) run without bpy."""

from __future__ import annotations

from typing import Any

try:
    import bpy
    import gpu
    from gpu_extras.batch import batch_for_shader
except ImportError:  # pragma: no cover - plain Python tests stub bpy and have no gpu
    bpy = None
    gpu = None
    batch_for_shader = None

from .state import STATE

PIN_RADIUS_PX = 6.0
OPEN_COLOR = (1.0, 0.62, 0.2, 1.0)
RESOLVED_COLOR = (0.45, 0.45, 0.45, 0.8)
DETACHED_M = 0.05

_handle: Any = None


def pin_color(comment: dict[str, Any]) -> tuple[float, float, float, float]:
    return RESOLVED_COLOR if comment.get("resolved_at") else OPEN_COLOR


def pin_label(index: int, comment: dict[str, Any]) -> str:
    """The number the list shows and the first words of the body."""
    body = str(comment.get("body") or "").strip()
    short = body if len(body) <= 32 else body[:31].rstrip() + "…"
    return f"{index + 1} {short}"


def detached(point: tuple[float, float, float], nearest_surface_m: float | None) -> bool:
    """A pin on an old version still draws by point; more than 5 cm off any surface it shows as
    detached (docs/engineering.md, Comment pins)."""
    del point
    return nearest_surface_m is not None and nearest_surface_m > DETACHED_M


def comments_for_open_part() -> list[dict[str, Any]]:
    part = STATE.part
    if part is None:
        return []
    return STATE.comments.get(part["id"], [])


def _draw() -> None:  # pragma: no cover - needs a viewport
    import blf
    from bpy_extras import view3d_utils

    comments = comments_for_open_part()
    if not comments:
        return
    region = bpy.context.region
    rv3d = bpy.context.region_data
    shader = gpu.shader.from_builtin("UNIFORM_COLOR")
    gpu.state.blend_set("ALPHA")
    for i, c in enumerate(comments):
        point = tuple(float(v) for v in c["point"])
        screen = view3d_utils.location_3d_to_region_2d(region, rv3d, point)
        if screen is None:
            continue
        x, y = screen
        verts = [(x + PIN_RADIUS_PX * dx, y + PIN_RADIUS_PX * dy) for dx, dy in _circle()]
        batch = batch_for_shader(shader, "TRI_FAN", {"pos": [(x, y), *verts]})
        shader.uniform_float("color", pin_color(c))
        with gpu.matrix.push_pop():
            gpu.matrix.load_projection_matrix(gpu.matrix.get_projection_matrix())
            batch.draw(shader)
        blf.position(0, x + PIN_RADIUS_PX + 3, y - 4, 0)
        blf.size(0, 12)
        blf.draw(0, pin_label(i, c))
    gpu.state.blend_set("NONE")


def _circle(n: int = 16) -> list[tuple[float, float]]:
    import math

    return [(math.cos(2 * math.pi * k / n), math.sin(2 * math.pi * k / n)) for k in range(n + 1)]


def frame(context: Any, point: list[float] | tuple[float, ...]) -> None:
    """Moves the 3D cursor to the pin and frames the view on it."""
    context.scene.cursor.location = tuple(float(v) for v in point)
    for area in context.screen.areas:
        if area.type == "VIEW_3D":
            with context.temp_override(area=area, region=next(r for r in area.regions if r.type == "WINDOW")):
                bpy.ops.view3d.view_center_cursor()
            break


def register() -> None:
    global _handle
    if bpy is None or gpu is None or _handle is not None:
        return
    _handle = bpy.types.SpaceView3D.draw_handler_add(_draw, (), "WINDOW", "POST_PIXEL")


def unregister() -> None:
    global _handle
    if bpy is None or _handle is None:
        return
    bpy.types.SpaceView3D.draw_handler_remove(_handle, "WINDOW")
    _handle = None

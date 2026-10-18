"""Comment pins in the 3D viewport (v8 step 13). A gpu overlay draws each pin at its world
position in the commenter's color, a small octahedron with the depth test on, so geometry hides
it. "Jump to pin" frames the view on it. The app draws the same person colors.

gpu: https://docs.blender.org/api/current/gpu.html
Pure helpers (person_color, pin_label, detached, octahedron) run without bpy."""

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

PIN_RADIUS_M = 0.04
DETACHED_M = 0.05
RESOLVED_ALPHA = 0.5

# The eight person colors, as the app's tokens list them (desktop/src/styles/tokens.css).
PERSON_COLORS: tuple[tuple[float, float, float], ...] = (
    (0.710, 0.333, 0.231),  # terracotta
    (0.761, 0.557, 0.169),  # ochre
    (0.431, 0.498, 0.227),  # olive
    (0.184, 0.498, 0.478),  # teal
    (0.310, 0.427, 0.612),  # indigo
    (0.478, 0.306, 0.549),  # plum
    (0.643, 0.337, 0.478),  # rose
    (0.357, 0.404, 0.459),  # slate
)

_handle: Any = None


def color_index(person_id: str) -> int:
    """The same hash the app uses (desktop/src/data/live/wire.ts colorOf): h = h * 31 + code."""
    h = 0
    for ch in person_id:
        h = (h * 31 + ord(ch)) & 0xFFFFFFFF
    return h % len(PERSON_COLORS)


def person_color(comment: dict[str, Any]) -> tuple[float, float, float, float]:
    author = comment.get("author") or {}
    r, g, b = PERSON_COLORS[color_index(str(author.get("id") or ""))]
    return (r, g, b, RESOLVED_ALPHA if comment.get("resolved_at") else 1.0)


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


def octahedron(center: tuple[float, float, float], r: float) -> list[tuple[float, float, float]]:
    """Eight triangles around the point, as a flat vertex list for a TRIS batch."""
    x, y, z = center
    top, bottom = (x, y, z + r), (x, y, z - r)
    ring = [(x + r, y, z), (x, y + r, z), (x - r, y, z), (x, y - r, z)]
    out: list[tuple[float, float, float]] = []
    for i in range(4):
        a, b = ring[i], ring[(i + 1) % 4]
        out += [top, a, b]
        out += [bottom, b, a]
    return out


def comments_for_open_part() -> list[dict[str, Any]]:
    part = STATE.part
    if part is None:
        return []
    return STATE.comments.get(part["id"], [])


def _draw() -> None:  # pragma: no cover - needs a viewport
    comments = comments_for_open_part()
    if not comments:
        return
    shader = gpu.shader.from_builtin("UNIFORM_COLOR")
    gpu.state.blend_set("ALPHA")
    # Depth test on: geometry in front hides the pin, as it does in the app's viewer.
    gpu.state.depth_test_set("LESS_EQUAL")
    gpu.state.depth_mask_set(False)
    for c in comments:
        point = tuple(float(v) for v in c["point"])
        batch = batch_for_shader(shader, "TRIS", {"pos": octahedron(point, PIN_RADIUS_M)})
        shader.uniform_float("color", person_color(c))
        batch.draw(shader)
    gpu.state.depth_test_set("NONE")
    gpu.state.blend_set("NONE")


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
    _handle = bpy.types.SpaceView3D.draw_handler_add(_draw, (), "WINDOW", "POST_VIEW")


def unregister() -> None:
    global _handle
    if bpy is None or _handle is None:
        return
    bpy.types.SpaceView3D.draw_handler_remove(_handle, "WINDOW")
    _handle = None

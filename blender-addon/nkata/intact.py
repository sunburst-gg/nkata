"""Did the export keep what the scene has? (docs/tasks/v8-17-export-intact.md)

Reads the GLB the save wrote with the standard library: a 12 byte header, then a JSON chunk.
https://registry.khronos.org/glTF/specs/2.0/glTF-2.0.html#glb-file-format-specification
Pure, no bpy: the save hook gathers the scene side and hands it here.

What can be lost on the way out, and why it matters in the engine:
- a texture a material uses: Blender's glTF exporter takes only images wired into the Principled
  BSDF (https://docs.blender.org/manual/en/latest/addons/import_export/scene_gltf2.html#materials);
- a texture file not on disk and not packed: the export runs without it;
- a material, a bone, an animation: the engine imports what the file holds and nothing else.
"""

from __future__ import annotations

import json
import struct
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

GLB_MAGIC = 0x46546C67  # "glTF"
CHUNK_JSON = 0x4E4F534A  # "JSON"


@dataclass(frozen=True)
class Side:
    """What one side holds: the scene as saved, or the export as written."""

    materials: frozenset[str] = frozenset()
    textures: frozenset[str] = frozenset()
    bones: tuple[str, ...] = ()
    animations: dict[str, float] = field(default_factory=dict)


@dataclass(frozen=True)
class MissingFile:
    """A texture a material uses whose file is neither on disk nor packed."""

    name: str
    path: str


class GlbError(ValueError):
    """The file is not a GLB this reader understands."""


def stem(name: str) -> str:
    """Image names compare without their extension and case: the exporter may drop either."""
    base = name.rsplit("/", 1)[-1]
    head, dot, tail = base.rpartition(".")
    return (head if dot and tail and len(tail) <= 4 else base).lower()


def read_glb(path: Path) -> Side:
    data = path.read_bytes()
    if len(data) < 20:
        raise GlbError(f"{path.name} is too short to be a GLB")
    magic, _version, _length = struct.unpack_from("<III", data, 0)
    if magic != GLB_MAGIC:
        raise GlbError(f"{path.name} is not a GLB")
    chunk_length, chunk_type = struct.unpack_from("<II", data, 12)
    if chunk_type != CHUNK_JSON:
        raise GlbError(f"{path.name} has no JSON chunk first")
    doc = json.loads(data[20 : 20 + chunk_length].decode("utf-8"))
    return side_of(doc)


def side_of(doc: dict[str, Any]) -> Side:
    nodes = doc.get("nodes") or []
    accessors = doc.get("accessors") or []
    bones: list[str] = []
    for skin in doc.get("skins") or []:
        for j in skin.get("joints") or []:
            name = str((nodes[j] if 0 <= j < len(nodes) else {}).get("name") or "")
            if name and name not in bones:
                bones.append(name)
    animations: dict[str, float] = {}
    for i, anim in enumerate(doc.get("animations") or []):
        starts: list[float] = []
        ends: list[float] = []
        for sampler in anim.get("samplers") or []:
            acc = accessors[sampler["input"]] if 0 <= sampler.get("input", -1) < len(accessors) else {}
            if acc.get("min") and acc.get("max"):
                starts.append(float(acc["min"][0]))
                ends.append(float(acc["max"][0]))
        name = str(anim.get("name") or f"Animation {i + 1}")
        animations[name] = round(max(ends) - min(starts), 4) if starts else 0.0
    return Side(
        materials=frozenset(str(m.get("name")) for m in doc.get("materials") or [] if m.get("name")),
        textures=frozenset(stem(str(im.get("name") or im.get("uri") or "")) for im in doc.get("images") or [] if im.get("name") or im.get("uri")),
        bones=tuple(bones),
        animations=animations,
    )


def _names(names: list[str]) -> str:
    shown = ", ".join(names[:3])
    return shown if len(names) <= 3 else f"{shown} and {len(names) - 3} more"


def losses(scene: Side, missing: list[MissingFile], export: Side) -> list[dict[str, Any]]:
    """What the scene has that the export does not, one entry per kind, in plain words."""
    out: list[dict[str, Any]] = []
    for m in missing:
        out.append({"kind": "texture_file", "names": [m.name], "sentence": f"{m.name} is not on disk: {m.path}. Find it or pack it."})
    lost_files = {stem(m.name) for m in missing}
    textures = sorted(t for t in scene.textures - export.textures if t not in lost_files)
    if textures:
        out.append({"kind": "texture", "names": textures, "sentence": f"Not in the export: {_names(textures)}. Wire them into the Principled BSDF."})
    materials = sorted(scene.materials - export.materials)
    if materials:
        out.append({"kind": "material", "names": materials, "sentence": f"Materials not in the export: {_names(materials)}."})
    bones = [b for b in scene.bones if b not in set(export.bones)]
    if bones:
        out.append({"kind": "bone", "names": bones, "sentence": f"Bones not in the export: {_names(bones)}."})
    animations = sorted(set(scene.animations) - set(export.animations))
    if animations:
        out.append({"kind": "animation", "names": animations, "sentence": f"Animations not in the export: {_names(animations)}."})
    return out


def bones_gone(previous: list[str] | None, now: tuple[str, ...]) -> list[str]:
    """Bones the last save had that this one does not. The engine's skeleton is built from the
    names: a removed or renamed bone breaks every animation made for it."""
    if not previous:
        return []
    have = set(now)
    return [b for b in previous if b not in have]


def check(scene: Side, missing: list[MissingFile], export: Side, previous_bones: list[str] | None) -> dict[str, Any]:
    """The manifest's export field (shared schema ExportCheck)."""
    lost = losses(scene, missing, export)
    out: dict[str, Any] = {"intact": not lost, "losses": lost}
    gone = bones_gone(previous_bones, scene.bones)
    if gone:
        out["bones_changed"] = gone
    return out


def lines(result: dict[str, Any] | None) -> list[str]:
    """What the panel says under the four checks: one line per loss, or that all arrived."""
    if result is None:
        return []
    out = [str(loss["sentence"]) for loss in result.get("losses") or []]
    gone = result.get("bones_changed") or []
    if gone:
        out.append(f"Bones gone since the last save: {_names(list(gone))}.")
    return out or ["Export intact."]

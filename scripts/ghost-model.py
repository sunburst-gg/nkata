"""Writes the ghost model the bare screens show behind their card (desktop/src/ui/stage/GhostStage.tsx)
from a glTF binary: the same geometry with every image, texture and sampler dropped. The viewer
draws the ghost as an amber wireframe, so the textures were never seen, and they were 9 MB of
the Lantern's 9.1 MB. The sample models are fetched at dev time only, so release builds had no
ghost at all (docs/decisions.md, 2026-10-28).

GLB layout: https://registry.khronos.org/glTF/specs/2.0/glTF-2.0.html#glb-file-format-specification
Usage: python3 scripts/ghost-model.py desktop/public/fixtures/glb/Lantern.glb desktop/public/models/Ghost.glb
"""

from __future__ import annotations

import json
import struct
import sys
from pathlib import Path

GLB_MAGIC = 0x46546C67
CHUNK_JSON = 0x4E4F534A
CHUNK_BIN = 0x004E4942


def read_glb(data: bytes) -> tuple[dict, bytes]:
    magic, version, _length = struct.unpack_from("<III", data, 0)
    if magic != GLB_MAGIC or version != 2:
        raise ValueError("not a glTF 2.0 binary")
    offset, doc, binary = 12, None, b""
    while offset < len(data):
        size, kind = struct.unpack_from("<II", data, offset)
        body = data[offset + 8 : offset + 8 + size]
        if kind == CHUNK_JSON:
            doc = json.loads(body)
        elif kind == CHUNK_BIN:
            binary = body
        offset += 8 + size
    if doc is None:
        raise ValueError("no JSON chunk")
    return doc, binary


def pad(b: bytes, fill: bytes) -> bytes:
    return b + fill * ((4 - len(b) % 4) % 4)


def geometry_only(doc: dict, binary: bytes) -> tuple[dict, bytes]:
    """Keeps the buffer views the accessors use, repacked in order; drops the rest."""
    used = sorted({a["bufferView"] for a in doc.get("accessors", []) if "bufferView" in a})
    remap: dict[int, int] = {}
    views: list[dict] = []
    out = b""
    for old in used:
        view = dict(doc["bufferViews"][old])
        start = view.get("byteOffset", 0)
        chunk = binary[start : start + view["byteLength"]]
        out = pad(out, b"\x00")
        view["byteOffset"] = len(out)
        view["buffer"] = 0
        remap[old] = len(views)
        views.append(view)
        out += chunk
    for accessor in doc.get("accessors", []):
        if "bufferView" in accessor:
            accessor["bufferView"] = remap[accessor["bufferView"]]
    doc["bufferViews"] = views
    doc["buffers"] = [{"byteLength": len(out)}]
    for key in ("images", "textures", "samplers"):
        doc.pop(key, None)
    for material in doc.get("materials", []):
        pbr = material.get("pbrMetallicRoughness", {})
        for key in ("baseColorTexture", "metallicRoughnessTexture"):
            pbr.pop(key, None)
        for key in ("normalTexture", "occlusionTexture", "emissiveTexture"):
            material.pop(key, None)
    return doc, out


def write_glb(doc: dict, binary: bytes) -> bytes:
    body = pad(json.dumps(doc, separators=(",", ":")).encode(), b" ")
    binary = pad(binary, b"\x00")
    total = 12 + 8 + len(body) + 8 + len(binary)
    return (
        struct.pack("<III", GLB_MAGIC, 2, total)
        + struct.pack("<II", len(body), CHUNK_JSON)
        + body
        + struct.pack("<II", len(binary), CHUNK_BIN)
        + binary
    )


def main(src: str, dst: str) -> None:
    doc, binary = read_glb(Path(src).read_bytes())
    doc, binary = geometry_only(doc, binary)
    Path(dst).write_bytes(write_glb(doc, binary))
    print(f"{dst}: {Path(dst).stat().st_size:,} bytes, {len(doc.get('meshes', []))} meshes")


if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2])

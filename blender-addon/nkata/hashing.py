"""Per-object hash of mesh data, material slots, and transform. The save hook compares the hash
table with the last save; only a changed part exports. See docs/engineering.md, The mirror, step 2.

Pure functions over bytes and plain lists so they run without bpy."""

from __future__ import annotations

import hashlib
import struct
from collections.abc import Iterable


def hash_object(vertices: bytes, loops: bytes, materials: Iterable[str], matrix: Iterable[float]) -> str:
    """vertices: packed float32 coordinates. loops: packed int32 loop vertex indices.
    materials: slot material names in order. matrix: 16 floats of the world matrix."""
    h = hashlib.blake2b(digest_size=32)
    h.update(b"v")
    h.update(vertices)
    h.update(b"l")
    h.update(loops)
    for name in materials:
        h.update(b"m")
        h.update(name.encode("utf-8"))
    h.update(b"t")
    h.update(struct.pack("<16f", *[round(float(x), 6) for x in matrix]))
    return h.hexdigest()


def hash_table_changed(before: dict[str, str] | None, after: dict[str, str]) -> bool:
    """True on the first save, on any object change, and on an object added or removed."""
    if before is None:
        return True
    return before != after

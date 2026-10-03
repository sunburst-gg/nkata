"""Builds the fixture corpus: one rigged character, three props, one level area.

Run: python3 fixtures/build.py [--out fixtures]. Plain Python, no dependency. Every byte is
deterministic, so a rebuild changes nothing when the recipe did not change. The corpus is
checked in; this script is the record of how it was made. See docs/engineering.md, Fixture corpus.

Each asset is a glTF 2.0 binary (.glb) plus manifest.json in the shape the Blender add-on writes
(shared ObjectManifest). The level area is JSON only: eight actors tagged nkata.area=square.

glTF 2.0: https://registry.khronos.org/glTF/specs/2.0/glTF-2.0.html
"""

from __future__ import annotations

import argparse
import hashlib
import json
import math
import struct
import zlib
from dataclasses import dataclass, field
from pathlib import Path

Vec3 = tuple[float, float, float]

GLB_MAGIC = 0x46546C67
CHUNK_JSON = 0x4E4F534A
CHUNK_BIN = 0x004E4942
FLOAT = 5126
USHORT = 5123
UBYTE = 5121
ARRAY_BUFFER = 34962
ELEMENT_ARRAY_BUFFER = 34963


@dataclass
class Mesh:
    name: str
    positions: list[Vec3]
    normals: list[Vec3]
    uvs: list[tuple[float, float]]
    indices: list[int]
    material: int
    joints: list[tuple[int, int, int, int]] = field(default_factory=list)
    weights: list[tuple[float, float, float, float]] = field(default_factory=list)

    @property
    def triangles(self) -> int:
        return len(self.indices) // 3

    def bounds(self) -> tuple[Vec3, Vec3]:
        xs, ys, zs = zip(*self.positions, strict=True)
        return (min(xs), min(ys), min(zs)), (max(xs), max(ys), max(zs))


def box(name: str, size: Vec3, base: Vec3, material: int, lod: int = 0) -> Mesh:
    """A box standing on `base` (its bottom centre), z up. lod 1 drops the top and bottom faces."""
    sx, sy, sz = size
    bx, by, bz = base
    x0, x1 = bx - sx / 2, bx + sx / 2
    y0, y1 = by - sy / 2, by + sy / 2
    z0, z1 = bz, bz + sz
    faces = [
        ((x0, y0, z0), (x1, y0, z0), (x1, y0, z1), (x0, y0, z1), (0.0, -1.0, 0.0)),
        ((x1, y1, z0), (x0, y1, z0), (x0, y1, z1), (x1, y1, z1), (0.0, 1.0, 0.0)),
        ((x0, y1, z0), (x0, y0, z0), (x0, y0, z1), (x0, y1, z1), (-1.0, 0.0, 0.0)),
        ((x1, y0, z0), (x1, y1, z0), (x1, y1, z1), (x1, y0, z1), (1.0, 0.0, 0.0)),
    ]
    if lod == 0:
        faces += [
            ((x0, y0, z1), (x1, y0, z1), (x1, y1, z1), (x0, y1, z1), (0.0, 0.0, 1.0)),
            ((x0, y1, z0), (x1, y1, z0), (x1, y0, z0), (x0, y0, z0), (0.0, 0.0, -1.0)),
        ]
    positions: list[Vec3] = []
    normals: list[Vec3] = []
    uvs: list[tuple[float, float]] = []
    indices: list[int] = []
    for a, b, c, d, n in faces:
        start = len(positions)
        positions += [a, b, c, d]
        normals += [n, n, n, n]
        uvs += [(0.0, 0.0), (1.0, 0.0), (1.0, 1.0), (0.0, 1.0)]
        indices += [start, start + 1, start + 2, start, start + 2, start + 3]
    return Mesh(name, positions, normals, uvs, indices, material)


def tube(name: str, radius: float, height: float, segments: int, material: int, bone_rows: int = 0) -> Mesh:
    """A closed tube standing on the origin, z up. With bone_rows, each ring is skinned to the
    bone of its height band so the character bends."""
    positions: list[Vec3] = []
    normals: list[Vec3] = []
    uvs: list[tuple[float, float]] = []
    indices: list[int] = []
    joints: list[tuple[int, int, int, int]] = []
    weights: list[tuple[float, float, float, float]] = []
    rows = max(2, bone_rows + 1 if bone_rows else 2)
    for r in range(rows):
        z = height * r / (rows - 1)
        for s in range(segments + 1):
            a = 2 * math.pi * s / segments
            positions.append((round(radius * math.cos(a), 6), round(radius * math.sin(a), 6), round(z, 6)))
            normals.append((round(math.cos(a), 6), round(math.sin(a), 6), 0.0))
            uvs.append((s / segments, r / (rows - 1)))
            if bone_rows:
                bone = min(r, bone_rows - 1)
                joints.append((bone, 0, 0, 0))
                weights.append((1.0, 0.0, 0.0, 0.0))
    for r in range(rows - 1):
        for s in range(segments):
            a = r * (segments + 1) + s
            b = a + segments + 1
            indices += [a, a + 1, b, a + 1, b + 1, b]
    return Mesh(name, positions, normals, uvs, indices, material, joints, weights)


def png_1024(seed: int) -> bytes:
    """A 1024 by 1024 RGB checker, zlib compressed, as a valid PNG. Deterministic."""
    size = 1024
    rows = bytearray()
    for y in range(size):
        rows.append(0)
        for x in range(size):
            on = ((x // 64) + (y // 64) + seed) % 2
            rows += bytes((200 if on else 40, 120 + 30 * (seed % 3), 60 if on else 180))

    def chunk(kind: bytes, data: bytes) -> bytes:
        return struct.pack(">I", len(data)) + kind + data + struct.pack(">I", zlib.crc32(kind + data) & 0xFFFFFFFF)

    ihdr = struct.pack(">IIBBBBB", size, size, 8, 2, 0, 0, 0)
    return b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", ihdr) + chunk(b"IDAT", zlib.compress(bytes(rows), 9)) + chunk(b"IEND", b"")


class GlbWriter:
    """Packs meshes, materials, one texture, and an optional skin into one .glb."""

    def __init__(self) -> None:
        self.buffer = bytearray()
        self.views: list[dict] = []
        self.accessors: list[dict] = []
        self.gltf: dict = {
            "asset": {"version": "2.0", "generator": "nkata fixtures/build.py"},
            "scene": 0,
            "scenes": [{"nodes": []}],
            "nodes": [],
            "meshes": [],
            "materials": [],
            "accessors": self.accessors,
            "bufferViews": self.views,
            "buffers": [],
        }

    def _view(self, data: bytes, target: int | None) -> int:
        while len(self.buffer) % 4:
            self.buffer.append(0)
        view = {"buffer": 0, "byteOffset": len(self.buffer), "byteLength": len(data)}
        if target is not None:
            view["target"] = target
        self.buffer += data
        self.views.append(view)
        return len(self.views) - 1

    def _accessor(self, data: bytes, component: int, kind: str, count: int, target: int | None, bounds: tuple | None = None) -> int:
        acc = {"bufferView": self._view(data, target), "componentType": component, "count": count, "type": kind}
        if bounds is not None:
            acc["min"], acc["max"] = list(bounds[0]), list(bounds[1])
        self.accessors.append(acc)
        return len(self.accessors) - 1

    def material(self, name: str, color: tuple[float, float, float], texture: bool = False) -> int:
        m = {"name": name, "pbrMetallicRoughness": {"baseColorFactor": [*color, 1.0], "metallicFactor": 0.0, "roughnessFactor": 0.8}}
        if texture:
            m["pbrMetallicRoughness"]["baseColorTexture"] = {"index": 0}
        self.gltf["materials"].append(m)
        return len(self.gltf["materials"]) - 1

    def texture(self, name: str, png: bytes) -> None:
        view = self._view(png, None)
        self.gltf["images"] = [{"name": name, "mimeType": "image/png", "bufferView": view}]
        self.gltf["samplers"] = [{"magFilter": 9729, "minFilter": 9987}]
        self.gltf["textures"] = [{"sampler": 0, "source": 0}]

    def mesh(self, mesh: Mesh, skin: int | None = None, parent: int | None = None) -> int:
        lo, hi = mesh.bounds()
        pos = self._accessor(b"".join(struct.pack("<3f", *p) for p in mesh.positions), FLOAT, "VEC3", len(mesh.positions), ARRAY_BUFFER, (lo, hi))
        nor = self._accessor(b"".join(struct.pack("<3f", *n) for n in mesh.normals), FLOAT, "VEC3", len(mesh.normals), ARRAY_BUFFER)
        uv = self._accessor(b"".join(struct.pack("<2f", *t) for t in mesh.uvs), FLOAT, "VEC2", len(mesh.uvs), ARRAY_BUFFER)
        idx = self._accessor(b"".join(struct.pack("<H", i) for i in mesh.indices), USHORT, "SCALAR", len(mesh.indices), ELEMENT_ARRAY_BUFFER)
        attributes = {"POSITION": pos, "NORMAL": nor, "TEXCOORD_0": uv}
        if mesh.joints:
            attributes["JOINTS_0"] = self._accessor(b"".join(struct.pack("<4B", *j) for j in mesh.joints), UBYTE, "VEC4", len(mesh.joints), ARRAY_BUFFER)
            attributes["WEIGHTS_0"] = self._accessor(b"".join(struct.pack("<4f", *w) for w in mesh.weights), FLOAT, "VEC4", len(mesh.weights), ARRAY_BUFFER)
        self.gltf["meshes"].append({"name": mesh.name, "primitives": [{"attributes": attributes, "indices": idx, "material": mesh.material}]})
        node = {"name": mesh.name, "mesh": len(self.gltf["meshes"]) - 1}
        if skin is not None:
            node["skin"] = skin
        self.gltf["nodes"].append(node)
        index = len(self.gltf["nodes"]) - 1
        if parent is None:
            self.gltf["scenes"][0]["nodes"].append(index)
        else:
            self.gltf["nodes"][parent].setdefault("children", []).append(index)
        return index

    def skin(self, name: str, bone_names: list[str], spacing: float) -> int:
        """A straight chain of bones up the z axis. Returns the skin index; the root node is
        added to the scene as the armature."""
        first = len(self.gltf["nodes"])
        for i, bone in enumerate(bone_names):
            node = {"name": bone, "translation": [0.0, 0.0, spacing if i else 0.0]}
            if i + 1 < len(bone_names):
                node["children"] = [first + i + 1]
            self.gltf["nodes"].append(node)
        self.gltf["scenes"][0]["nodes"].append(first)
        inverse = b""
        for i in range(len(bone_names)):
            z = -spacing * i
            inverse += struct.pack("<16f", 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, z, 1)
        ibm = self._accessor(inverse, FLOAT, "MAT4", len(bone_names), None)
        self.gltf.setdefault("skins", []).append({"name": name, "skeleton": first, "joints": list(range(first, first + len(bone_names))), "inverseBindMatrices": ibm})
        return len(self.gltf["skins"]) - 1

    def write(self, path: Path) -> bytes:
        self.gltf["buffers"] = [{"byteLength": len(self.buffer)}]
        body = json.dumps(self.gltf, sort_keys=True, separators=(",", ":")).encode()
        while len(body) % 4:
            body += b" "
        bin_data = bytes(self.buffer)
        while len(bin_data) % 4:
            bin_data += b"\0"
        total = 12 + 8 + len(body) + 8 + len(bin_data)
        out = struct.pack("<III", GLB_MAGIC, 2, total)
        out += struct.pack("<II", len(body), CHUNK_JSON) + body
        out += struct.pack("<II", len(bin_data), CHUNK_BIN) + bin_data
        path.write_bytes(out)
        return out


def object_hash(mesh: Mesh, materials: list[str]) -> str:
    h = hashlib.blake2b(digest_size=32)
    h.update(b"".join(struct.pack("<3f", *p) for p in mesh.positions))
    h.update(b"".join(struct.pack("<H", i) for i in mesh.indices))
    for m in materials:
        h.update(m.encode())
    return h.hexdigest()


def manifest(kind: str, meshes: list[Mesh], material_names: list[str], armature: str | None, bone_count: int | None, target: str) -> dict:
    objects = []
    for m in meshes:
        lo, hi = m.bounds()
        mats = [material_names[m.material]]
        # Every object stands on its own origin, as a prop must (pivot_at_base).
        objects.append({"name": m.name, "triangles": m.triangles, "materials": mats, "bounds_min": list(lo), "bounds_max": list(hi), "hash": object_hash(m, mats), "origin": [0.0, 0.0, lo[2]], "scale": [1.0, 1.0, 1.0]})
    return {"v": 1, "kind": kind, "objects": objects, "bone_count": bone_count, "armature": armature, "mirror_target": target}


def write_json(path: Path, data: dict) -> None:
    path.write_text(json.dumps(data, indent=2, sort_keys=True) + "\n", encoding="utf-8")


BONES = ["root", "pelvis", "spine_01", "spine_02", "spine_03", "neck", "head", "clavicle_l", "upperarm_l", "lowerarm_l", "hand_l", "clavicle_r", "upperarm_r", "lowerarm_r", "hand_r", "thigh_l", "calf_l", "foot_l", "thigh_r", "calf_r"]


def build_character(out: Path) -> None:
    folder = out / "character"
    folder.mkdir(parents=True, exist_ok=True)
    w = GlbWriter()
    w.texture("T_Ojukwu_D", png_1024(1))
    skin_mat = w.material("M_Skin", (0.55, 0.35, 0.25), texture=True)
    cloth_mat = w.material("M_Cloth", (0.2, 0.3, 0.6))
    skin = w.skin("Armature", BONES, 1.8 / (len(BONES) - 1))
    body = tube("SK_Ojukwu_Body", 0.25, 1.8, 24, skin_mat, bone_rows=len(BONES))
    cloth = tube("SK_Ojukwu_Cloth", 0.28, 0.9, 24, cloth_mat, bone_rows=len(BONES))
    w.mesh(body, skin=skin)
    w.mesh(cloth, skin=skin)
    w.write(folder / "ojukwu.glb")
    (folder / "T_Ojukwu_D.png").write_bytes(png_1024(1))
    write_json(folder / "manifest.json", manifest("character", [body, cloth], ["M_Skin", "M_Cloth"], "Armature", len(BONES), "/Game/Characters/Ojukwu/body"))
    write_json(folder / "skeleton.json", {"name": "SK_Human", "bones": BONES})


PROPS = {
    "kettle": ("Kettle", [(0.3, 0.3, 0.25), (0.08, 0.08, 0.12)], (0.35, 0.3, 0.25)),
    "wooden_stool": ("Wooden stool", [(0.4, 0.4, 0.05), (0.05, 0.05, 0.4)], (0.7, 0.5, 0.3)),
    "market_stall": ("Market stall", [(2.0, 1.0, 0.1), (0.1, 0.1, 2.2)], (0.6, 0.4, 0.2)),
}


def build_prop(out: Path, slug: str, name: str, parts: list[Vec3], color: tuple[float, float, float], seed: int) -> None:
    folder = out / "props" / slug
    folder.mkdir(parents=True, exist_ok=True)
    w = GlbWriter()
    w.texture(f"T_{slug}_D", png_1024(seed))
    mat = w.material(f"MI_{slug}", color, texture=True)
    base_size, top_size = parts
    short = "".join(p[0].upper() for p in name.split())
    lod0 = [box(f"SM_{short}_LOD0", base_size, (0.0, 0.0, 0.0), mat), box(f"SM_{short}_Top_LOD0", top_size, (0.0, 0.0, base_size[2]), mat)]
    lod1 = [box(f"SM_{short}_LOD1", base_size, (0.0, 0.0, 0.0), mat, lod=1)]
    for m in lod0 + lod1:
        w.mesh(m)
    w.write(folder / f"{slug}.glb")
    (folder / f"T_{slug}_D.png").write_bytes(png_1024(seed))
    write_json(folder / "manifest.json", manifest("prop", lod0, [f"MI_{slug}"], None, None, f"/Game/Props/{name.replace(' ', '')}"))
    write_json(folder / "collision.json", {"kind": "box", "center": [0.0, 0.0, (base_size[2] + top_size[2]) / 2], "extent": [max(base_size[0], top_size[0]) / 2, max(base_size[1], top_size[1]) / 2, (base_size[2] + top_size[2]) / 2]})


def build_level_area(out: Path) -> None:
    folder = out / "level_area"
    folder.mkdir(parents=True, exist_ok=True)
    actors = []
    meshes = ["/Game/Props/Kettle", "/Game/Props/WoodenStool", "/Game/Props/MarketStall", "/Game/Props/MarketStall"]
    for i in range(8):
        actors.append({
            "name": f"SM_Square_{i:02d}",
            "class": "StaticMeshActor",
            "mesh": meshes[i % len(meshes)],
            "location": [round(2.5 * (i % 4), 2), round(3.0 * (i // 4), 2), 0.0],
            "rotation": [0.0, 0.0, 45.0 * i],
            "scale": [1.0, 1.0, 1.0],
            "tags": ["nkata.area=square"],
        })
    write_json(folder / "square.json", {"v": 1, "level": "Enugu Market", "area": "square", "tag": "nkata.area=square", "actors": actors})


def build(out: Path) -> None:
    build_character(out)
    for seed, (slug, (name, parts, color)) in enumerate(PROPS.items(), start=2):
        build_prop(out, slug, name, parts, color, seed)
    build_level_area(out)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--out", type=Path, default=Path(__file__).resolve().parent)
    args = parser.parse_args()
    build(args.out)
    print(f"fixtures written to {args.out}")


if __name__ == "__main__":
    main()

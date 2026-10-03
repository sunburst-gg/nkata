"""A small bpy stand-in so the add-on modules import and the save flow runs in plain Python.
Only what the tests touch is modelled."""

from __future__ import annotations

import sys
import types
from typing import Any


class FakeVec:
    def __init__(self, *xyz: float) -> None:
        self.xyz = xyz

    def __iter__(self) -> Any:
        return iter(self.xyz)

    def __getitem__(self, i: int) -> float:
        return self.xyz[i]


class FakeAttr:
    """mesh.vertices / mesh.loops with foreach_get over a flat list."""

    def __init__(self, flat: list[float] | list[int], per_item: int) -> None:
        self.flat = flat
        self.per_item = per_item

    def __len__(self) -> int:
        return len(self.flat) // self.per_item

    def foreach_get(self, _attr: str, out: Any) -> None:
        for i, v in enumerate(self.flat):
            out[i] = v


class FakePolygon:
    def __init__(self, n: int) -> None:
        self.vertices = list(range(n))


class FakeMesh:
    def __init__(self, coords: list[float], loop_indices: list[int], polygon_sizes: list[int], uv_layers: tuple[str, ...] = ("UVMap",)) -> None:
        self.uv_layers = [types.SimpleNamespace(name=n) for n in uv_layers]
        self.vertices = FakeAttr(coords, 3)
        self.loops = FakeAttr(loop_indices, 1)
        self.polygons = [FakePolygon(n) for n in polygon_sizes]


class FakeSlot:
    def __init__(self, name: str | None) -> None:
        self.material = types.SimpleNamespace(name=name) if name else None


class FakeObject:
    def __init__(
        self,
        name: str,
        kind: str = "MESH",
        coords: list[float] | None = None,
        materials: list[str] | None = None,
        bones: int = 0,
        location: tuple[float, float, float] = (0.0, 0.0, 0.0),
        scale: tuple[float, float, float] = (1.0, 1.0, 1.0),
    ) -> None:
        self.name = name
        self.type = kind
        coords = coords if coords is not None else [0.0, 0.0, 0.0, 1.0, 0.0, 0.0, 0.0, 1.0, 0.0]
        self.data = FakeMesh(coords, [0, 1, 2], [3]) if kind == "MESH" else types.SimpleNamespace(bones=[types.SimpleNamespace(name=f"bone_{i}") for i in range(bones)])
        self.material_slots = [FakeSlot(m) for m in (materials or [])]
        self.scale = scale
        self.matrix_world = [[scale[0], 0.0, 0.0, location[0]], [0.0, scale[1], 0.0, location[1]], [0.0, 0.0, scale[2], location[2]], [0.0, 0.0, 0.0, 1.0]]
        n = len(coords) // 3
        pts = [(coords[i * 3], coords[i * 3 + 1], coords[i * 3 + 2]) for i in range(n)]
        self.bound_box = [FakeVec(*p) for p in pts] if pts else []


class FakeExporterProps:
    filepath = ""

    class bl_rna:  # noqa: N801 - mirrors bpy naming
        identifier = "IO_FH_gltf2"


class FakeExporter:
    def __init__(self) -> None:
        self.name = "glTF 2.0"
        self.export_properties = FakeExporterProps()


class FakeCollection:
    def __init__(self, name: str, objects: list[FakeObject], exporters: list[FakeExporter] | None = None) -> None:
        self.name = name
        self.all_objects = objects
        self.exporters = exporters or []


class FakeOps:
    """Records operator calls and writes a file where the exporter would."""

    def __init__(self) -> None:
        self.calls: list[tuple[str, dict[str, Any]]] = []
        self.pending_path: str | None = None

    def _write(self, path: str) -> None:
        with open(path, "wb") as f:
            f.write(b"glTF")


def install(collections: dict[str, FakeCollection], filepath: str) -> types.ModuleType:
    """Creates the bpy module once and updates it in place after, so modules that already
    imported bpy see the new data."""
    existing = sys.modules.get("bpy")
    bpy = existing if existing is not None and getattr(existing, "_nkata_stub", False) else types.ModuleType("bpy")
    bpy._nkata_stub = True
    ops = FakeOps()

    class CollectionOps:
        @staticmethod
        def exporter_export(index: int = 0) -> set[str]:
            col = bpy.context._override.get("collection")
            path = col.exporters[index].export_properties.filepath
            ops.calls.append(("collection.exporter_export", {"index": index, "filepath": path}))
            ops._write(path)
            return {"FINISHED"}

    class ExportSceneOps:
        @staticmethod
        def gltf(**kwargs: Any) -> set[str]:
            ops.calls.append(("export_scene.gltf", kwargs))
            ops._write(kwargs["filepath"])
            return {"FINISHED"}

    class Context:
        _override: dict[str, Any] = {}
        scene = types.SimpleNamespace(unit_settings=types.SimpleNamespace(scale_length=1.0))

        class view_layer:  # noqa: N801
            active_layer_collection = None

            class layer_collection:  # noqa: N801
                collection = types.SimpleNamespace(name="Scene Collection")
                children: list[Any] = []

        @staticmethod
        def temp_override(**kwargs: Any) -> Any:
            class _Ctx:
                def __enter__(self) -> None:
                    Context._override = kwargs

                def __exit__(self, *_a: Any) -> None:
                    Context._override = {}

            return _Ctx()

    bpy.ops = types.SimpleNamespace(collection=CollectionOps, export_scene=ExportSceneOps)
    bpy.context = Context
    bpy.data = types.SimpleNamespace(collections=collections, filepath=filepath, images=[types.SimpleNamespace(name="T_Face_D", size=(2048, 2048))])
    bpy.app = types.SimpleNamespace(handlers=types.SimpleNamespace(save_post=[]), timers=types.SimpleNamespace(is_registered=lambda _f: False, register=lambda *_a, **_k: None, unregister=lambda _f: None))
    bpy.types = types.SimpleNamespace(Operator=object, Panel=object, Context=object)
    bpy.utils = types.SimpleNamespace(register_class=lambda _c: None, unregister_class=lambda _c: None)
    bpy._ops = ops
    sys.modules["bpy"] = bpy
    handlers = types.ModuleType("bpy.app.handlers")
    handlers.persistent = lambda f: f
    sys.modules["bpy.app"] = bpy.app
    sys.modules["bpy.app.handlers"] = handlers
    return bpy

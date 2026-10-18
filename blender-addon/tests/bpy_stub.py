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

    def foreach_set(self, _attr: str, values: Any) -> None:
        for i in range(len(self.flat)):
            self.flat[i] = values[i]


class FakePolygon:
    def __init__(self, n: int) -> None:
        self.vertices = list(range(n))


class FakeMesh:
    def __init__(self, coords: list[float], loop_indices: list[int], polygon_sizes: list[int], uv_layers: tuple[str, ...] = ("UVMap",)) -> None:
        self.uv_layers = [types.SimpleNamespace(name=n) for n in uv_layers]
        self.vertices = FakeAttr(coords, 3)
        self.loops = FakeAttr(loop_indices, 1)
        self.polygons = [FakePolygon(n) for n in polygon_sizes]

    def update(self) -> None:
        return


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


class FakeCollections(dict):
    """bpy.data.collections: looked up by the collection's current name, as Blender does after a
    rename, with new()."""

    def get(self, name: str, default: Any = None) -> Any:
        for col in self.values():
            if col.name == name:
                return col
        return default

    def new(self, name: str) -> FakeCollection:
        col = FakeCollection(name, [])
        self[name] = col
        return col


class FakeOps:
    reports: list[str] = []
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

        @staticmethod
        def fbx(**kwargs: Any) -> set[str]:
            ops.calls.append(("export_scene.fbx", kwargs))
            ops._write(kwargs["filepath"])
            return {"FINISHED"}

    class RenderOps:
        @staticmethod
        def opengl(write_still: bool = False, view_context: bool = True) -> set[str]:
            path = bpy.context.scene.render.filepath
            ops.calls.append(("render.opengl", {"write_still": write_still, "filepath": path}))
            if write_still:
                with open(path, "wb") as f:
                    f.write(b"\x89PNG")
            return {"FINISHED"}

        @staticmethod
        def render(write_still: bool = False) -> set[str]:
            r = bpy.context.scene.render
            ops.calls.append(("render.render", {"write_still": write_still, "filepath": r.filepath, "size": (r.resolution_x, r.resolution_y), "engine": r.engine}))
            if write_still:
                with open(r.filepath, "wb") as f:
                    f.write(b"\x89PNG")
            return {"FINISHED"}

    class WmOps:
        @staticmethod
        def save_as_mainfile(filepath: str) -> set[str]:
            ops.calls.append(("wm.save_as_mainfile", {"filepath": filepath}))
            with open(filepath, "wb") as f:
                f.write(b"BLENDER")
            bpy.data.filepath = filepath
            for handler in list(bpy.app.handlers.save_post):
                handler(None)
            return {"FINISHED"}

        @staticmethod
        def open_mainfile(filepath: str) -> set[str]:
            ops.calls.append(("wm.open_mainfile", {"filepath": filepath}))
            bpy.data.filepath = filepath
            for handler in list(bpy.app.handlers.load_post):
                handler(None)
            return {"FINISHED"}

    class FileOps:
        @staticmethod
        def pack_all() -> set[str]:
            ops.calls.append(("file.pack_all", {}))
            for img in bpy.data.images:
                img.packed_file = True
            return {"FINISHED"}

        @staticmethod
        def make_paths_absolute() -> set[str]:
            ops.calls.append(("file.make_paths_absolute", {}))
            return {"FINISHED"}

    class ObjectOps:
        """bpy.ops.object.mode_set: records the call and sets the context mode."""

        @staticmethod
        def mode_set(mode: str = "OBJECT") -> set[str]:
            ops.calls.append(("object.mode_set", {"mode": mode}))
            Context.mode = "OBJECT" if mode == "OBJECT" else "EDIT_MESH"
            return {"FINISHED"}

    class Context:
        _override: dict[str, Any] = {}
        mode = "OBJECT"
        scene = types.SimpleNamespace(unit_settings=types.SimpleNamespace(scale_length=1.0))

        class view_layer:  # noqa: N801
            active_layer_collection = None

            @staticmethod
            def update() -> None:
                return

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

    bpy.ops = types.SimpleNamespace(collection=CollectionOps, export_scene=ExportSceneOps, wm=WmOps, render=RenderOps, object=ObjectOps, file=FileOps)
    Context.scene.render = types.SimpleNamespace(filepath="", image_settings=types.SimpleNamespace(file_format="PNG"), resolution_x=1920, resolution_y=1080, resolution_percentage=100, engine="CYCLES")
    Context.scene.camera = None
    Context.scene.eevee = types.SimpleNamespace(taa_render_samples=64)
    bpy.context = Context
    linked: list[Any] = []
    scene_objects: list[Any] = []
    Context.scene.collection = types.SimpleNamespace(children=types.SimpleNamespace(link=linked.append, linked=linked), objects=types.SimpleNamespace(link=scene_objects.append, linked=scene_objects))
    bpy.data = types.SimpleNamespace(
        collections=FakeCollections(collections), filepath=filepath,
        images=[types.SimpleNamespace(name="T_Face_D", size=(2048, 2048), filepath="", packed_file=None)],
        cameras=types.SimpleNamespace(new=lambda name: types.SimpleNamespace(name=name)),
        objects=types.SimpleNamespace(new=lambda name, data: types.SimpleNamespace(name=name, data=data, location=(0, 0, 0), rotation_euler=(0, 0, 0)), remove=lambda _o: None),
    )
    bpy.path = types.SimpleNamespace(abspath=lambda p: p)
    bpy.app = types.SimpleNamespace(handlers=types.SimpleNamespace(save_post=[], load_post=[], depsgraph_update_post=[]), timers=types.SimpleNamespace(is_registered=lambda _f: False, register=lambda *_a, **_k: None, unregister=lambda _f: None))
    Context.scene.cursor = types.SimpleNamespace(location=(0.5, 0.25, 0.0))

    class Operator:
        def report(self, _kind: set[str], message: str) -> None:
            FakeOps.reports.append(message)

    bpy.types = types.SimpleNamespace(Operator=Operator, Panel=object, Context=object, SpaceView3D=None, WindowManager=types.SimpleNamespace(), RenderSettings=None)
    Context.window_manager = types.SimpleNamespace(nkata_note="", nkata_note_engineering="", nkata_details_open=False)
    bpy.props = types.SimpleNamespace(StringProperty=lambda **_k: "", BoolProperty=lambda **_k: False, IntProperty=lambda **_k: 0)
    bpy.utils = types.SimpleNamespace(register_class=lambda _c: None, unregister_class=lambda _c: None)
    bpy._ops = ops
    sys.modules["bpy"] = bpy
    handlers = types.ModuleType("bpy.app.handlers")
    handlers.persistent = lambda f: f
    sys.modules["bpy.app"] = bpy.app
    sys.modules["bpy.app.handlers"] = handlers
    return bpy

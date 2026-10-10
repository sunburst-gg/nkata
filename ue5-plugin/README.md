# Nkata UE5 plugin

Python Editor Script Plugin plus an Editor Utility Widget. Import in place, panel, review, pins, reference scan.

## scripts/

Snippets the agent runs through the Remote Control API (`PUT /remote/object/call` on the Python script library, `ExecuteFile` mode). Each takes one argument, the path of a JSON args file, and prints one line `NKATA_RESULT {...}` last. The agent reads that line from the log output.

- `import_character.py`: import or reimport a character part as a skeletal mesh, in place. Reimport keeps skeleton, physics asset, and materials, and fails when either link changes.
- `import_static.py`: import or reimport a prop part as a static mesh, in place. Nanite, LOD group, and collision set once on first import. Reimport keeps material instances and collision, and fails when the referencer count drops.
- `scan_refs.py`: the levels that place a static mesh and the actor count per level. The agent stores it on the version.
- `checks.py`: the checks UE5 owns on Publish: LOD count, collision, MetaHuman DNA, triangle budget, names.
- `inspect_asset.py`: what the mirror must keep on an asset, for the e2e scripts.
- `refresh.py`: rescan a content path and sync the Content Browser.

The desktop app installs the plugin: it copies this folder to `<project>/Plugins/Nkata`, enables Nkata, PythonScriptPlugin, and RemoteControl in the .uproject (`Nkata.uplugin` lists the two as dependencies), and sets `WebControl.EnableServerOnStartup=1` in `Config/DefaultEngine.ini` so Remote Control listens on `localhost:30010` whenever the project is open. `Content/Python/init_unreal.py` runs at editor start and puts `scripts/` on the Python path, so the widget can `import panel`. Keep the Unreal project inside the Nkata project folder: the panel finds the agent token by walking up from the project folder. `make ue UE_PROJECT=...` symlinks the folder for development.

- `draw_pins.py`: comment pins as debug spheres on every placed copy, and `frame` to look at one. The C++ viewport module replaces it later.
- `panel.py`: the panel model. Not run by the agent: the Editor Utility Widget imports it.

## The panel

`scripts/panel.py` is the whole panel except the pixels. It talks to the agent on `localhost:7420` with the token from `<project>/.nkata-agent/token`, holds the open part, and returns the seven elements as rows (`PanelView.to_dict()`), in the order and the words of the Blender N-panel: header, mirror, reference, checks, comments, Publish and Mark Ready, presence. For an art director on a Ready part it adds Review: Approve and Send back. For a level area it adds the areas with their owners and locks.

Build the Editor Utility Widget once, in the editor, as `Content/Nkata/EUW_Nkata`:

1. Editor Utility Widget with a vertical box. On Construct, run a Python command that imports `panel` from this folder and keeps one `Panel` in a module global: `nkata_panel = panel.Panel.connect(unreal.Paths.project_dir())`.
2. A Text block per element and a List View for the lists. Every 500 ms the widget runs `nkata_panel.view().to_dict()` and fills the texts from `header.text`, `mirror.text`, and the rows. A row's `action` names the Python call its button makes: `open_reference`, `frame_pin` (runs `draw_pins.py` with `action: "frame"`), `reply`, `publish` (arg is ready: `"true"` or `"false"`), `review` (arg is `approve` or `send_back`), `open_area`.
3. A combo box of parts from `nkata_panel.agent.parts()`; choosing one calls `nkata_panel.open(part_id)`, which takes the lock and shows the holder when someone else has it.
4. Events: a Python thread on the agent's `GET /events` SSE stream (same frames the Blender add-on reads) hands each event to `nkata_panel.apply_event(event)`.
5. No file paths, no engineering words. Everything the widget shows comes from `panel.py`, which `ue5-plugin/tests/test_panel.py` covers with a fake agent.

The widget asset is built in the editor and checked in as `Content/Nkata/EUW_Nkata.uasset`; it holds no logic.

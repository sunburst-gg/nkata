# Step 6: Models in the viewer, walk a level area, what changed

Started Oct 11, 2026. Builds on the v3 desktop (handoff/v3) and the render pipeline from step 5.

Work on main. Push after every green `make test`. Open a PR only if you are blocked or the gate fails.

Read CLAUDE.md, docs/product.md (Viewer, Reviewer), docs/engineering.md (The mirror, step 2; Storage), desktop/DECISIONS.md (v3), and docs/decisions.md first.

## Why

A viewer and a reviewer see every asset in 3D without Blender or Unreal. Today the viewer shows a bundled sample: the GLB the add-on exports per version never reaches the server. A level area has no model at all, so nobody can walk it outside Unreal. And a review compares v3 against a memory of v2. Ten artists on one project need to see what a colleague changed, not guess.

## Gate

1. A Blender save of a character or prop part puts its GLB on the version. The desktop app loads it in the viewer with the latest render as the poster, in the asset screen, the part screen, and full screen.
2. Mark Ready on a level area part exports the actors tagged `nkata.area=<name>` from Unreal as one GLB and stores it on the version. In the app, Walk moves through it first person with WASD and the mouse, floor collision, and pins that stick.
3. Picking two versions of a part shows what changed: objects added, removed, and touched from the two manifests, triangles and materials, and the two renders under a wipe.

Proven by: server tests for the model routes, the Python test of the area export's pure parts, the agent test that a save stores the model, the viewer DOM test, and the screenshot walk. The Unreal export and walk mode against a real level need a machine with UE 5.4 (`@needs_editor`).

## Build, in this order

1. Server: `version.model_key` (migration 0007). `POST /parts/:id/versions/:vid/model-url`, `PUT .../model`, `GET .../model`, the same three steps as the render. Every version on the wire carries `render_url` and `model_url`, signed, so the app never asks per version.
2. UE5 plugin: `scripts/export_area.py` runs Epic's glTF exporter on the tagged actors with materials baked, centimeters to meters. `GLTFExporter` joins the plugins the app enables on install.
3. Agent: after a changed save, upload the spool GLB as the version's model, off the save path. On Mark Ready of a level area, export then upload, with the viewport capture as before.
4. Desktop: versions carry a model and a render URL. The viewer loads the version's model. Walk mode in `nk-viewer` for level areas. Compare mode on the part screen: facts from the manifests, the render wipe, A/B on a key.
5. Mock: manifests per version so the facts list demos; a level area asset for walk mode.

## Not in this step

No mesh heat map (vertex to surface distance). No pixel streaming. No diff for level areas beyond the renders.

## Done means

The three gates above, `make test` green, decisions logged with the date, and the Unreal pieces marked as needing the editor.

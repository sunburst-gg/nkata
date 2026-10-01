# Step 1: Mirror

Work on main. Push after every green `make test`. Open a PR only if you are blocked or the gate fails.

Read CLAUDE.md, docs/engineering.md (The mirror, Protocols, Checks pins templates), and docs/decisions.md first. Step 2 (core) is already in: shared schemas, server, agent sync core.

## Gate

One artist saves a part in Blender 20 times and sees UE5 update each time, p95 under 10 s, materials and physics kept. This gate needs Blender and UE5: write the e2e test, mark it `@needs_editor`, and make every other test green in `make test`.

## Build, in this order

1. Agent local API on `localhost:7420` in the Rust agent: token file, `/me`, `/parts?file=`, `/parts/:id/open`, `/parts/:id/close`, `/parts/:id/saved`, `/events` SSE. Types from `shared/`.
2. Mirror runner in the agent: on `/saved` with `changed: true`, record the version, call UE5 Remote Control on `localhost:30010` with `ue5-plugin/scripts/import_part.py` and JSON args, record `mirror_status` and `mirror_ms`, push `mirror.result` over SSE. Pending queue per part when UE5 is not reachable. Stop after three failures and expose Retry.
3. `ue5-plugin/scripts/`: `import_part.py` (AssetImportTask, `replace_existing` True, `automated` True, `save` True, existing skeleton and `physics_asset` passed on reimport, full options only on first import), `refresh.py`. Follow the decisions from step 0 in docs/decisions.md if they exist.
4. `blender-addon/`: Blender 4.2+ extension layout. `save_post` handler. Per-object hash of mesh data, material slots, and transform. Find the part collection from the template mapping. Trigger the collection's glTF exporter only when the hash changed. Write `manifest.json`. POST `/parts/:id/saved`. N-panel with part header and mirror status from SSE.
5. Tests that run without editors: agent API and mirror runner against a fake Remote Control server; Python unit tests for hashing and manifest with `bpy` stubbed; the `@needs_editor` e2e script at `e2e/mirror.py` that saves 20 times and prints p50, p95, and failures.

## Not in this step

No locks UI beyond open and close. No checks. No pins. No review. No UE5 panel. No Discord. Those are steps 3 and 4.

## Done means

Every test that runs without an editor is green in `make test`. The e2e script exists, is marked `@needs_editor`, and documents how to run it. Open questions that need a real Blender or UE5 are in docs/decisions.md with the date.

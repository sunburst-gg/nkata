# Step 1b: Environment mirror

Code complete Oct 5, 2026. The gate (prop in two levels, p95 under 5 s) needs UE5: run e2e/environment.py and write the numbers to docs/decisions.md. The two-artist half is the lock test in desktop/src-tauri/tests/agent_api.rs.

Work on main. Push after every green `make test`. Open a PR only if you are blocked or the gate fails.

Read CLAUDE.md, docs/product.md (Four people, Environment artist), docs/engineering.md (The mirror: Static and Level areas, Protocols, Templates), and docs/decisions.md first. Step 1a (character mirror) is in.

## Gate

A prop placed in two levels updates in both after each Blender save, p95 under 5 s over 20 saves, material instances and collision kept, referencer count unchanged. Two artists edit two areas of one level with no overwrite. This gate needs Blender and UE5: the e2e test is `e2e/environment.py`, marked `@needs_editor`, and every other test is green in `make test`.

## Build, in this order

1. `ue5-plugin/scripts/import_static.py`: static mesh reimport in place. First import sets Nanite, LOD group, and collision from the template params. Reimport keeps material instances, Nanite and LOD settings, and collision. Count referencers before and after; a drop fails the mirror with both counts in the message.
2. `ue5-plugin/scripts/scan_refs.py`: for a static mesh path, the levels that place it and the actor count per level, as one `NKATA_RESULT` line. The agent runs it after every static import and stores the result on the version as `refs`. Server: `refs` column on `version`, forward migration, returned on the version list.
3. Level areas: part mapping `{kind: ue_area, level, area}`. The plugin tags every actor added to an open area with `nkata.area=<area>` and reads the tag on scan. The agent treats the area's One File Per Actor files as the part's files for versioning. No Blender export for an area.
4. `blender-addon/`: a static part exports without an armature. The add-on refuses the export when the origin is not at the base of the bounds (within 1 mm) or the scale is not 1.0, with one line in the panel. The manifest records `kind: prop`, bounds, and origin.
5. Tests without editors: script choice for `prop` and `level_area` in Rust, `refs` stored on the version against the server, origin and scale refusal with `bpy` stubbed against `fixtures/props/`.
6. `e2e/environment.py`: place the Kettle in two levels, save 20 times, print p50, p95, failures, assert both actors reference the mesh, assert referencer count unchanged, assert material instances and collision primitive count unchanged.

## Not in this step

No checks, no pins, no review, no UE5 panel. Those are steps 3 and 4. No level streaming or world partition.

## Done means

Every test that runs without an editor is green in `make test`. `e2e/environment.py` is marked `@needs_editor` and documents how to run it. Open questions that need a real UE5 are in docs/decisions.md with the date.

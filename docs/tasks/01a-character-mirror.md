# Step 1a: Character mirror

Work on main. Push after every green `make test`. Open a PR only if you are blocked or the gate fails.

Read CLAUDE.md, docs/product.md (Four people, Character artist), docs/engineering.md (The mirror, Protocols, Checks pins templates), and docs/decisions.md first. Step 2 (core) is in: shared schemas, server, agent sync core. The agent local API, mirror runner, Blender save hook, and a single import script landed under the old step 1; this step splits the character path out and finishes it.

## Gate

One character artist saves a part in Blender 20 times and sees UE5 update each time, p95 under 10 s, skeleton, physics asset, and materials kept, MetaHuman data untouched. This gate needs Blender and UE5: the e2e test is `e2e/mirror.py`, marked `@needs_editor`, and every other test is green in `make test`.

## Build, in this order

1. `ue5-plugin/scripts/import_character.py`: AssetImportTask with `replace_existing`, `automated`, `save`. First import sets full options and stores them on the asset. Reimport passes the existing skeleton and `physics_asset`, keeps materials, never removes the MetaHuman DNA asset or its user data. One `NKATA_RESULT` line with `first_import`, `ms`, and the skeleton and physics asset paths.
2. Agent: pick the script by the template kind on the part mapping. `character` runs `import_character.py`. Unit test the choice with no editor.
3. `blender-addon/`: a character part exports with its armature and skin weights through the collection exporter. The manifest records `kind`, the armature name, and the bone count.
4. Tests without editors: script choice in Rust, armature in the manifest with `bpy` stubbed against `fixtures/character/`.
5. `e2e/mirror.py` saves 20 times, prints p50, p95, failures, and asserts skeleton, physics asset, and material slot names unchanged through `inspect_asset.py`.

## Not in this step

No props, no level areas, no placement scan. Those are step 1b. No checks, no pins, no review, no UE5 panel. Those are steps 3 and 4.

## Done means

Every test that runs without an editor is green in `make test`. `e2e/mirror.py` is marked `@needs_editor` and documents how to run it. Open questions that need a real Blender or UE5 are in docs/decisions.md with the date.

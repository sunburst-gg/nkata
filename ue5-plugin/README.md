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

Enable the Python Editor Script Plugin and the Remote Control API plugin in the project. Remote Control listens on `localhost:30010`.

The panel and the review tools come in steps 3 and 4.

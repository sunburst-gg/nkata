# Nkata UE5 plugin

Python Editor Script Plugin plus an Editor Utility Widget. Import in place, panel, review, pins, reference scan.

## scripts/

Snippets the agent runs through the Remote Control API (`PUT /remote/object/call` on the Python script library, `ExecuteFile` mode). Each takes one argument, the path of a JSON args file, and prints one line `NKATA_RESULT {...}` last. The agent reads that line from the log output.

- `import_part.py`: import or reimport one part export in place. `replace_existing`, `automated`, `save`. Reimport keeps skeleton, physics asset, and materials.
- `refresh.py`: rescan a content path and sync the Content Browser.

Enable the Python Editor Script Plugin and the Remote Control API plugin in the project. Remote Control listens on `localhost:30010`.

The panel and the review tools come in steps 3 and 4.

# e2e

Scripts that need Blender and UE5 on one machine. Each is marked `@needs_editor` and skips itself with a reason when the editors are not reachable, so `make test` runs them and stays green without editors.

- `mirror.py`: the step 1a gate. Saves a character part 20 times in Blender and measures save to `mirror.result`. Prints p50, p95, failures, and whether materials and physics were kept.
- `environment.py`: the step 1b gate. The same for a prop placed in two levels: material instances and collision kept, referencer count unchanged, both levels listed.
- `quality.py`: the quality bar (docs/product.md, Quality bar). Mirror p95 for a character and a prop, lost save, broken links, placed copies, panel open time. One JSON line per measure, exit 1 on a miss. Runs on `fixtures/` or on real assets through `NKATA_FIXTURES`.
- `blender_driver.py`: runs inside Blender for the save loops. `panel_probe.py`: runs inside Blender for the panel open time.
- `needs_editor.py`: the marker and the reachability check.

The parts of the quality bar that need no editor run in `make test`: lost save and queue drain (`desktop/src-tauri/tests/lost_save.rs`), role refusals (`server/test/api.test.ts`), cache eviction (`desktop/src-tauri/src/stream.rs` and `tests/stream_mode.rs`).

Setup for a real run: `make addon` (installs the add-on into Blender), `nkata-agent serve` in the project folder, UE5 open with the Remote Control API plugin on. Then:

```
NKATA_BLENDER=/Applications/Blender.app/Contents/MacOS/Blender \
python3 e2e/mirror.py --blend rising-sun/Ojukwu/face.blend --object Face --asset /Game/Nkata/Ojukwu/face
python3 e2e/environment.py --blend rising-sun/Kettle/model.blend --object SM_K_LOD0 --asset /Game/Nkata/Kettle/model
python3 e2e/quality.py --project rising-sun
```

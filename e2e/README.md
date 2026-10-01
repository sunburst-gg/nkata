# e2e

Scripts that need Blender and UE5 on one machine. Each is marked `@needs_editor` and skips itself with a reason when the editors are not reachable, so `make test` runs them and stays green without editors.

- `mirror.py`: the step 1 gate. Saves a part 20 times in Blender and measures save to `mirror.result`. Prints p50, p95, failures, and whether materials and physics were kept.
- `blender_driver.py`: runs inside Blender for `mirror.py`.
- `needs_editor.py`: the marker and the reachability check.

Setup for a real run: `make addon` (installs the add-on into Blender), `nkata-agent serve` in the project folder, UE5 open with the Remote Control API plugin on. Then:

```
NKATA_BLENDER=/Applications/Blender.app/Contents/MacOS/Blender \
python3 e2e/mirror.py --blend rising-sun/Ojukwu/face.blend --object Face --asset /Game/Nkata/Ojukwu/face
```

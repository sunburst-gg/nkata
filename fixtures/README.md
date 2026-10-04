# Fixture corpus

Built by `fixtures/build.py` with plain Python, no dependency. Every byte is deterministic: `make fixtures` rebuilds the folder and `git status` stays clean when the recipe did not change. See docs/engineering.md, Fixture corpus.

| Folder | What | Files |
| --- | --- | --- |
| `character/` | Ojukwu: two skinned tubes on a 20 bone chain, two materials, a 1024 texture | `ojukwu.glb`, `manifest.json`, `skeleton.json`, `T_Ojukwu_D.png` |
| `props/kettle/`, `props/wooden_stool/`, `props/market_stall/` | A prop: two boxes standing on the origin, one LOD1, a collision box, one material instance with a 1024 texture | `<slug>.glb`, `manifest.json`, `collision.json`, `T_<slug>_D.png` |
| `level_area/` | Enugu Market / square: eight actors tagged `nkata.area=square` | `square.json` |

Tests that need no editor read the corpus: `blender-addon/tests/test_fixtures.py` and the agent's manifest parsing. `e2e/quality.py` imports it into a real UE5. Set `NKATA_FIXTURES` to a folder with the same layout to run the quality bar on real Rising Sun assets instead.

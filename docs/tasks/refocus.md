# Refocus: four people

Nkata v1 serves four people: a character artist, an environment artist, a reviewer (the art director), and a viewer. Writers, sound, and engineers as a role move to Later. This file is the audit of what the repo holds today, what the four people still lack, and the plan. It is written before any code changes and updated as each change lands.

## Audit: touchpoints of cut work

Every feature, schema, route, screen, and test that touches writers, sound, engineers as a role, script and sound templates, string tables, editor builds, Linear, or the dependency map beyond "where is this prop placed".

**shared/**

- `schemas/common.schema.json` Role enum holds `engineer` and `writer`.
- `schemas/common.schema.json` CommentPin has `linear_issue`; `schemas/agent.schema.json` CommentCreateRequest has `linear_issue`.
- `test/fixtures.ts` builds CommentPin and CommentCreateRequest fixtures with `linear_issue`.
- `test/checks.test.ts` pins the shipped check list; it lacks `pivot_at_base`.
- `ts/` and `py/` are generated from the above and carry the same fields.

**server/**

- `src/db/schema.ts` and `drizzle/0000_init.sql` have `comment.linear_issue`.
- `src/routes/comments.ts` accepts and returns `linear_issue`.
- `src/seed.ts`: user `engineer@sunburst.gg` with role `engineer`; the Character template has `animation` and `sound` parts; `ue_asset` parts are owned by the engineer. No Environment template, no props, no level area.
- `test/api.test.ts` signs in as the engineer to prove a non-owner gets 403 on lock, and removes the gate on the `sound` part. No test signs in as a viewer.
- No route refuses a viewer by role. `requireRole` guards create, assign, gate removal, lock break, template edit, and review, but lock, publish, mark ready, rollback, project export, and comments rely on ownership checks only.

**desktop/ (app)**

- `src/auth/permissions.ts`: Role type with `engineer` and `writer`; ROLE_WORDS and ROLE_LINES describe builds, Blueprints, scripts, dialogue, canon.
- `src/data/types.ts`: AssetKind holds `Scripts` and `Sound`.
- `src/data/mock.ts`: people Ify (writer) and Kene (engineer, "Published build 0.3.1"); assets Act1_Scene3 (Scripts) and Village ambience (Sound); templates Script ("string table on Publish") and Sound; a Level template with an `audio` part; the activity feed and the week digest cite Ify and Act1_Scene3; the invite activity line names the engineer article.
- `src/screens/Project.tsx`: tabs All, Characters, Levels, Props, Scripts, Sound.
- `src/screens/Settings.tsx`: a Linear connection row.
- `src/screens/Auth.tsx`: viewer copy says "read scripts".
- `src/copy/en.ts`: `discord.publish` and `discord.unlock` strings (Discord on Publish and on gate open; v1 keeps one notification, on review).
- `src/screens/Part.tsx` and `src/screens/Asset.tsx`: toasts say Discord was told on Mark Ready and on gate removal.
- `src/viewer.test.tsx` and `scripts/shots.ts` use the Act1_Scene3 asset for the empty preview case.

**desktop/src-tauri (agent)**

- No touchpoint of cut work. The agent has no stream mode and no reference scan either; see the next list.

**blender-addon/, ue5-plugin/, e2e/**

- `ue5-plugin/scripts/import_part.py` is one script for every kind. It carries the skeletal reimport rules but no static mesh path, no material instance rule, no Nanite or LOD or collision rule, no referencer count.
- `blender-addon/nkata/export.py` exports the collection with no armature rule for characters and no origin or scale check for props.
- Nothing else in these folders names cut work.

**docs/**

- `product.md`: five roles with Engineer and Writer columns; Engineer and Writer user stories; R3 ships Script and Sound templates; R6 lacks `metahuman_dna_present` and `pivot_at_base`; R7 holds Linear issue IDs; R11 streams scripts; P1 lists dependency map, editor builds, string tables; Surfaces lists Discord and Linear links; Phasing step 5 is P1.
- `engineering.md`: `server/` row names Linear hooks; membership roles list engineer and writer; comment has `linear_issue`; the Character template has animation and sound parts; build order step 4 names Linear hooks and step 6 names dependency map, editor builds, string tables; Dev environment names Linear tokens; step 2 is not marked done.
- `one-pager.md`: the Sep 28 pitch. Left as a dated record.
- `tasks/01-mirror.md`: one mirror step for every kind. Superseded by 01a and 01b.
- `README.md` says Blender and UE5 are "later steps".

## Audit: missing for the four people

**Character artist**

- `import_character.py`: skeletal reimport with the existing skeleton and physics asset, materials kept, MetaHuman DNA never removed. Today one script guesses the kind from the existing asset.
- Blender export with the armature for a character part.
- Checks `rig_bone_names`, `rig_bone_count`, `metahuman_dna_present` have contracts but no Blender or UE5 implementation. No check runs in either editor yet.
- N-panel elements 3 to 7: reference strip, checks with Fix, comments, Publish, Mark Ready, presence. Only the header and the mirror line exist.

**Environment artist**

- An Environment template with kinds prop (concept, model, UVs, textures, LODs, collision) and level area (blockout, layout, set dressing, lighting). Today only Character exists.
- `import_static.py`: static mesh reimport with material instances, Nanite or LOD settings, and collision kept; referencer count before and after.
- Level areas as One File Per Actor with the tag `nkata.area=<name>`.
- Blender export of a static part with origin and scale checked.
- Checks `lod_count`, `collision_present`, `pivot_at_base` (new) implemented.
- `scan_refs.py`: which levels place a static mesh and how many actors. Stored on the version.
- The agent picks the import script by template kind.
- Seed: Ojukwu plus props Kettle, Wooden stool, Market stall, and level area Enugu Market / square.

**Reviewer**

- A review in UE5 (Score, Approve, Send back, pin tool) in the UE5 panel. No UE5 panel exists.
- One Discord notification on Approve or Send back. No Discord code exists.
- Comment pins drawn in Blender and UE5.

**Viewer**

- Server 403 for a viewer on lock, publish, mark ready, review, rollback, gate removal, template edit, and project export, with a test per route. Comments and single asset export allowed.
- Agent stream mode: no index, no watcher, no upload; downloads on demand into `~/.nkata/<project>/cache/` with a 5 GB cap and LRU eviction.
- The app already hides every write action for a viewer and is tested.

**Everyone**

- A fixture corpus (one rigged character, three props, one level area) built by a script, with real assets through `NKATA_FIXTURES`.
- `e2e/quality.py`: mirror p95 per kind, lost save, broken links, placed prop not updated, panel open time.
- A Quality bar section in both docs.

## Plan

Docs first, then code in this order. One concern per commit. `make test` green before every push. The sync core (step 2) keeps its tests green throughout.

**Docs**

1. `product.md`: four people; roles artist, art_director, producer, viewer; Later section for writers, sound, engineers; Character and Environment templates with their kinds; Quality bar; two environment stories.
2. `engineering.md`: build order 1a, 1b, 2 (done, with numbers), 3, 4, 5; Fixture corpus and Quality bar sections; Linear, string tables, editor builds, script and sound mapping removed.
3. `tasks/`: 01a-character-mirror.md, 01b-environment-mirror.md, 03-parts-locks.md, 04-review.md, 05-project-viewer.md in the shape of 02-core.md. Delete 01-mirror.md.

**Engineering**

1. Templates and seed. Template schema gains `kind` (character, prop, level_area). Character loses animation and sound. Environment template ships prop and level area variants. Seed the three props and the level area.
2. Roles. Enum artist, art_director, producer, viewer. Drop `linear_issue` with a forward migration. Server refuses a viewer on every write route; tests per route. Seed user set becomes artist, environment artist, director, producer, viewer.
3. Viewer stream mode in the agent with the 5 GB LRU cache and tests for eviction.
4. Mirror split by kind: `import_character.py`, `import_static.py`, level area tagging, agent script choice, Blender exporter rules.
5. Checks for the two templates, `pivot_at_base` added, Blender and UE5 implementations.
6. `scan_refs.py` and `refs` on the version.
7. Desktop audit: tabs All, Characters, Props, Levels; writers, sound, engineers, scripts, builds, Linear removed; one Discord notification; Blender N-panel and UE5 panel elements.
8. `fixtures/` corpus built by `fixtures/build.py`.
9. `e2e/quality.py` marked `@needs_editor`; lost save, queue drain, role refusals, cache eviction in `make test`.

## Changes made

Appended as each lands, with the commit subject.

- Add the refocus audit and plan (this file).

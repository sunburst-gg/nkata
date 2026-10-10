# Nkata engineering doc (v1)

Oct 1, 2026 · @Emmanuel Njoku. Refocused Oct 3, 2026: four people.

## Scope

This doc is the build plan for Nkata v1 as the product doc defines it: a character artist, an environment artist, a reviewer, and a viewer. One engineer plus Claude. Desktop only. Blender 4.2+ and Unreal Engine 5.4+. Own storage. The product doc owns what. This doc owns how.

## Decisions from research

| Risk | Finding | Decision |
| --- | --- | --- |
| UE5 in-place reimport of a skeletal mesh | Python `AssetImportTask` with `replace_existing` and an `FbxImportUI` that passes the existing `physics_asset` keeps materials, skeleton, and physics. Import options do not change on reimport, only on first import. MetaHuman DNA data on the mesh must not be deleted before reimport | Python import tasks in v1. Set options once at first import. Interchange pipelines later when we need custom steps |
| UE5 in-place reimport of a static mesh | A reimport onto an existing `StaticMesh` keeps the asset path, so every actor that references it updates on its own. Material slots, Nanite settings, LOD groups, and simple collision live on the asset and survive a reimport when the importer is told not to recreate them | One script per kind: `import_character.py` and `import_static.py`. The static script counts referencers before and after and fails the mirror if the count drops |
| Level areas | One File Per Actor stores each actor in its own file, so two artists edit one level with no file conflict. An actor tag is the cheapest stable marker that survives rename and reparent | A level area part is the set of actors tagged `nkata.area=<name>` in one level. The plugin sets the tag on creation and reads it on every scan |
| Blender partial export | Blender 4.2+ Collection Exporters attach an exporter and its settings to a collection, stored in the `.blend`, built for re-exporting one asset many times. Selection-based export misses linked collections | One part = one collection with a glTF exporter attached. The add-on triggers the collection exporter on save. A character part exports with its armature; a static part exports with origin and scale checked. Never selection export |
| Two artists, one `.blend` | Blender Studio's open-source Asset Pipeline add-on gives each task layer ownership of data and merges layers into one published asset, with ownership set in a JSON config | One `.blend` per part. The published asset `.blend` is built by the Asset Pipeline merge model. Nkata does not write a merger |
| Rust file watcher on large folders | `notify` can drop events on very large trees and recursive watches count every file toward OS limits | The agent owns an index (path, size, mtime, hash). The watcher only wakes a rescan of the folder. Full rescan on start and every 10 minutes |
| C++ build time for the UE5 plugin | UE5 ships the Python Editor Script Plugin and the Remote Control API (HTTP, port 30010). Import, reimport, presence, locks, reference scans all work from Python with no C++ | UE5 side is Python plus an Editor Utility Widget in v1. One small C++ module only for viewport comment pins and review tools, built with Live Coding |

## Repo and stack

One monorepo, `nkata/`. One version number across all packages. A project pins that number. pnpm workspaces for TypeScript, Cargo workspace for Rust, plain folders for Python and the UE5 plugin.

| Package | Language | Runtime | What it is |
| --- | --- | --- | --- |
| `shared/` | TypeScript, JSON Schema | Published to the other packages | Types, the agent protocol, the template schema, check definitions, event names, copy strings |
| `server/` | TypeScript (Node 22), Fastify, Drizzle | One VPS, Docker | REST, WebSocket, auth, lock grants, signed store URLs, one Discord hook |
| `store/` | S3-compatible (Cloudflare R2 in prod, RustFS in dev) | Managed | Content-addressed chunks, previews, renders |
| `db/` | Postgres 16 | Managed or on the VPS | All metadata |
| `desktop/` | Tauri 2: Rust core, TypeScript UI (React, Tailwind, the brand tokens) | macOS, Windows | The app and the local agent in one process |
| `blender-addon/` | Python 3.11, bpy | Blender 4.2+ | N-panel, save hook, collection export, checks, pins, presence |
| `ue5-plugin/` | Python (Editor Script Plugin), Editor Utility Widget, one small C++ module | UE 5.4+ | Import in place per kind, panel, review, pins, placement scan |
| `fixtures/` | Python, glTF | Built by `fixtures/build.py` | One rigged character, three props, one level area, for tests and the quality bar |
| `e2e/` | Python | A machine with both editors | The editor gates and the quality bar, marked `@needs_editor` |
| `infra/` | Docker Compose, Terraform later |  | Local dev stack in one command |

Rules: no code in `shared/` that imports from another package. The agent protocol and the template schema are versioned and backward compatible from v1. Every package has a `make test` that runs with no editor installed, plus an `e2e` that needs Blender and UE5.

## System architecture

&#91;embedded content: system architecture · three local processes, three cloud services, two local ports\]

Three rules hold the shape.

1. **Editors talk only to the agent.** The Blender add-on and the UE5 plugin never call the server or the store. They call `localhost:7420`. The agent holds the session, the queue, and the index. One place to debug.
2. **The server never touches file bytes.** It signs upload and download URLs. Chunks go from the agent to the store directly. The server stays small and cheap.
3. **The mirror is local.** Agent to UE5 over the Remote Control API on `localhost:30010`. No round trip to the cloud. If UE5 runs on another machine, the agent there pulls the part from the store and mirrors it; slower, same code path.

## Data model

Postgres. Every table has `id` (ULID), `studio_id`, `created_at`, `updated_at`. Soft delete nowhere; history is kept. Foreign keys everywhere.

| Table | Key columns | Notes |
| --- | --- | --- |
| `studio` | name, training | One per customer. `training` on or off: on contributes to model training and pays nothing, off is billed per seat. Changing it emits `studio.training` |
| `user` | email, name, avatar\_url, training\_id | Magic link auth. `training_id` is a pseudonymous ULID set on capture acknowledgement, never the email |
| `membership` | user\_id, studio\_id, roles\[\], capture\_ack\_at | Roles: artist, art\_director, producer, viewer. The enum stays open for later roles. `capture_ack_at` when the member acknowledged capture for training |
| `project` | studio\_id, name, folder\_name, blender\_version, ue\_version, package\_version, deleted\_at | Pinned tool versions. `deleted_at` set by Delete project: the rows and versions stay, lists leave it out, Restore clears it |
| `template` | project\_id, name, file\_path, schema JSONB | The file in the folder is the truth; this row is the cache. The schema carries `kind`: character, prop, level\_area |
| `asset` | project\_id, template\_id, name, reference\_files\[\], rights JSONB | State is derived from parts. `rights` is who holds them, confirmed by a reviewer; required to Publish while training is on. An asset can be created with any subset of the template's parts |
| `part` | asset\_id, name, position, owner\_id, state, gate JSONB, mapping JSONB | mapping: `{kind: blend_collection, file, collection}`, `{kind: ue_asset, path}`, `{kind: ue_area, level, area}`, or `{kind: file, path}`. `ue_actor` stays for a single actor |
| `version` | part\_id, author\_id, file\_version\_id, manifest JSONB, mirror\_status, mirror\_ms, refs JSONB, published, note, capture\_eligible, opened\_at, saved\_at, render\_key | One row per save, never deleted. `published` true when Publish marked it. `refs` is `{levels: [{level, actors}]}` from the placement scan, null for a non static part. `capture_eligible` is stamped from studio.training at insert and never updated (also on review, comment, check\_run). `render_key` is the store key of the Mark Ready viewport capture |
| `file_version` | project\_id, path, size, blake3, chunk\_hashes\[\] | A whole file at a point in time |
| `chunk` | blake3, size, store\_key | Deduped across the studio |
| `lock` | part\_id, holder\_id, granted\_at, heartbeat\_at, expires\_at | One row per part, or none |
| `presence` | user\_id, project\_id, part\_id, since, last\_seen | Ephemeral; also in Redis-like memory on the server |
| `comment` | part\_id, version\_id, author\_id, point float\[3\], normal float\[3\], body, kind, resolved\_at | Pin in part local space. `kind` is pin or take\_a\_look; take a look asks the art director and changes no state |
| `review` | part\_id, version\_id, reviewer\_id, score, decision, note | decision: approve, send\_back |
| `check_run` | version\_id, check\_id, severity, passed, auto\_fixed, message | From the editor |
| `event` | actor\_id, kind, target\_kind, target\_id, payload JSONB | Feeds the project view and the log |

Indexes: `version (part_id, created_at desc)`, `event (project_id, created_at desc)`, `chunk (blake3)` unique, `lock (part_id)` unique, `presence (project_id)`.

Derived, never stored: asset state (Locked, Draft, Ready, Approved, Complete) from its parts; gate open or closed from the states of the named parts.

## The mirror

&#91;embedded content: the mirror · 6 steps, 2 time budgets\]

**Step 2 in detail.** The add-on keeps a hash per object in the part's collection (mesh data hash, material slots, transform). On `save_post` it compares to the last save. If nothing in the part changed, it posts `saved` with `changed: false` and stops; the version still records. If something changed, it runs the collection's attached glTF exporter to `spool/<part_id>/<version_ulid>.glb` and writes `manifest.json`: kind, objects, triangle counts, materials, bounds, armature name, and the hash table. A character part exports with its armature and skin weights. A static part exports without an armature, and the add-on refuses the export when the origin is not at the base or the scale is not 1.0, with one line in the panel. Budget: 3 seconds for a 100k triangle character, 1 second for a prop.

**Step 4 in detail.** The agent reads the template kind from the part mapping and picks the script: `import_character.py` for a character, `import_static.py` for a prop. Both build an `AssetImportTask` with `replace_existing = True`, `automated = True`, `save = True`, and `destination_path` from the part mapping. Then they refresh the Content Browser and mark the package dirty. Budget: 7 seconds for a character, 4 seconds for a prop. Measure on the real Rising Sun character in week 1; if it is over, split the texture upload from the mesh import.

**Character.** On first import the script sets all options and stores them on the asset. Every later mirror is a reimport that passes the existing skeleton and `physics_asset`, keeps materials, and never touches the MetaHuman DNA asset or its user data on the mesh. A check blocks any mirror that would.

**Static.** On first import the script sets Nanite, LOD group, and collision from the template params. Every later mirror is a reimport that keeps material instances, Nanite and LOD settings, and collision. The script counts the asset's referencers before and after; a drop fails the mirror with the count in the message. Placed copies update on their own because the asset path is unchanged. After the import, `scan_refs.py` lists the levels that place the mesh and the actor count per level; the agent stores it on the version as `refs`.

**Level areas.** A level area part maps to `{kind: ue_area, level, area}`. The level uses One File Per Actor. Every actor in the area carries the tag `nkata.area=<area>`. The plugin sets the tag when the artist adds an actor to an open area and reads it on every scan. A save of an area is the set of actor files in that area; the agent chunks and versions those files like any other. Nothing is exported from Blender for an area; props placed in it are their own parts.

**First import vs reimport.** First import creates the asset at the mapped path with full options. Every later mirror is a reimport onto that asset. Options do not change on reimport; if the template changes options, the agent deletes and re-creates the asset and logs it.

**Failure.** UE5 closed: the agent keeps the newest pending mirror per part and runs it when the Remote Control API answers. Import error: the result carries the UE5 log line, both panels show it in one line, the version still exists. Three failures in a row on one part: the agent stops mirroring that part and shows a Retry.

## Protocols

All JSON. All versioned with a `v` field. Defined once in `shared/` and generated into Python and TypeScript types.

**Agent local API, `http://localhost:7420`, loopback only, token in a file the editors read**

| Method | Path | From | Does |
| --- | --- | --- | --- |
| GET | `/me` | editors | Current user, project, package version, mode (sync or stream) |
| GET | `/parts?file=` | editors | Parts mapped to this open file, with state, lock, owner |
| POST | `/parts/:id/open` | editors | Requests the lock. Returns granted or holder |
| POST | `/parts/:id/close` | editors | Releases the lock if held |
| POST | `/parts/:id/saved` | Blender | `{changed, spool_path, manifest}`. Creates the version, starts the mirror |
| POST | `/parts/:id/publish` | editors | `{check_results, ready}`. Marks published, sets Ready if asked |
| POST | `/parts/:id/checks` | editors | Reports check results for the current version |
| GET | `/parts/:id/comments` | editors | Pins for the current version |
| POST | `/parts/:id/comments` | editors | New pin `{point, normal, body}` |
| POST | `/parts/:id/review` | UE5 | `{score, decision, note}` (art director only) |
| POST | `/presence` | editors | Heartbeat `{part_id or null}` every 15 s |
| GET | `/events` (SSE) | editors | Push: lock changes, mirror results, new pins, presence |

**Agent to UE5, Remote Control API on `localhost:30010`**

One call: `PUT /remote/object/call` on the Python command subsystem with a snippet from `ue5-plugin/scripts/`. The snippets are files, not strings in Rust: `import_character.py`, `import_static.py`, `scan_refs.py`, `refresh.py`, `draw_pins.py`, `checks.py`. The UE5 panel is `panel.py`, imported by the Editor Utility Widget, not run by the agent.

**Agent to server events.** The agent polls `GET /events?since=` every 2 s and relays each event to the editors over its SSE stream, dropping the echoes of its own lock, mirror, and comment actions. It heartbeats presence every 15 s with the part an editor last reported. The agent sends arguments as a JSON file path. Results come back as one `NKATA_RESULT` JSON line in the Python log output.

**Server REST, `https://api.<domain>`**

`/auth/magic-link` (any email: an unknown one gets an account), `/auth/callback`, `/auth/me`, `/auth/switch` (a session for another studio of the account), `/studios` (GET the account's, POST creates one with the caller as producer), `/me` (PUT name and email), `/studio` (GET, PUT name), `/studio/training`, `/studio/members` (GET, POST invite, PUT and DELETE by user id), `/projects` (GET, POST, PUT name, DELETE, `/deleted`, `/:id/restore`), `/projects/:id/templates`, `/assets`, `/parts`, `/parts/:id/versions`, `/parts/:id/lock` (POST acquire, DELETE release, PUT heartbeat), `/comments`, `/reviews`, `/events?since=`, `/files/upload-urls` (returns signed PUT URLs for missing chunk hashes), `/files/download-urls`, `/export/:asset_id`.

The server enforces the role on every mutating route. A viewer gets 403 on lock, publish, mark ready, review, rollback, gate removal, template edit, asset creation, and project export routes. Comments are allowed. A single asset export as images and glTF is allowed. One test per refused route.

**Server WebSocket, `wss://api.<domain>/ws?project=`**

Server to client events: `presence.changed`, `lock.granted`, `lock.released`, `lock.requested` (someone asked the holder), `version.created`, `mirror.result`, `part.state`, `comment.created`, `review.decided`, `gate.opened`. Client to server: `presence.heartbeat`, `lock.request`, `lock.release`. Every event carries `project_id`, `actor_id`, `at`. The agent re-syncs with `/events?since=` after a reconnect, so a missed socket event is never lost.

**Discord.** One webhook per project, set by a producer. The server posts one message on `review.decided`: who approved or sent back which part, with the note. Nothing else posts.

## Storage and sync

**Index.** The agent keeps SQLite at `<project>/.nkata-agent/index.db`: path, size, mtime, blake3, chunk list, last synced version. The index is the truth about local state. The OS watcher only wakes a rescan of the folder it reports. Full rescan on start and every 10 minutes. A rescan reads mtime and size first and hashes only files that changed.

**Chunking.** Content-defined chunking (FastCDC), target 2 MB, min 512 KB, max 8 MB, so an edit in the middle of a 400 MB `.blend` moves a few chunks, not the file. Hash with BLAKE3. A `file_version` is the ordered list of chunk hashes. Dedupe is per studio.

**Upload.** The agent asks the server which hashes are missing (`/files/upload-urls` with the list), gets signed PUT URLs for those only, and uploads in parallel, 4 at a time, resumable. Then it posts the `file_version`. The server never proxies bytes.

**Download.** On open of a part whose file is behind, the agent fetches missing chunks with signed GET URLs and assembles the file to a temp path, then renames into place. Blender and UE5 never see a half-written file.

**Ignore rules.** The template lists what to track. Defaults: `.blend`, `.blend1` ignored, `.uasset`, `.umap`, textures, `.json` in the project; UE5 `Saved/`, `Intermediate/`, `DerivedDataCache/`, `Binaries/` ignored. A `.nkataignore` file in the project adds to this.

**Offline.** Every write the agent would send is a row in a local queue table. Online, the queue drains in order. Offline, the artist keeps editing parts they already hold; opening a new part fails with "offline, lock not available". Presence shows "offline since". If the agent dies mid upload, the next start drains the queue from the first unsent row; a save is never lost.

**Spool.** `<project>/.nkata-agent/spool/<part_id>/` holds exports for the mirror and the UE5 import log. Kept for 7 days then pruned.

**Export.** `/export/:asset_id` returns a signed zip, or the agent builds it locally from the index: plain files plus `manifest.json` with parts, owners, states, versions, and comments. Works with no server.

**Stream mode.** A viewer agent runs in stream mode. No index, no watcher, no upload. It downloads previews and single files on demand through `/files/download-urls` into a cache at `~/.nkata/<project>/cache/`, capped at 5 GB, least recently used evicted first. The cache is a SQLite table of (file_version_id, path, size, last_used) next to the files; eviction runs after every download until the total is under the cap.

**Numbers to hold.** 20 GB project, 40k files: first full sync under 30 minutes on 100 Mbps; rescan under 20 seconds; a 400 MB `.blend` save uploads under 20 MB on a typical edit.

## Locks, presence, gates, state

&#91;embedded content: part state machine · 4 states, 5 transitions\]

**State is on the part, set only by the server.** Draft is where saves and mirrors happen. Ready is the review queue. Approved is read-only for everyone but an art director or producer. Locked means a gate is closed; nothing can open the part. The editor lock (who is editing now) is separate from the state and lives in the `lock` table.

**Lock grant.** `POST /parts/:id/lock`. Granted if no row exists or the row has expired. Returns the holder otherwise. The agent requests on part open and releases on close or Publish. Heartbeat every 15 s via WebSocket; the server marks a lock stale after 2 minutes with no heartbeat and shows it as stale; it expires after 12 hours idle. A holder can hand off; a producer can break a lock, logged. An Approved part grants a lock only to an art director or producer. A viewer is refused.

**Request unlock.** A second person opening a held part sends `lock.requested`. The holder's panel shows the name and a one-click release.

**Presence.** Heartbeat carries `part_id` or null. Server keeps an in-memory map per project and fans out `presence.changed` on any change. Clients drop a user after 45 s silence. Shown as faces on parts and in the project view.

**Gates.** A gate is `{after: [part_name, ...]}` on the part, copied from the template at asset creation. The server evaluates on every `review.decided`: if all named parts are Approved, the part moves Locked to Draft and emits `gate.opened`. Removing a gate sets `after: []` on that asset only and writes an event.

**Mark Ready.** By the owner from Publish, or by an art director or producer from the app. Send back sets Draft and notifies. Approve writes a `review` row, sets Approved, releases the lock, and re-evaluates every gate that names this part.

## Checks, pins, templates

**Checks.** A check is a JSON contract in `shared/checks/<id>.json`: `id`, `title`, `severity` (block or warn), `auto_fix` (true or false), `params` schema, `applies_to` (blender, ue5, file). Each has a Python implementation in `blender-addon/nkata/checks/` or `ue5-plugin/scripts/checks/`, and a TypeScript one in `desktop/` for file checks. The template lists which checks run on which part, with params. The editor runs them on Publish, applies auto-fixes, posts results.

Shipped v1 checks, by template:

- Character: `unit_scale` (fix), `name_pattern` (fix), `triangle_budget`, `uv_set_present`, `texture_size`, `rig_bone_names`, `rig_bone_count`, `metahuman_dna_present`.
- Environment: `unit_scale` (fix), `name_pattern` (fix), `triangle_budget`, `lod_count`, `collision_present`, `uv_set_present`, `texture_size`, `pivot_at_base`.

Nine contracts in all; the two lists share five. `pivot_at_base` blocks when the object origin is not at the lowest point of the mesh bounds, within 1 mm.

**Comment pins.** `{part_id, version_id, point, normal, body}`, point and normal in the part's local space at that version. Blender draws pins with a `gpu` module overlay in the 3D viewport and a click handler on the N-panel list. UE5 draws them with a small C++ `FEditorViewportClient` extension; until that module exists, the Editor Utility Widget lists pins and frames the camera on click. The app draws them on the glTF preview with three.js. A pin on an old version still draws on new versions by point; if the point is more than 5 cm from any surface it shows as detached.

**Templates.** One file per template at `<project>/.nkata/templates/<name>.json`, validated against `shared/template.schema.json`. The server caches it in the `template` row on every change. A template has a `kind`: `character`, `prop`, or `level_area`. The kind picks the import script and the panel layout. Shape:

```json
{
  "v": 1,
  "name": "Character",
  "kind": "character",
  "parts": [
    {"name": "concept", "mapping": "file", "checks": ["texture_size"]},
    {"name": "face", "mapping": "blend_collection", "gate": [], "checks": ["unit_scale", "name_pattern", "triangle_budget", "uv_set_present"], "params": {"triangle_budget": {"max": 60000}}},
    {"name": "cloth", "mapping": "blend_collection", "gate": [], "checks": ["unit_scale", "name_pattern", "triangle_budget"]},
    {"name": "hair", "mapping": "blend_collection", "gate": [], "checks": ["unit_scale", "name_pattern"]},
    {"name": "textures", "mapping": "file", "gate": ["face", "cloth", "hair"], "checks": ["texture_size", "name_pattern"]},
    {"name": "rig", "mapping": "blend_collection", "gate": ["textures"], "checks": ["rig_bone_names", "rig_bone_count", "metahuman_dna_present"]},
    {"name": "lookdev", "mapping": "ue_asset", "gate": ["rig"], "checks": ["texture_size"]}
  ],
  "reference_slots": ["concept_sheet", "style_guide", "color_scheme"],
  "export": {"ue_path": "/Game/Characters/{asset}/{part}", "name": "SK_{asset}_{part}"},
  "blend_layout": "one_file_per_part"
}
```

The Environment template ships as two files, one per kind:

- `Environment prop`, kind `prop`: concept (file), model (blend\_collection), uvs (blend\_collection, gate model), textures (file, gate uvs), lods (ue\_asset, gate textures), collision (ue\_asset, gate model). Export `/Game/Props/{asset}`, name `SM_{asset}`.
- `Level area`, kind `level_area`: blockout, layout, set\_dressing, lighting, each `ue_area`, each gated on the one before. Export `/Game/Levels/{asset}`.

`blend_layout: one_file_per_part` means `face.blend`, `cloth.blend`, and so on, each with its part as the top collection with a glTF collection exporter attached. The published `<asset>.blend` is assembled by the Asset Pipeline merge model, run by the agent on Approve.

## Fixture corpus

`fixtures/build.py` writes the corpus with no dependency beyond Python: one rigged character (a skinned mesh with 20 bones, two materials, a 1024 texture), three props (Kettle, Wooden stool, Market stall, each with origin at the base, two LODs, a collision box), and one level area (a JSON description of eight actors tagged `nkata.area=square`). Each is a `.glb` plus a manifest in the shape the add-on writes. The corpus is checked in; the script is the record of how it was made and rebuilds it byte for byte.

Tests that need no editor run against the corpus: manifest parsing, check logic on known triangle counts and bone names, the agent's script choice by kind, the placement store. `e2e/quality.py` imports the corpus into a real UE5 when `NKATA_FIXTURES` is unset, and the real Rising Sun assets when it points at a folder with the same layout.

## Quality bar

`e2e/quality.py`, marked `@needs_editor`. Prints one line per measure and exits non zero when any target is missed. See docs/product.md, Quality bar, for the targets.

| Measure | Method |
| --- | --- |
| Mirror p95, character and prop | 20 saves each through `e2e/blender_driver.py`, save time to `mirror.result` on the agent SSE |
| Lost save | Start an upload of a 100 MB file, kill the agent at 30 percent, restart, assert the queue drains and the server holds the file version |
| Broken links | After the 20 character saves: skeleton, physics asset, and material slot names unchanged. After the 20 prop saves: material instances, collision primitive count unchanged |
| Placed copies | The prop placed in two levels before the run; after each save both actors reference the mesh and the referencer count is unchanged |
| Panel open | Open a fixture `.blend`; time from `load_post` to the N-panel's first draw with the part header. Same for the UE5 widget from `on_construct` |

The parts that need no editor run in `make test`: lost save and queue drain (Rust, kill the push task mid upload), role refusals (server, one test per route), cache eviction (Rust, fill past 5 GB with fake sizes and assert the LRU order).

## Build order

No dates. Order is fixed. Nothing starts until the gate before it passes.

| Step | Build | Gate |
| --- | --- | --- |
| 0. Measure | Reimport the real Rising Sun character into UE5 from Python with materials and physics kept. Export one collection from its `.blend` with a collection exporter. Time both | Both work. Both numbers written down |
| 1a. Character mirror | Blender save hook, object hashing, collection export with armature, spool. Agent local API with `/parts/:id/saved` and `import_character.py` over Remote Control. Both panels show mirror status | One character artist saves 20 times and sees UE5 update each time, p95 under 10 s, skeleton, physics, and materials kept |
| 1b. Environment mirror | Static export with origin and scale checked, `import_static.py` with referencer count, `scan_refs.py` stored on the version, level areas tagged `nkata.area` | A prop placed in two levels updates in both, p95 under 5 s over 20 saves; two artists edit two areas of one level with no overwrite |
| 2. Core | Done Oct 1, 2026. `shared` schemas. Server: auth, projects, assets, parts, versions, events, WebSocket. Postgres. Store with signed URLs. Agent: index, FastCDC chunking, upload, download, queue | Green in `make test`: 2,202,009,602 bytes in 106 files synced to a second agent in 41.6 s push and 52.5 s pull; a 4 KB edit moved 1 chunk of 927 |
| 3. Parts and locks | Templates with kinds, asset creation, part mapping, locks, presence, Publish, checks in both editors, viewer refusals on the server. Code complete Oct 5, 2026 | Second artist installs and opens the project in under 5 minutes. Two parts on one asset, no overwrite: green in make test |
| 4. Review | Ready queue, pins in UE5 widget and Blender overlay and app preview, score, approve, send back, gates, one Discord message. Code complete Oct 5, 2026 | Ojukwu goes from template to Approved: the chain is green in make test, the pins need the editors |
| 5. Project view and viewer mode | Project, asset, part, review queue, person, settings, setup screens. Stream mode with the 5 GB cache. Export. Code complete Oct 5, 2026 | A viewer answers who, what, and what is stuck from one screen with no folder on disk: stream mode and the viewer DOM test are green, the window flow needs a built app |

Later, in no order: Asset Pipeline merge on Approve, C++ pin module, and the items under Later in docs/product.md.

If step 0 fails on the physics or materials, the fallback is Interchange with a custom Python pipeline. If step 1a misses 10 s, split texture import from mesh import before anything else changes.

## Dev environment

- `make dev` starts Postgres and RustFS in Docker. The server runs from the shell. The seed loads one studio, one project, the Character and Environment templates, the Ojukwu asset, three props (Kettle, Wooden stool, Market stall), and one level area (Enugu Market / square).
- `make desktop` runs the Tauri app against the local server.
- The app installs the editor tools (desktop/src-tauri/src/tools.rs, the Tools step after the folder step, and Settings, Tools). Blender: the add-on is zipped and installed with `blender --command extension install-file -r user_default -e`, which enables it. Unreal: the plugin is copied to `<project>/Plugins/Nkata`, the .uproject gets Nkata, PythonScriptPlugin, and RemoteControl enabled, and DefaultEngine.ini gets `WebControl.EnableServerOnStartup=1` under `[SystemSettings]`. The Unreal project lives inside the Nkata project folder so the plugin finds the agent token above it.
- The agent writes `~/.nkata/agent.json` (folder, port, token file) when it starts in sync mode, so a panel with no file open can list the parts to start.
- `make addon` and `make ue` are developer shortcuts that symlink the same folders; reload Blender with F3 "Reload Scripts". The C++ module builds with Live Coding.
- `make fixtures` rebuilds `fixtures/` from `fixtures/build.py`.
- One prebuilt UE 5.4 editor from the Epic launcher. No engine source build.
- Secrets in `.env`, never in the repo. The Discord webhook per project in the `project` row, encrypted.

## Testing

- `shared`: schema tests, protocol round-trips Python to TypeScript, the shipped check list.
- `server`: unit tests on lock grant, gate evaluation, state transitions, chunk dedupe. Integration tests against Docker Postgres and RustFS. One test per mutating route signs in with a viewer token and asserts 403, plus 201 on comments.
- `desktop`: Rust unit tests for FastCDC, index rescan, queue drain, script choice by kind, cache eviction. Fixture folder of 40k small files for the rescan budget.
- `blender-addon`: tests run against `fixtures/` with `bpy` stubbed, and in `blender --background --python` on a real machine. Hashing, changed-object detection, exporter trigger, origin and scale refusal, check results.
- `ue5-plugin`: tests run with `UnrealEditor-Cmd -run=pythonscript` against a fixture project. Import, reimport, materials kept, referencer count, placement scan.
- `e2e`: `mirror.py` (step 1a), `environment.py` (step 1b), and `quality.py` on a machine with both editors. Each marked `@needs_editor`. Runs before every release.
- Release gate: all of the above green, plus the step gates above, plus the quality bar, plus one hour of real use by the artist with no blocking bug.

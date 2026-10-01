# Nkata engineering doc (v1)

Oct 1, 2026 · @Emmanuel Njoku

## Scope

This doc is the build plan for Nkata v1 as the product doc defines it. One engineer plus Claude. Desktop only. Blender 5.x and Unreal Engine 5.4+. Own storage. The product doc owns what. This doc owns how.

## Five decisions from research

| Risk | Finding | Decision |
| --- | --- | --- |
| UE5 in-place reimport of a skeletal mesh | Python `AssetImportTask` with `replace_existing` and an `FbxImportUI` that passes the existing `physics_asset` keeps materials, skeleton, and physics. Import options do not change on reimport, only on first import. MetaHuman DNA data on the mesh must not be deleted before reimport | Python import tasks in v1. Set options once at first import. Interchange pipelines later when we need custom steps |
| Blender partial export | Blender 4.2+ Collection Exporters attach an exporter and its settings to a collection, stored in the `.blend`, built for re-exporting one asset many times. Selection-based export misses linked collections | One part = one collection with a glTF exporter attached. The add-on triggers the collection exporter on save. Never selection export |
| Two artists, one `.blend` | Blender Studio's open-source Asset Pipeline add-on gives each task layer ownership of data and merges layers into one published asset, with ownership set in a JSON config | One `.blend` per part. The published asset `.blend` is built by the Asset Pipeline merge model. Nkata does not write a merger |
| Rust file watcher on large folders | `notify` can drop events on very large trees and recursive watches count every file toward OS limits | The agent owns an index (path, size, mtime, hash). The watcher only wakes a rescan of the folder. Full rescan on start and every 10 minutes |
| C++ build time for the UE5 plugin | UE5 ships the Python Editor Script Plugin and the Remote Control API (HTTP, port 30010). Import, reimport, presence, locks, reference scans all work from Python with no C++ | UE5 side is Python plus an Editor Utility Widget in v1. One small C++ module only for viewport comment pins and review tools, built with Live Coding |

## Repo and stack

One monorepo, `nkata/`. One version number across all packages. A project pins that number. pnpm workspaces for TypeScript, Cargo workspace for Rust, plain folders for Python and the UE5 plugin.

| Package | Language | Runtime | What it is |
| --- | --- | --- | --- |
| `shared/` | TypeScript, JSON Schema | Published to the other packages | Types, the agent protocol, the template schema, check definitions, event names, copy strings |
| `server/` | TypeScript (Node 22), Fastify, Drizzle | One VPS, Docker | REST, WebSocket, auth, lock grants, signed store URLs, Discord and Linear hooks |
| `store/` | S3-compatible (Cloudflare R2 or MinIO) | Managed | Content-addressed chunks, previews, renders |
| `db/` | Postgres 16 | Managed or on the VPS | All metadata |
| `desktop/` | Tauri 2: Rust core, TypeScript UI (React, Tailwind, the brand tokens) | macOS, Windows | The app and the local agent in one process |
| `blender-addon/` | Python 3.11, bpy | Blender 5.x | N-panel, save hook, collection export, checks, pins, presence |
| `ue5-plugin/` | Python (Editor Script Plugin), Editor Utility Widget, one small C++ module | UE 5.4+ | Import in place, panel, review, pins, reference scan |
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
| `studio` | name | One per customer |
| `user` | email, name, avatar\_url | Magic link auth |
| `membership` | user\_id, studio\_id, roles\[\] | Roles: artist, art\_director, engineer, writer, producer, viewer |
| `project` | studio\_id, name, folder\_name, blender\_version, ue\_version, package\_version | Pinned tool versions |
| `template` | project\_id, name, file\_path, schema JSONB | The file in the folder is the truth; this row is the cache |
| `asset` | project\_id, template\_id, name, reference\_files\[\] | State is derived from parts |
| `part` | asset\_id, name, position, owner\_id, state, gate JSONB, mapping JSONB | mapping: `{kind: blend_collection, file, collection}` or `{kind: ue_actor, level, actor}` or `{kind: file, path}` |
| `version` | part\_id, author\_id, file\_version\_id, manifest JSONB, mirror\_status, mirror\_ms, published, note | One row per save. `published` true when Publish marked it |
| `file_version` | project\_id, path, size, blake3, chunk\_hashes\[\] | A whole file at a point in time |
| `chunk` | blake3, size, store\_key | Deduped across the studio |
| `lock` | part\_id, holder\_id, granted\_at, heartbeat\_at, expires\_at | One row per part, or none |
| `presence` | user\_id, project\_id, part\_id, since, last\_seen | Ephemeral; also in Redis-like memory on the server |
| `comment` | part\_id, version\_id, author\_id, point float\[3\], normal float\[3\], body, linear\_issue, resolved\_at | Pin in part local space |
| `review` | part\_id, version\_id, reviewer\_id, score, decision, note | decision: approve, send\_back |
| `check_run` | version\_id, check\_id, severity, passed, auto\_fixed, message | From the editor |
| `event` | actor\_id, kind, target\_kind, target\_id, payload JSONB | Feeds the board and the log |

Indexes: `version (part_id, created_at desc)`, `event (project_id, created_at desc)`, `chunk (blake3)` unique, `lock (part_id)` unique, `presence (project_id)`.

Derived, never stored: asset state (Locked, Draft, Ready, Approved, Complete) from its parts; gate open or closed from the states of the named parts.

## The mirror

&#91;embedded content: the mirror · 6 steps, 2 time budgets\]

**Step 2 in detail.** The add-on keeps a hash per object in the part's collection (mesh data hash, material slots, transform). On `save_post` it compares to the last save. If nothing in the part changed, it posts `saved` with `changed: false` and stops; the version still records. If something changed, it runs the collection's attached glTF exporter to `spool/<part_id>/<version_ulid>.glb` and writes `manifest.json`: objects, triangle counts, materials, bounds, armature name, and the hash table. Budget: 3 seconds for a 100k triangle character.

**Step 4 in detail.** The agent calls the Remote Control API on `localhost:30010` with a Python snippet: build an `AssetImportTask` with `replace_existing = True`, `automated = True`, `save = True`, `destination_path` from the part mapping, and an `FbxImportUI` or glTF import options that pass the existing skeleton and `physics_asset`. On first import only, set all options and store them on the asset. Then refresh the Content Browser and mark the package dirty. Budget: 7 seconds. Measure on the real Rising Sun character in week 1; if it is over, split the texture upload from the mesh import.

**First import vs reimport.** First import creates the asset at the mapped path with full options. Every later mirror is a reimport onto that asset. Options do not change on reimport; if the template changes options, the agent deletes and re-creates the asset and logs it.

**MetaHuman rule.** For a part mapped to a MetaHuman face, the DNA asset and its user data on the mesh are never removed. A check blocks any mirror that would.

**Failure.** UE5 closed: the agent keeps the newest pending mirror per part and runs it when the Remote Control API answers. Import error: the result carries the UE5 log line, both panels show it in one line, the version still exists. Three failures in a row on one part: the agent stops mirroring that part and shows a Retry.

## Protocols

All JSON. All versioned with a `v` field. Defined once in `shared/` and generated into Python and TypeScript types.

**Agent local API, `http://localhost:7420`, loopback only, token in a file the editors read**

| Method | Path | From | Does |
| --- | --- | --- | --- |
| GET | `/me` | editors | Current user, project, package version |
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

One call: `PUT /remote/object/call` on the Python command subsystem with a snippet from `ue5-plugin/scripts/`. The snippets are files, not strings in Rust: `import_part.py`, `scan_refs.py`, `refresh.py`, `draw_pins.py`. The agent sends arguments as JSON. Results come back as JSON in the Python stdout.

**Server REST, `https://api.<domain>`**

`/auth/magic-link`, `/projects`, `/projects/:id/templates`, `/assets`, `/parts`, `/parts/:id/versions`, `/parts/:id/lock` (POST acquire, DELETE release, PUT heartbeat), `/comments`, `/reviews`, `/events?since=`, `/files/upload-urls` (returns signed PUT URLs for missing chunk hashes), `/files/download-urls`, `/export/:asset_id`.

The server enforces the role on every mutating route. A viewer gets 403 on lock, publish, review, rollback, gate, template, and project export routes. Comments are allowed. A single asset export as images and glTF is allowed.

**Server WebSocket, `wss://api.<domain>/ws?project=`**

Server to client events: `presence.changed`, `lock.granted`, `lock.released`, `lock.requested` (someone asked the holder), `version.created`, `mirror.result`, `part.state`, `comment.created`, `review.decided`, `gate.opened`. Client to server: `presence.heartbeat`, `lock.request`, `lock.release`. Every event carries `project_id`, `actor_id`, `at`. The agent re-syncs with `/events?since=` after a reconnect, so a missed socket event is never lost.

## Storage and sync

**Index.** The agent keeps SQLite at `~/.nkata/<project>/index.db`: path, size, mtime, blake3, chunk list, last synced version. The index is the truth about local state. The OS watcher only wakes a rescan of the folder it reports. Full rescan on start and every 10 minutes. A rescan reads mtime and size first and hashes only files that changed.

**Chunking.** Content-defined chunking (FastCDC), target 2 MB, min 512 KB, max 8 MB, so an edit in the middle of a 400 MB `.blend` moves a few chunks, not the file. Hash with BLAKE3. A `file_version` is the ordered list of chunk hashes. Dedupe is per studio.

**Upload.** The agent asks the server which hashes are missing (`/files/upload-urls` with the list), gets signed PUT URLs for those only, and uploads in parallel, 4 at a time, resumable. Then it posts the `file_version`. The server never proxies bytes.

**Download.** On open of a part whose file is behind, the agent fetches missing chunks with signed GET URLs and assembles the file to a temp path, then renames into place. Blender and UE5 never see a half-written file.

**Ignore rules.** The template lists what to track. Defaults: `.blend`, `.blend1` ignored, `.uasset`, `.umap`, textures, `.wav`, `.md`, `.json` in the project; UE5 `Saved/`, `Intermediate/`, `DerivedDataCache/`, `Binaries/` ignored. A `.nkataignore` file in the project adds to this.

**Offline.** Every write the agent would send is a row in a local queue table. Online, the queue drains in order. Offline, the artist keeps editing parts they already hold; opening a new part fails with "offline, lock not available". Presence shows "offline since".

**Spool.** `~/.nkata/<project>/spool/<part_id>/` holds exports for the mirror and the UE5 import log. Kept for 7 days then pruned.

**Export.** `/export/:asset_id` returns a signed zip, or the agent builds it locally from the index: plain files plus `manifest.json` with parts, owners, states, versions, and comments. Works with no server.

**Stream mode.** A viewer agent runs in stream mode. No index, no watcher, no upload. It downloads previews and single files on demand through `/files/download-urls` into a cache at `~/.nkata/<project>/cache/`, capped at 5 GB, least recently used evicted first.

**Numbers to hold.** 20 GB project, 40k files: first full sync under 30 minutes on 100 Mbps; rescan under 20 seconds; a 400 MB `.blend` save uploads under 20 MB on a typical edit.

## Locks, presence, gates, state

&#91;embedded content: part state machine · 4 states, 5 transitions\]

**State is on the part, set only by the server.** Draft is where saves and mirrors happen. Ready is the review queue. Approved is read-only for everyone but an art director or producer. Locked means a gate is closed; nothing can open the part. The editor lock (who is editing now) is separate from the state and lives in the `lock` table.

**Lock grant.** `POST /parts/:id/lock`. Granted if no row exists or the row has expired. Returns the holder otherwise. The agent requests on part open and releases on close or Publish. Heartbeat every 15 s via WebSocket; the server marks a lock stale after 2 minutes with no heartbeat and shows it as stale; it expires after 12 hours idle. A holder can hand off; a producer can break a lock, logged. An Approved part grants a lock only to an art director or producer.

**Request unlock.** A second person opening a held part sends `lock.requested`. The holder's panel shows the name and a one-click release. Discord DM as a fallback after 60 s.

**Presence.** Heartbeat carries `part_id` or null. Server keeps an in-memory map per project and fans out `presence.changed` on any change. Clients drop a user after 45 s silence. Shown as faces on parts and in the board.

**Gates.** A gate is `{after: [part_name, ...]}` on the part, copied from the template at asset creation. The server evaluates on every `review.decided`: if all named parts are Approved, the part moves Locked to Draft, emits `gate.opened`, and posts to Discord. Removing a gate sets `after: []` on that asset only and writes an event.

**Mark Ready.** By the owner from Publish, or by an art director or producer from the app. Send back sets Draft and notifies. Approve writes a `review` row, sets Approved, releases the lock, and re-evaluates every gate that names this part.

## Checks, pins, templates

**Checks.** A check is a JSON contract in `shared/checks/<id>.json`: `id`, `title`, `severity` (block or warn), `auto_fix` (true or false), `params` schema, `applies_to` (blender, ue5, file). Each has a Python implementation in `blender-addon/checks/` or `ue5-plugin/scripts/checks/`, and a TypeScript one in `desktop/` for file checks. The template lists which checks run on which part, with params. The editor runs them on Publish, applies auto-fixes, posts results. Shipped v1 checks: `unit_scale` (fix), `name_pattern` (fix), `triangle_budget`, `lod_count`, `collision_present`, `uv_set_present`, `texture_size`, `rig_bone_names`, `rig_bone_count`, `metahuman_dna_present`.

**Comment pins.** `{part_id, version_id, point, normal, body}`, point and normal in the part's local space at that version. Blender draws pins with a `gpu` module overlay in the 3D viewport and a click handler on the N-panel list. UE5 draws them with a small C++ `FEditorViewportClient` extension; until that module exists, the Editor Utility Widget lists pins and frames the camera on click. The app draws them on the glTF preview with three.js. A pin on an old version still draws on new versions by point; if the point is more than 5 cm from any surface it shows as detached.

**Templates.** One file per template at `<project>/.nkata/templates/<name>.json`, validated against `shared/template.schema.json`. The server caches it in the `template` row on every change. Shape:

```json
{
  "v": 1,
  "name": "Character",
  "parts": [
    {"name": "concept", "mapping": "file", "checks": ["texture_size"]},
    {"name": "face", "mapping": "blend_collection", "gate": [], "checks": ["unit_scale", "name_pattern", "triangle_budget", "uv_set_present"], "params": {"triangle_budget": 60000}},
    {"name": "cloth", "mapping": "blend_collection", "gate": [], "checks": ["unit_scale", "name_pattern", "triangle_budget"]},
    {"name": "hair", "mapping": "blend_collection", "gate": [], "checks": ["unit_scale", "name_pattern"]},
    {"name": "textures", "mapping": "file", "gate": ["face", "cloth", "hair"], "checks": ["texture_size", "name_pattern"]},
    {"name": "rig", "mapping": "blend_collection", "gate": ["textures"], "checks": ["rig_bone_names", "rig_bone_count", "metahuman_dna_present"]},
    {"name": "lookdev", "mapping": "ue_asset", "gate": ["rig"], "checks": ["lod_count", "collision_present"]},
    {"name": "animation", "mapping": "ue_asset", "gate": ["lookdev"], "checks": []},
    {"name": "sound", "mapping": "file", "gate": ["lookdev"], "checks": []}
  ],
  "reference_slots": ["concept_sheet", "style_guide", "color_scheme"],
  "export": {"ue_path": "/Game/Characters/{asset}/{part}", "name": "SK_{asset}_{part}"},
  "blend_layout": "one_file_per_part"
}
```

`blend_layout: one_file_per_part` means `face.blend`, `cloth.blend`, and so on, each with its part as the top collection with a glTF collection exporter attached. The published `<asset>.blend` is assembled by the Asset Pipeline merge model, run by the agent on Approve.

## Build order

No dates. Order is fixed. Nothing starts until the gate before it passes.

| Step | Build | Gate |
| --- | --- | --- |
| 0. Measure | Reimport the real Rising Sun character into UE5 from Python with materials and physics kept. Export one collection from its `.blend` with a collection exporter. Time both | Both work. Both numbers written down |
| 1. Mirror | Blender save hook, object hashing, collection export, spool. Agent skeleton with `/parts/:id/saved` and the UE5 import snippet over Remote Control. Both panels show mirror status | One artist saves 20 times in a day and sees UE5 update each time, p95 under 10 s |
| 2. Core | `shared` schemas. Server: auth, projects, assets, parts, versions, events, WebSocket. Postgres. Store with signed URLs. Agent: index, FastCDC chunking, upload, download, queue | A 2 GB folder syncs to a second machine. An edit moves only changed chunks |
| 3. Parts and locks | Templates, asset creation, part mapping, locks, presence, Publish, checks in both editors | Second artist installs and opens the project in under 5 minutes. Two parts on one asset, no overwrite |
| 4. Review | Ready queue, pins in UE5 widget and Blender overlay and app preview, score, approve, send back, gates, Discord and Linear hooks | Ojukwu goes from template to Approved |
| 5. Board | Board, asset, part, review queue, person, settings, setup screens. Export | The producer answers who, what, and what is stuck from one screen |
| 6. P1 | Dependency map, editor builds, string tables, Asset Pipeline merge on Approve, C++ pin module | As each lands |

If step 0 fails on the physics or materials, the fallback is Interchange with a custom Python pipeline. If step 1 misses 10 s, split texture import from mesh import before anything else changes.

## Dev environment

- `make dev` starts Postgres, MinIO, and the server in Docker, seeds one studio, one project, the Character template, and the Ojukwu asset.
- `make desktop` runs the Tauri app against the local server.
- `make addon` symlinks `blender-addon/` into the Blender extensions folder; reload with F3 "Reload Scripts".
- `make ue` symlinks `ue5-plugin/` into a test project's `Plugins/`; the Python side needs no build. The C++ module builds with Live Coding.
- One prebuilt UE 5.4 editor from the Epic launcher. No engine source build.
- Secrets in `.env`, never in the repo. Discord and Linear tokens per studio in the `project` row, encrypted.

## Testing

- `shared`: schema tests, protocol round-trips Python to TypeScript.
- `server`: unit tests on lock grant, gate evaluation, state transitions, chunk dedupe. Integration tests against Docker Postgres and MinIO. One test signs in with a viewer token and asserts 403 on each mutating route and 201 on comments.
- `desktop`: Rust unit tests for FastCDC, index rescan, queue drain. Fixture folder of 40k small files for the rescan budget.
- `blender-addon`: tests run in `blender --background --python` against fixture `.blend` files. Hashing, changed-object detection, exporter trigger, check results.
- `ue5-plugin`: tests run with `UnrealEditor-Cmd -run=pythonscript` against a fixture project. Import, reimport, materials kept, reference scan.
- `e2e`: one script on a machine with both editors. Save in Blender, assert the UE5 asset changed, assert the version row, assert both panels. Runs before every release.
- Release gate: all of the above green, plus the step gates above, plus one hour of real use by the artist with no blocking bug.

# Step 2: Core

Work on main. Push after every green `make test`. Open a PR only if you are blocked or the gate fails.

Read CLAUDE.md, docs/product.md, docs/engineering.md first. This is the first code in the repo, so you also create the monorepo layout.

## Gate

A 2 GB folder syncs from one agent to a second agent through the server and store. An edit to one file moves only its changed chunks. Proven by an integration test with two agent instances against Docker Postgres and MinIO. The test runs in `make test` with no editor installed.

## Build, in this order

1. Monorepo. pnpm workspace with `shared/`, `server/`, `desktop/`. Cargo workspace with `desktop/src-tauri`. Empty `blender-addon/` and `ue5-plugin/` with a README each. `infra/docker-compose.yml` with Postgres 16 and MinIO. `make dev`, `make test`, `make hooks` work.
2. `shared/`. JSON Schemas and Zod for: template (docs/engineering.md, Templates), agent protocol (every route in the Agent local API table), server events (every WebSocket event name), check contract. A `generate` script writes Python dataclasses to `shared/py/` and TypeScript to `shared/ts/`. Round-trip tests.
3. `server/`. Fastify 5, Drizzle, Postgres. Tables exactly as docs/engineering.md Data model. Magic link auth (dev mode prints the link). REST routes listed under Server REST. WebSocket with the listed events. Lock grant with heartbeat and expiry. Gate evaluation on review. `/files/upload-urls` and `/files/download-urls` with presigned MinIO URLs. `/events?since=`. Seed script: one studio, one project, the Character template, the Ojukwu asset with its parts.
4. `desktop/src-tauri` agent core, Rust, as a library crate with a CLI binary for tests. SQLite index. FastCDC chunking (2 MB target, 512 KB min, 8 MB max) with BLAKE3. Rescan with mtime and size first, hash only changed files. `notify` watcher that only wakes a folder rescan. Upload of missing chunks, 4 parallel, resumable. Download and assemble to temp then rename. Local queue table that drains in order. No Tauri window yet.
5. Integration test for the gate. Two agent CLI instances, two temp folders, one server, one MinIO. Generate 2 GB of files. Sync. Edit one file in the middle. Assert chunk count moved.

## Not in this step

No UI. No Blender. No UE5. No Discord or Linear. No mirror. Those are steps 1, 3, 4, 5.

## Done means

The gate test is green in `make test`. Numbers (sync time, chunks moved on edit) are in docs/decisions.md with the date. Dependencies added are listed there with the why.

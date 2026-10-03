# Nkata

Nkata is a desktop app plus a Blender add-on and a UE5 plugin. Game teams work on one project as assets made of parts. Every Blender save mirrors into UE5 in seconds. Presence, locks, checks, review on the model in the engine, one project view. Real files you keep.

## Read first

- docs/product.md: what we build and why.
- docs/engineering.md: how we build it.
- docs/tasks/: one file per build step.
- docs/decisions.md: small decisions made during a step.
- CLAUDE.md: how to work in this repo.

## Layout

| Folder | What it is |
| --- | --- |
| `shared/` | JSON Schemas for every protocol type. Generated Zod in `ts/`, Python dataclasses in `py/`. |
| `server/` | Fastify 5, Drizzle, Postgres 16. REST, WebSocket, auth, locks, signed store URLs. |
| `desktop/` | Tauri 2 app. The agent core is a Rust crate in `src-tauri/` with a CLI for tests. |
| `blender-addon/` | Blender 4.2+ extension. Save hook, collection export, N-panel. |
| `ue5-plugin/` | UE 5.4+ Python scripts the agent runs over Remote Control. Import per kind, placement scan. |
| `fixtures/` | Test corpus: one rigged character, three props, one level area. Built by `fixtures/build.py`. |
| `e2e/` | Editor gates and the quality bar, marked `@needs_editor`. |
| `infra/` | Docker Compose with Postgres and MinIO. |

## Run

Needs Node 22, pnpm 10, Rust stable, Python 3.11, and Docker or local Postgres 16 and MinIO binaries.

```
pnpm install
make dev        # Postgres and MinIO in Docker
make test       # every package test plus the step gate, no editor needed
make hooks      # git hooks: make test before every push
```

`make test` brings up Postgres and MinIO with Docker, or with local binaries when Docker is absent, starts a seeded server, and runs the sync gate between two agent instances. Copy `.env.example` to `.env` to run the server by hand with `pnpm --filter @nkata/server dev`.

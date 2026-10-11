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
| `desktop/` | Tauri 2 app. The agent core is a Rust crate in `src-tauri/` with a CLI for tests; the window runs it in process. A viewer runs it in stream mode: no folder, a 5 GB cache. |
| `blender-addon/` | Blender 4.2+ extension. Save hook, collection export, the N-panel with checks, pins, Publish, and presence. |
| `ue5-plugin/` | UE 5.4+ Python scripts the agent runs over Remote Control, and the panel model the Editor Utility Widget draws. |
| `fixtures/` | Test corpus: one rigged character, three props, one level area. Built by `fixtures/build.py`. |
| `e2e/` | Editor gates and the quality bar, marked `@needs_editor`. |
| `infra/` | Docker Compose with Postgres and RustFS, the S3 store. |

## Run

Needs Node 22, pnpm 10, Rust stable, Python 3.11, and Docker or local Postgres 16 and RustFS binaries (https://docs.rustfs.com/installation/linux.html, or a MinIO binary you already have).

```
pnpm install
make dev        # Postgres and RustFS in Docker. Port taken? NKATA_PG_PORT=5433 make dev
make test       # every package test plus the step gate, no editor needed
make hooks      # git hooks: make test before every push
```

`make test` brings up Postgres and the S3 store with Docker, or with local binaries when Docker is absent, starts a seeded server, and runs the sync gate between two agent instances. Copy `.env.example` to `.env` to run the server by hand with `pnpm --filter @nkata/server dev`.

## Run the app against a local server

```
make dev                                   # Postgres, RustFS
cp .env.example .env                       # once; the server reads .env from the repo root
pnpm --filter @nkata/server db:reset       # an empty database; add "&& pnpm --filter @nkata/server seed" for the Sunburst demo content
pnpm --filter @nkata/server dev            # NKATA_DEV=1 in .env: the sign in code comes back in the response
cd desktop && pnpm tauri dev               # sign in with your own email, name yourself, create your studio
```

The app opens on Sign in. Any email gets an account: the first run is Sign in, the six digit code from the email, Name, Create studio, then an empty Welcome. In dev mode the server hands the code back, so the field is already filled. To send real email, set `RESEND_API_KEY` and `MAIL_FROM` in `.env` (see `.env.example`); the same two send the studio and project invites. Outside dev mode they are required. A producer creates a project (name, folder, the Blender and Unreal versions found on the machine), and the window starts the agent for that folder. Connections lists the editors found on this computer; Connect installs the Blender add-on and, for the Unreal project inside the folder, the plugin with Python and Remote Control on. Blender finds the agent on `localhost:7420`; with no file open, the N-panel lists your parts to start and saves the file in the right place. A viewer (viewer@sunburst.gg) signs in the same way and gets stream mode with no folder. The browser preview (`pnpm dev`) runs on the in-memory mock; `window.__nkata` takes the prototype's Tweaks (demo stage, role, theme) for screenshots. `make addon` and `make ue` are the developer shortcuts for the same install. `DISCORD_SECRET` in the server environment turns on the one Discord message; set the webhook under Settings.

## Status

Steps 2 to 5 are code complete and green in `make test` without an editor. What still needs a machine with Blender 4.2 and UE 5.4: the mirror gates (`e2e/mirror.py`, `e2e/environment.py`), the quality bar (`e2e/quality.py`), the Editor Utility Widget asset (`ue5-plugin/README.md`), and the install time. See docs/decisions.md, open questions.


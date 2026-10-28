# Nkata

Nkata is a desktop app, a Blender add-on and a UE5 plugin. A game team works on one project as assets made of parts. Every Blender save is a version the team can see, review and open. Presence, locks, checks, a note on every publish, review on the model. Real files you keep.

The Blender to Unreal mirror is built behind `UNREAL_ENABLED` and shows as Coming soon until it ships.

## Download

- macOS (Apple silicon and Intel): https://nkata-downloads-445567075963.s3.ap-northeast-1.amazonaws.com/latest/Nkata-mac.dmg
- Windows: https://nkata-downloads-445567075963.s3.ap-northeast-1.amazonaws.com/latest/Nkata-windows-setup.exe

Installed apps update themselves. The builds are unsigned for now, so macOS asks to allow the app under Privacy and Security, and Windows SmartScreen warns once.

## Read first

- `CLAUDE.md`: how to work in this repo.
- `docs/product.md`: what we build and why.
- `docs/engineering.md`: how we build it.
- `docs/tasks/`: one file per build step.
- `docs/decisions.md`: decisions made along the way.
- `docs/deploy.md`: the server on AWS and the release of the desktop app.

## Layout

| Folder | What it is |
| --- | --- |
| `shared/` | JSON Schemas for every protocol type, generated into TypeScript and Python. |
| `server/` | Fastify 5, Drizzle, Postgres 16. REST, WebSocket, auth, locks, signed store links. |
| `desktop/` | Tauri 2 app. The agent core is the Rust crate in `src-tauri/`, with a CLI for tests. |
| `blender-addon/` | Blender 4.2+ extension: save hook, export, the N-panel with checks, pins and Publish. |
| `ue5-plugin/` | UE 5.4+ Python scripts the agent runs over Remote Control. |
| `fixtures/` | Test corpus: one rigged character, three props, one level area. |
| `e2e/` | Editor gates and the quality bar, marked `@needs_editor`. |
| `infra/` | Docker Compose for local Postgres and the S3 store. AWS templates in `infra/aws/`. |
| `scripts/` | Test, deploy and release scripts. |

## Run locally

Needs Node 22, pnpm 10, Rust stable, Python 3.11, and Docker (or local Postgres 16 and RustFS binaries).

```
pnpm install
make hooks                                  # make test before every push
make test                                   # every package test plus the gates, no editor needed
```

The app against a local server:

```
make dev                                    # Postgres and the store in Docker
cp .env.example .env                        # once. NKATA_DEV=1 hands the sign in code back
pnpm --filter @nkata/server db:reset        # add "&& pnpm --filter @nkata/server seed" for demo content
pnpm --filter @nkata/server dev
cd desktop && pnpm tauri dev
```

Sign in with any email. In dev mode the code comes back in the response, so the field fills itself. Set `RESEND_API_KEY` and `MAIL_FROM` in `.env` only to test real email: the dev server then sends to every address you sign in with. `make test` never sends.

More detail per package: `desktop/README.md`, `blender-addon/README.md`, `ue5-plugin/README.md`, `shared/README.md`, `e2e/README.md`.

## Release

Bump the version in `Cargo.toml` (workspace) and `desktop/src-tauri/tauri.conf.json`, then tag `vX.Y.Z` and push the tag. `.github/workflows/desktop-build.yml` builds both installers and publishes them, and installed apps pick the update up within six hours. The server deploys with `./scripts/aws-deploy.sh deploy`. See `docs/deploy.md`.

## Still needs an editor

The mirror gates, the quality bar and the Editor Utility Widget need a machine with Blender 4.2 and UE 5.4. They run with `UNREAL_ENABLED=1`. Open questions are in `docs/decisions.md`.

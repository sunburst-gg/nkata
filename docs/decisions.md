# Decisions

Append one line per decision: date, what, why, alternative rejected.
- 2026-10-01: Cloud sessions push to the session branch and `.github/workflows/ff-main.yml` fast-forwards main when `make test` is green. Terminal sessions push to main directly. Why: the harness owns the branch name in cloud sessions. Rejected: force-pushing main from a cloud session.
- 2026-10-01: `make test` falls back to local Postgres and MinIO binaries when Docker is absent (scripts/testenv.sh). Why: cloud sessions have no Docker daemon. Rejected: skipping the gate test without Docker, which would let the gate go untested.
- 2026-10-01: Dependency: zod 4 in shared. Why: CLAUDE.md names it, and Zod 4 ships z.strictObject and z.discriminatedUnion. Rejected: valibot.
- 2026-10-01: Dependency (dev): ajv 8 and ajv-formats in shared. Why: validates the JSON Schema files themselves and gives a third, independent validator in the round-trip test. Rejected: trusting the Zod output alone.
- 2026-10-01: Dependency (dev): typescript 5.9, vitest 3, tsx 4 at the workspace root. Why: CLAUDE.md pins TypeScript 5; vitest runs ESM TypeScript with no build step; tsx runs scripts and the server in dev. Rejected: jest and ts-node, both need extra ESM config.
- 2026-10-01: JSON Schema is the source of truth and the generator is in-repo (shared/src/emit-*.ts) for a documented subset. Why: CLAUDE.md says protocol types live as JSON Schema; the subset is small and a hand-written emitter has no dependency. Rejected: json-schema-to-zod and datamodel-code-generator, two more dependencies for the same output.
- 2026-10-01: Python generated package is `shared/py/` as the task says; the Blender add-on and UE5 plugin will vendor it under the name `nkata_shared`. Why: `py` is a poor import name outside tests. Rejected: renaming the folder, which the task file fixes.

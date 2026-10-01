#!/usr/bin/env bash
# `make test`. Runs every package test plus the step gate with no editor installed.
# 1. Postgres and MinIO (scripts/testenv.sh).
# 2. pnpm -r test: shared schema round-trips, server unit and integration tests.
# 3. cargo test --workspace: agent unit tests and the sync gate against a live server.
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

cleanup() {
  if [[ -n "${SERVER_PID:-}" ]]; then kill "$SERVER_PID" 2>/dev/null || true; fi
  ./scripts/testenv.sh down
}
trap cleanup EXIT

set -a
source ./scripts/testenv.sh up
set +a

pnpm -r test

cargo test --workspace

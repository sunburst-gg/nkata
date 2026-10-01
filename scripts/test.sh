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

pnpm -r typecheck
pnpm -r test

# The gate test needs a live server over the same Postgres and MinIO, seeded from a clean schema.
# The server tests leave their last fixtures behind and the seed finds rows by name.
export NKATA_DEV=1
export PORT="${TEST_SERVER_PORT:-7401}"
export PUBLIC_URL="http://127.0.0.1:$PORT"
export LOG_LEVEL=warn
pnpm --filter @nkata/server db:reset >/dev/null
pnpm --filter @nkata/server seed >/dev/null
pnpm --filter @nkata/server start >"$ROOT/.testenv/server.log" 2>&1 &
SERVER_PID=$!
for _ in $(seq 1 100); do
  if curl -sf "http://127.0.0.1:$PORT/health" >/dev/null; then break; fi
  sleep 0.2
done
curl -sf "http://127.0.0.1:$PORT/health" >/dev/null || { echo "server did not start" >&2; cat "$ROOT/.testenv/server.log" >&2; exit 1; }
export NKATA_TEST_SERVER_URL="http://127.0.0.1:$PORT"
export NKATA_GATE_REPORT="$ROOT/.testenv/gate-report.json"

cargo fmt --all -- --check
cargo clippy --workspace --all-targets -- -D warnings
cargo test --workspace

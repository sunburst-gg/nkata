#!/usr/bin/env bash
# Brings up Postgres 16 and an S3 store for tests and exports their URLs.
# Order of preference:
#   1. DATABASE_URL and S3_ENDPOINT already set: use them as they are.
#   2. Docker available: infra/docker-compose.yml.
#   3. Local binaries: initdb/pg_ctl and a rustfs or minio binary on PATH or in ~/go/bin.
#      RustFS is the store since MinIO stopped shipping binaries (docs/decisions.md, 2026-10-09).
#      https://docs.rustfs.com/installation/linux.html
# Usage: source scripts/testenv.sh up   |   scripts/testenv.sh down
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENV_DIR="$ROOT/.testenv"
STATE_FILE="$ENV_DIR/state"

testenv_up() {
  if [[ -n "${DATABASE_URL:-}" && -n "${S3_ENDPOINT:-}" ]]; then
    echo "testenv: using DATABASE_URL and S3_ENDPOINT from the environment" >&2
    echo "external" > "$STATE_FILE"
    return 0
  fi

  mkdir -p "$ENV_DIR"
  export S3_REGION="${S3_REGION:-us-east-1}"
  export S3_BUCKET="${S3_BUCKET:-nkata-test}"
  export S3_ACCESS_KEY="${S3_ACCESS_KEY:-nkata}"
  export S3_SECRET_KEY="${S3_SECRET_KEY:-nkata-dev-secret}"

  if docker info >/dev/null 2>&1; then
    echo "testenv: starting Postgres and RustFS with Docker" >&2
    docker compose -f "$ROOT/infra/docker-compose.yml" up -d --wait
    export DATABASE_URL="postgres://nkata:nkata@localhost:5432/nkata"
    export S3_ENDPOINT="http://localhost:9000"
    echo "docker" > "$STATE_FILE"
    return 0
  fi

  echo "testenv: Docker not available, using local Postgres and store binaries" >&2
  local PG_BIN
  PG_BIN="$(dirname "$(command -v pg_ctl 2>/dev/null || ls /usr/lib/postgresql/16/bin/pg_ctl)")"
  local PGDATA="$ENV_DIR/pg"
  local PGPORT="${TEST_PG_PORT:-54329}"
  # Postgres refuses to run as root. In a root container, run it as the postgres user.
  local AS_PG=()
  if [[ "$(id -u)" == "0" ]]; then
    AS_PG=(runuser -u postgres --)
    mkdir -p "$PGDATA"
    chown postgres:postgres "$PGDATA" "$ENV_DIR"
  fi
  if [[ ! -f "$PGDATA/PG_VERSION" ]]; then
    "${AS_PG[@]}" "$PG_BIN/initdb" -D "$PGDATA" -U nkata --auth=trust -E UTF8 >"$ENV_DIR/initdb.log" 2>&1
  fi
  "${AS_PG[@]}" "$PG_BIN/pg_ctl" -D "$PGDATA" -o "-p $PGPORT -c listen_addresses=127.0.0.1 -c fsync=off -c synchronous_commit=off -c full_page_writes=off" -l "$ENV_DIR/pg.log" -w start >/dev/null
  "$PG_BIN/psql" -h 127.0.0.1 -p "$PGPORT" -U nkata -d postgres -tc "SELECT 1 FROM pg_database WHERE datname='nkata'" | grep -q 1 \
    || "$PG_BIN/createdb" -h 127.0.0.1 -p "$PGPORT" -U nkata nkata
  export DATABASE_URL="postgres://nkata@127.0.0.1:$PGPORT/nkata"

  # The store: rustfs first, then a minio binary already on the machine. Same keys, same S3 API.
  local STORE_BIN STORE_KIND HEALTH
  if STORE_BIN="$(command -v rustfs 2>/dev/null)" || [[ -x "$HOME/go/bin/rustfs" ]]; then
    STORE_BIN="${STORE_BIN:-$HOME/go/bin/rustfs}"
    STORE_KIND=rustfs
    HEALTH="/health"
  elif STORE_BIN="$(command -v minio 2>/dev/null)" || [[ -x "$HOME/go/bin/minio" ]]; then
    STORE_BIN="${STORE_BIN:-$HOME/go/bin/minio}"
    STORE_KIND=minio
    HEALTH="/minio/health/live"
  else
    echo "testenv: no rustfs or minio binary found. Install Docker or put rustfs on PATH." >&2
    return 1
  fi
  local STORE_PORT="${TEST_STORE_PORT:-${TEST_MINIO_PORT:-9100}}"
  rm -rf "$ENV_DIR/store-data"
  mkdir -p "$ENV_DIR/store-data"
  if [[ "$STORE_KIND" == rustfs ]]; then
    RUSTFS_ACCESS_KEY="$S3_ACCESS_KEY" RUSTFS_SECRET_KEY="$S3_SECRET_KEY" RUSTFS_CONSOLE_ENABLE=false \
      nohup "$STORE_BIN" server "$ENV_DIR/store-data" --address "127.0.0.1:$STORE_PORT" \
      >"$ENV_DIR/store.log" 2>&1 &
  else
    MINIO_ROOT_USER="$S3_ACCESS_KEY" MINIO_ROOT_PASSWORD="$S3_SECRET_KEY" \
      nohup "$STORE_BIN" server "$ENV_DIR/store-data" --address "127.0.0.1:$STORE_PORT" --console-address "127.0.0.1:0" \
      >"$ENV_DIR/store.log" 2>&1 &
  fi
  echo $! > "$ENV_DIR/store.pid"
  export S3_ENDPOINT="http://127.0.0.1:$STORE_PORT"
  for _ in $(seq 1 60); do
    if curl -sf "$S3_ENDPOINT$HEALTH" >/dev/null; then break; fi
    sleep 0.5
  done
  curl -sf "$S3_ENDPOINT$HEALTH" >/dev/null || { echo "testenv: $STORE_KIND did not start" >&2; cat "$ENV_DIR/store.log" >&2; return 1; }
  echo "local" > "$STATE_FILE"
}

testenv_down() {
  local state
  state="$(cat "$STATE_FILE" 2>/dev/null || echo none)"
  case "$state" in
    docker)
      docker compose -f "$ROOT/infra/docker-compose.yml" down -v >/dev/null 2>&1 || true
      ;;
    local)
      if [[ -f "$ENV_DIR/store.pid" ]]; then kill "$(cat "$ENV_DIR/store.pid")" 2>/dev/null || true; rm -f "$ENV_DIR/store.pid"; fi
      local PG_BIN
      PG_BIN="$(dirname "$(command -v pg_ctl 2>/dev/null || ls /usr/lib/postgresql/16/bin/pg_ctl)")"
      local AS_PG=()
      if [[ "$(id -u)" == "0" ]]; then AS_PG=(runuser -u postgres --); fi
      "${AS_PG[@]}" "$PG_BIN/pg_ctl" -D "$ENV_DIR/pg" -m fast stop >/dev/null 2>&1 || true
      rm -rf "$ENV_DIR/store-data"
      ;;
  esac
  rm -f "$STATE_FILE"
}

case "${1:-}" in
  up) testenv_up ;;
  down) testenv_down ;;
  *) echo "usage: testenv.sh up|down" >&2; exit 2 ;;
esac

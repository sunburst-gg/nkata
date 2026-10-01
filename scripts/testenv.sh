#!/usr/bin/env bash
# Brings up Postgres 16 and MinIO for tests and exports their URLs.
# Order of preference:
#   1. DATABASE_URL and S3_ENDPOINT already set: use them as they are.
#   2. Docker available: infra/docker-compose.yml.
#   3. Local binaries: initdb/pg_ctl and a minio binary on PATH or in ~/go/bin.
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
    echo "testenv: starting Postgres and MinIO with Docker" >&2
    docker compose -f "$ROOT/infra/docker-compose.yml" up -d --wait
    export DATABASE_URL="postgres://nkata:nkata@localhost:5432/nkata"
    export S3_ENDPOINT="http://localhost:9000"
    echo "docker" > "$STATE_FILE"
    return 0
  fi

  echo "testenv: Docker not available, using local Postgres and MinIO binaries" >&2
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

  local MINIO_BIN
  MINIO_BIN="$(command -v minio 2>/dev/null || echo "$HOME/go/bin/minio")"
  if [[ ! -x "$MINIO_BIN" ]]; then
    echo "testenv: no minio binary found. Install Docker or put minio on PATH." >&2
    return 1
  fi
  local MINIO_PORT="${TEST_MINIO_PORT:-9100}"
  rm -rf "$ENV_DIR/minio-data"
  mkdir -p "$ENV_DIR/minio-data"
  MINIO_ROOT_USER="$S3_ACCESS_KEY" MINIO_ROOT_PASSWORD="$S3_SECRET_KEY" \
    nohup "$MINIO_BIN" server "$ENV_DIR/minio-data" --address "127.0.0.1:$MINIO_PORT" --console-address "127.0.0.1:0" \
    >"$ENV_DIR/minio.log" 2>&1 &
  echo $! > "$ENV_DIR/minio.pid"
  export S3_ENDPOINT="http://127.0.0.1:$MINIO_PORT"
  for _ in $(seq 1 60); do
    if curl -sf "$S3_ENDPOINT/minio/health/live" >/dev/null; then break; fi
    sleep 0.5
  done
  curl -sf "$S3_ENDPOINT/minio/health/live" >/dev/null || { echo "testenv: minio did not start" >&2; cat "$ENV_DIR/minio.log" >&2; return 1; }
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
      if [[ -f "$ENV_DIR/minio.pid" ]]; then kill "$(cat "$ENV_DIR/minio.pid")" 2>/dev/null || true; rm -f "$ENV_DIR/minio.pid"; fi
      local PG_BIN
      PG_BIN="$(dirname "$(command -v pg_ctl 2>/dev/null || ls /usr/lib/postgresql/16/bin/pg_ctl)")"
      local AS_PG=()
      if [[ "$(id -u)" == "0" ]]; then AS_PG=(runuser -u postgres --); fi
      "${AS_PG[@]}" "$PG_BIN/pg_ctl" -D "$ENV_DIR/pg" -m fast stop >/dev/null 2>&1 || true
      rm -rf "$ENV_DIR/minio-data"
      ;;
  esac
  rm -f "$STATE_FILE"
}

case "${1:-}" in
  up) testenv_up ;;
  down) testenv_down ;;
  *) echo "usage: testenv.sh up|down" >&2; exit 2 ;;
esac

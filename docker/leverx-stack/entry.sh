#!/bin/bash
set -euo pipefail

INDEXER_PID=""
SERVER_PID=""

cleanup() {
  if [[ -n "${SERVER_PID}" ]]; then
    kill -TERM "${SERVER_PID}" 2>/dev/null || true
    wait "${SERVER_PID}" 2>/dev/null || true
  fi
  if [[ -n "${INDEXER_PID}" ]]; then
    kill -TERM "${INDEXER_PID}" 2>/dev/null || true
    wait "${INDEXER_PID}" 2>/dev/null || true
  fi
}
trap cleanup EXIT INT TERM

export RUST_BACKTRACE="${RUST_BACKTRACE:-1}"
export RUST_LOG="${RUST_LOG:-info}"

export DATABASE_URL="${DATABASE_URL:-postgres://leverx:leverx@postgres:5432/leverx_indexer}"
export INDEXER_DATABASE_URL="${INDEXER_DATABASE_URL:-${DATABASE_URL}}"

if command -v pg_isready >/dev/null 2>&1; then
  PGHOST="${PGHOST:-postgres}"
  PGPORT="${PGPORT:-5432}"
  PGUSER="${PGUSER:-leverx}"
  echo "waiting for postgres at ${PGHOST}:${PGPORT}..."
  until pg_isready -h "${PGHOST}" -p "${PGPORT}" -U "${PGUSER}" -q; do
    sleep 2
  done
fi

indexer_args=()
if [[ -n "${FIRST_CHECKPOINT:-}" ]]; then
  indexer_args+=(--first-checkpoint "${FIRST_CHECKPOINT}")
  echo "starting leverx-indexer from checkpoint ${FIRST_CHECKPOINT}..."
else
  echo "starting leverx-indexer..."
fi
/opt/mysten/bin/leverx-indexer "${indexer_args[@]}" &
INDEXER_PID=$!

METRICS_PORT="${METRICS_PORT:-9186}"
echo "waiting for indexer metrics on :${METRICS_PORT}..."
indexer_ready=false
for _ in $(seq 1 90); do
  if curl -sf "http://127.0.0.1:${METRICS_PORT}/metrics" -o /dev/null; then
    indexer_ready=true
    break
  fi
  if ! kill -0 "${INDEXER_PID}" 2>/dev/null; then
    echo "leverx-indexer exited during startup" >&2
    exit 1
  fi
  sleep 2
done
if [[ "${indexer_ready}" != true ]]; then
  echo "leverx-indexer did not become ready in time" >&2
  exit 1
fi

LEVERX_API_PORT="${LEVERX_API_PORT:-3100}"
echo "starting leverx-server on port ${LEVERX_API_PORT}..."
/opt/mysten/bin/leverx-server --port "${LEVERX_API_PORT}" &
SERVER_PID=$!

export INDEXER_URL="${INDEXER_URL:-http://127.0.0.1:${LEVERX_API_PORT:-3100}}"
echo "starting keeper on port ${PORT:-3001} (indexer ${INDEXER_URL})..."
cd /opt/leverx/keeper
node dist/main.js

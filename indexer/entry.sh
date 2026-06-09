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

export DATABASE_URL="${DATABASE_URL:?DATABASE_URL must be set}"
export INDEXER_DATABASE_URL="${INDEXER_DATABASE_URL:-${DATABASE_URL}}"

if command -v pg_isready >/dev/null 2>&1; then
  PGHOST="${PGHOST:-localhost}"
  PGPORT="${PGPORT:-5432}"
  PGUSER="${PGUSER:-postgres}"
  echo "waiting for postgres at ${PGHOST}:${PGPORT}..."
  until pg_isready -h "${PGHOST}" -p "${PGPORT}" -U "${PGUSER}" -q; do
    sleep 2
  done
fi

if [[ -n "${LEVERX_REGISTRY_ID:-}" ]] && command -v psql >/dev/null 2>&1; then
  echo "seeding protocol_settings if empty..."
  psql "${DATABASE_URL}" -v ON_ERROR_STOP=1 <<SQL
INSERT INTO protocol_settings (
  registry_id, vault_id, predict_id, fee_collector_id, trading_paused, updated_at_ms
)
SELECT
  '${LEVERX_REGISTRY_ID}',
  NULLIF('${LEVERX_VAULT_ID:-}', ''),
  NULLIF('${PREDICT_ID:-}', ''),
  NULLIF('${LEVERX_FEE_COLLECTOR_ID:-}', ''),
  false,
  (EXTRACT(EPOCH FROM NOW()) * 1000)::bigint
WHERE NOT EXISTS (SELECT 1 FROM protocol_settings LIMIT 1);
SQL
fi

if [[ -n "${LEVERX_REGISTRY_ID:-}" && -n "${QUOTE_TYPE:-}" ]] && command -v psql >/dev/null 2>&1; then
  coin_type="${QUOTE_TYPE}"
  collateral_decimals="${COLLATERAL_DECIMALS:-6}"
  collateral_max_ltv="${COLLATERAL_MAX_LTV_BPS:-9000}"
  collateral_liq_ltv="${COLLATERAL_LIQUIDATION_LTV_BPS:-9500}"
  collateral_max_conf="${COLLATERAL_MAX_CONF_BPS:-100}"
  echo "seeding collateral_assets if empty..."
  psql "${DATABASE_URL}" -v ON_ERROR_STOP=1 <<SQL
INSERT INTO collateral_assets (
  coin_type, registry_id, decimals, max_ltv_bps, liquidation_ltv_bps, max_conf_bps, updated_at_ms, event_digest
)
SELECT
  '${coin_type}',
  '${LEVERX_REGISTRY_ID}',
  ${collateral_decimals},
  ${collateral_max_ltv},
  ${collateral_liq_ltv},
  ${collateral_max_conf},
  (EXTRACT(EPOCH FROM NOW()) * 1000)::bigint,
  'bootstrap:collateral'
WHERE NOT EXISTS (SELECT 1 FROM collateral_assets LIMIT 1);
SQL
fi

indexer_args=()
if [[ -n "${REMOTE_STORE_URL:-}" ]]; then
  indexer_args+=(--remote-store-url "${REMOTE_STORE_URL}")
fi
if [[ -n "${STREAMING_URL:-}" ]]; then
  indexer_args+=(--streaming-url "${STREAMING_URL}")
fi
if [[ -n "${FIRST_CHECKPOINT:-}" ]]; then
  indexer_args+=(--first-checkpoint "${FIRST_CHECKPOINT}")
  echo "starting leverx-indexer from checkpoint ${FIRST_CHECKPOINT}..."
else
  echo "starting leverx-indexer..."
fi
/opt/leverx/bin/leverx-indexer "${indexer_args[@]}" &
INDEXER_PID=$!

METRICS_PORT="${METRICS_PORT:-9184}"
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
/opt/leverx/bin/leverx-server --port "${LEVERX_API_PORT}" &
SERVER_PID=$!
wait "${SERVER_PID}"

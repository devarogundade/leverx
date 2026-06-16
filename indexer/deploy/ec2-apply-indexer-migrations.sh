#!/usr/bin/env bash
set -euo pipefail
docker exec indexer-postgres-1 psql -U leverx -d leverx_indexer -c 'ALTER TABLE protocol_settings ADD COLUMN IF NOT EXISTS final_window_ms BIGINT;'
docker exec indexer-postgres-1 psql -U leverx -d leverx_indexer -c 'ALTER TABLE leveraged_positions ADD COLUMN IF NOT EXISTS peak_borrow_quote BIGINT;'
docker exec indexer-postgres-1 psql -U leverx -d leverx_indexer -c 'ALTER TABLE position_triggers ADD COLUMN IF NOT EXISTS slippage_bps INTEGER;'
echo "Schema patches applied."

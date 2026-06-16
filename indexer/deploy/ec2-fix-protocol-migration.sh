#!/usr/bin/env bash
set -euo pipefail
docker exec indexer-postgres-1 psql -U leverx -d leverx_indexer -c \
  'ALTER TABLE protocol_settings ADD COLUMN IF NOT EXISTS final_window_ms BIGINT;'
echo "=== /v1/protocol (indexer direct) ==="
curl -sf http://127.0.0.1:3100/v1/protocol | python3 -m json.tool | head -15
echo "=== /v1/protocol (keeper proxy) ==="
curl -sf http://127.0.0.1:3001/v1/protocol | python3 -m json.tool | head -15

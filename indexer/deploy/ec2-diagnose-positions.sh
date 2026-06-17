#!/usr/bin/env bash
set -euo pipefail
echo "=== open rows (any qty) ==="
docker exec indexer-postgres-1 psql -U leverx -d leverx_indexer -c \
  "SELECT position_key, account_id, status, open_quantity, margin_quote, borrow_quote, is_up, closed_at_ms
   FROM leveraged_positions WHERE status = 'open' ORDER BY opened_at_ms DESC LIMIT 20;"
echo "=== rows with margin but zero qty ==="
docker exec indexer-postgres-1 psql -U leverx -d leverx_indexer -c \
  "SELECT position_key, account_id, status, open_quantity, margin_quote, is_up, closed_at_ms
   FROM leveraged_positions WHERE margin_quote > 0 AND open_quantity = 0 ORDER BY opened_at_ms DESC LIMIT 20;"
echo "=== recent BTC-ish (is_up = false) ==="
docker exec indexer-postgres-1 psql -U leverx -d leverx_indexer -c \
  "SELECT position_key, account_id, status, open_quantity, margin_quote, is_up, closed_at_ms
   FROM leveraged_positions WHERE is_up = false ORDER BY opened_at_ms DESC LIMIT 10;"

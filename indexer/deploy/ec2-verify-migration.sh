#!/usr/bin/env bash
set -euo pipefail
echo "=== diesel migration ==="
docker exec indexer-postgres-1 psql -U leverx -d leverx_indexer -c \
  "SELECT version FROM __diesel_schema_migrations WHERE version LIKE '%repair_closed%';"
echo "=== leveraged_positions by status ==="
docker exec indexer-postgres-1 psql -U leverx -d leverx_indexer -c \
  "SELECT status, COUNT(*) AS rows, SUM(CASE WHEN open_quantity > 0 THEN 1 ELSE 0 END) AS with_qty FROM leveraged_positions GROUP BY status ORDER BY status;"
echo "=== open rows with qty > 0 (should be live positions only) ==="
docker exec indexer-postgres-1 psql -U leverx -d leverx_indexer -c \
  "SELECT COUNT(*) AS open_with_qty FROM leveraged_positions WHERE status = 'open' AND open_quantity > 0;"

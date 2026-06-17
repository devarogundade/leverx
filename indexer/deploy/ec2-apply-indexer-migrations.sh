#!/usr/bin/env bash
set -euo pipefail
docker exec indexer-postgres-1 psql -U leverx -d leverx_indexer -c 'ALTER TABLE protocol_settings ADD COLUMN IF NOT EXISTS final_window_ms BIGINT;'
docker exec indexer-postgres-1 psql -U leverx -d leverx_indexer -c 'ALTER TABLE leveraged_positions ADD COLUMN IF NOT EXISTS peak_borrow_quote BIGINT;'
docker exec indexer-postgres-1 psql -U leverx -d leverx_indexer -c 'ALTER TABLE position_triggers ADD COLUMN IF NOT EXISTS slippage_bps INTEGER;'
docker exec indexer-postgres-1 psql -U leverx -d leverx_indexer -c "
UPDATE leveraged_positions lp
SET
    close_debt_repaid = l.debt_repaid,
    close_interest_paid = GREATEST(
        l.debt_repaid - GREATEST(lp.peak_borrow_quote, lp.borrow_quote, 0),
        0
    )
FROM liquidations l
WHERE lp.position_key = l.position_key
  AND lp.account_id = l.account_id
  AND lp.status = 'liquidated'
  AND lp.close_debt_repaid = 0
  AND l.debt_repaid > 0
  AND l.event_kind IN ('liquidation', 'bad_debt');
"
# 20250617180000_repair_closed_open_quantity
docker exec indexer-postgres-1 psql -U leverx -d leverx_indexer -c "
UPDATE leveraged_positions
SET open_quantity = 0
WHERE status IN ('closed', 'settled', 'liquidated')
  AND open_quantity > 0;
"
docker exec indexer-postgres-1 psql -U leverx -d leverx_indexer -c "
UPDATE leveraged_positions AS lp
SET open_quantity = 0
FROM (
    SELECT DISTINCT ON (g.manager_id, g.market_key)
        g.manager_id,
        g.market_key,
        g.quantity
    FROM global_market_trades AS g
    WHERE g.trade_side = 'redeem'
      AND g.event_type IN ('PositionRedeemed', 'RangeRedeemed')
      AND COALESCE(g.is_settled, false) = true
    ORDER BY g.manager_id, g.market_key, g.timestamp_ms DESC
) AS sr
WHERE lp.position_key = sr.market_key
  AND lp.predict_manager_id = sr.manager_id
  AND lp.status IN ('settled', 'closed')
  AND lp.open_quantity > 0
  AND sr.quantity >= lp.open_quantity;
"
docker exec indexer-postgres-1 psql -U leverx -d leverx_indexer -c "
INSERT INTO __diesel_schema_migrations (version, run_on)
SELECT '20250617180000_repair_closed_open_quantity', NOW()
WHERE NOT EXISTS (
  SELECT 1 FROM __diesel_schema_migrations
  WHERE version = '20250617180000_repair_closed_open_quantity'
);
"
echo "Schema patches applied."

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
echo "Schema patches applied."

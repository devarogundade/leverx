-- open_quantity was incremented on checkpoint replay (no event idempotency) and could go negative
-- on over-close. Reconcile from the idempotent market_trades ledger (buy − sell per key).

WITH net AS (
    SELECT
        position_key,
        account_id,
        SUM(
            CASE
                WHEN side = 'buy' THEN quantity
                WHEN side = 'sell' THEN -quantity
                ELSE 0
            END
        ) AS net_qty
    FROM market_trades
    WHERE account_id IS NOT NULL
    GROUP BY position_key, account_id
)
UPDATE leveraged_positions AS lp
SET
    open_quantity = GREATEST(COALESCE(net.net_qty, 0), 0),
    status = CASE
        WHEN COALESCE(net.net_qty, 0) <= 0 AND lp.status = 'open' THEN 'closed'
        WHEN COALESCE(net.net_qty, 0) > 0 THEN 'open'
        ELSE lp.status
    END,
    closed_at_ms = CASE
        WHEN COALESCE(net.net_qty, 0) <= 0 AND lp.status = 'open' THEN COALESCE(lp.closed_at_ms, lp.opened_at_ms)
        WHEN COALESCE(net.net_qty, 0) > 0 THEN NULL
        ELSE lp.closed_at_ms
    END
FROM net
WHERE lp.position_key = net.position_key
  AND lp.account_id = net.account_id;

-- Rows with no trade history but inflated quantity (replay ghosts).
UPDATE leveraged_positions AS lp
SET
    open_quantity = 0,
    status = CASE WHEN lp.status = 'open' THEN 'closed' ELSE lp.status END,
    closed_at_ms = COALESCE(lp.closed_at_ms, lp.opened_at_ms)
WHERE lp.open_quantity > 0
  AND NOT EXISTS (
      SELECT 1
      FROM market_trades AS mt
      WHERE mt.position_key = lp.position_key
        AND mt.account_id = lp.account_id
  );

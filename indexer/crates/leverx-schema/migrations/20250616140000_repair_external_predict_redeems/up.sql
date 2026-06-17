-- Close open leveraged rows already fully redeemed via external deepbook_predict redeems
-- (permissionless bots) that were indexed in global_market_trades but never emitted
-- LeveragedPositionClosed.

WITH settled_redeems AS (
    SELECT DISTINCT ON (g.manager_id, g.market_key)
        g.manager_id,
        g.market_key,
        g.quantity,
        g.payout,
        g.bid_price,
        g.is_settled,
        g.timestamp_ms
    FROM global_market_trades AS g
    WHERE g.trade_side = 'redeem'
      AND g.event_type IN ('PositionRedeemed', 'RangeRedeemed')
      AND COALESCE(g.is_settled, false) = true
    ORDER BY g.manager_id, g.market_key, g.timestamp_ms DESC
)
UPDATE leveraged_positions AS lp
SET
    realized_payout = lp.realized_payout + COALESCE(sr.payout, 0),
    closing_mark = CASE
        WHEN sr.bid_price IS NOT NULL AND sr.bid_price > 0 THEN sr.bid_price
        WHEN COALESCE(sr.payout, 0) > 0 AND lp.open_quantity > 0 THEN
            ((lp.realized_payout + COALESCE(sr.payout, 0)) * 1000000000 + lp.open_quantity - 1)
            / lp.open_quantity
        ELSE lp.closing_mark
    END,
    status = 'settled',
    open_quantity = 0,
    closed_at_ms = COALESCE(lp.closed_at_ms, sr.timestamp_ms)
FROM settled_redeems AS sr
WHERE lp.position_key = sr.market_key
  AND lp.predict_manager_id = sr.manager_id
  AND lp.status = 'open'
  AND lp.open_quantity > 0
  AND sr.quantity >= lp.open_quantity;

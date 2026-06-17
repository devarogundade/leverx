-- Closed/settled rows kept a non-zero open_quantity after full redeem (handler bug).
UPDATE leveraged_positions
SET open_quantity = 0
WHERE status IN ('closed', 'settled', 'liquidated')
  AND open_quantity > 0;

-- External settled redeems from repair migration left open_quantity unchanged.
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

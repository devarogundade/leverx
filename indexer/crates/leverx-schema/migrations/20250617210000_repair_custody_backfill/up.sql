-- Backfill external redeem payouts and custody recovery totals for CTA hints.

WITH redeem_totals AS (
    SELECT
        g.manager_id,
        g.market_key,
        SUM(COALESCE(g.payout, 0)) AS total_payout
    FROM global_market_trades AS g
    WHERE g.trade_side = 'redeem'
      AND g.event_type IN ('PositionRedeemed', 'RangeRedeemed')
    GROUP BY g.manager_id, g.market_key
)
UPDATE leveraged_positions AS lp
SET
    external_redeem_payout_quote = GREATEST(lp.external_redeem_payout_quote, rt.total_payout),
    close_source = COALESCE(lp.close_source, 'predict_external'),
    leverx_custody_complete = CASE
        WHEN lp.leverx_custody_complete THEN true
        WHEN lp.close_source IN ('leverx_settle', 'leverx_redeem', 'stranded_recovery', 'liquidation') THEN true
        ELSE false
    END
FROM redeem_totals AS rt
WHERE lp.position_key = rt.market_key
  AND lp.predict_manager_id = rt.manager_id
  AND rt.total_payout > 0
  AND lp.external_redeem_payout_quote < rt.total_payout;

-- Repair rows closed by external settled redeems without custody columns.
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
    external_redeem_payout_quote = GREATEST(
        lp.external_redeem_payout_quote,
        COALESCE(sr.payout, 0)
    ),
    closing_mark = CASE
        WHEN sr.bid_price IS NOT NULL AND sr.bid_price > 0 THEN sr.bid_price
        WHEN COALESCE(sr.payout, 0) > 0 AND lp.open_quantity > 0 THEN
            ((lp.realized_payout + COALESCE(sr.payout, 0)) * 1000000000 + lp.open_quantity - 1)
            / lp.open_quantity
        ELSE lp.closing_mark
    END,
    status = 'settled',
    open_quantity = 0,
    closed_at_ms = COALESCE(lp.closed_at_ms, sr.timestamp_ms),
    close_source = COALESCE(lp.close_source, 'predict_external'),
    leverx_custody_complete = false
FROM settled_redeems AS sr
WHERE lp.position_key = sr.market_key
  AND lp.predict_manager_id = sr.manager_id
  AND lp.status = 'open'
  AND lp.open_quantity > 0
  AND sr.quantity >= lp.open_quantity;

-- Live (non-settled) external full redeems still open in index.
WITH live_redeems AS (
    SELECT DISTINCT ON (g.manager_id, g.market_key)
        g.manager_id,
        g.market_key,
        g.quantity,
        g.payout,
        g.bid_price,
        g.timestamp_ms
    FROM global_market_trades AS g
    WHERE g.trade_side = 'redeem'
      AND g.event_type IN ('PositionRedeemed', 'RangeRedeemed')
      AND COALESCE(g.is_settled, false) = false
    ORDER BY g.manager_id, g.market_key, g.timestamp_ms DESC
)
UPDATE leveraged_positions AS lp
SET
    realized_payout = lp.realized_payout + COALESCE(lr.payout, 0),
    external_redeem_payout_quote = GREATEST(
        lp.external_redeem_payout_quote,
        COALESCE(lr.payout, 0)
    ),
    closing_mark = CASE
        WHEN lr.bid_price IS NOT NULL AND lr.bid_price > 0 THEN lr.bid_price
        ELSE lp.closing_mark
    END,
    status = 'closed',
    open_quantity = 0,
    closed_at_ms = COALESCE(lp.closed_at_ms, lr.timestamp_ms),
    close_source = COALESCE(lp.close_source, 'predict_external'),
    leverx_custody_complete = false
FROM live_redeems AS lr
WHERE lp.position_key = lr.market_key
  AND lp.predict_manager_id = lr.manager_id
  AND lp.status = 'open'
  AND lp.open_quantity > 0
  AND lr.quantity >= lp.open_quantity;

-- Zero open_quantity on liquidated rows.
UPDATE leveraged_positions
SET open_quantity = 0
WHERE status = 'liquidated'
  AND open_quantity > 0;

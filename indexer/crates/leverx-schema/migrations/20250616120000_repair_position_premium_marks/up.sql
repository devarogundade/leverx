-- entry_mark was stored as limit/market ask instead of fill premium (mint_cost / qty).
-- closing_mark and trade premiums used payout / qty without the 1e9 Predict scale.

UPDATE leveraged_positions
SET entry_mark = (
    (mint_cost * 1000000000 + GREATEST(open_quantity, 1) - 1) / GREATEST(open_quantity, 1)
)
WHERE mint_cost > 0
  AND open_quantity > 0;

UPDATE leveraged_positions
SET closing_mark = (
    (realized_payout * 1000000000 + GREATEST(open_quantity, 1) - 1) / GREATEST(open_quantity, 1)
)
WHERE realized_payout > 0
  AND open_quantity > 0
  AND status <> 'open';

UPDATE market_trades
SET premium_per_unit = (
    (notional_quote * 1000000000 + GREATEST(quantity, 1) - 1) / GREATEST(quantity, 1)
)
WHERE notional_quote IS NOT NULL
  AND notional_quote > 0
  AND quantity > 0;

UPDATE global_market_trades
SET ask_price = (
    (cost * 1000000000 + GREATEST(quantity, 1) - 1) / GREATEST(quantity, 1)
)
WHERE trade_side = 'mint'
  AND cost IS NOT NULL
  AND cost > 0
  AND quantity > 0;

UPDATE global_market_trades
SET bid_price = (
    (payout * 1000000000 + GREATEST(quantity, 1) - 1) / GREATEST(quantity, 1)
)
WHERE trade_side = 'redeem'
  AND payout IS NOT NULL
  AND payout > 0
  AND quantity > 0;

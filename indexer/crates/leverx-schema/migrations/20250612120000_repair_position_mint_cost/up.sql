-- mint_cost was not reduced on position close/reopen, inflating entry premium and unrealized P&L.

-- Closed rows: cost basis must be zero (realized P&L lives in realized_payout).
UPDATE leveraged_positions
SET mint_cost = 0
WHERE open_quantity <= 0
  AND mint_cost <> 0;

-- Open rows corrupted by ghost mint_cost: cap to current funding envelope.
-- On-chain each mint satisfies mint_cost <= margin_quote + borrow_quote; the sum is
-- the maximum cost basis for contracts still open on this key.
UPDATE leveraged_positions
SET mint_cost = margin_quote + borrow_quote
WHERE status = 'open'
  AND open_quantity > 0
  AND mint_cost > margin_quote + borrow_quote;

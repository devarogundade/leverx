ALTER TABLE leveraged_positions
    ADD COLUMN IF NOT EXISTS entry_mark BIGINT,
    ADD COLUMN IF NOT EXISTS closing_mark BIGINT,
    ADD COLUMN IF NOT EXISTS close_debt_repaid BIGINT NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS close_interest_paid BIGINT NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS close_surplus_quote BIGINT NOT NULL DEFAULT 0;

-- Backfill entry premium (1e9 scale) from mint cost for existing rows.
UPDATE leveraged_positions
SET entry_mark = (
    (mint_cost * 1000000000 + GREATEST(open_quantity, 1) - 1) / GREATEST(open_quantity, 1)
)
WHERE entry_mark IS NULL
  AND mint_cost > 0
  AND open_quantity > 0;

-- Backfill closing premium from gross payout on ended positions.
UPDATE leveraged_positions
SET closing_mark = (
    (realized_payout * 1000000000 + GREATEST(open_quantity, 1) - 1) / GREATEST(open_quantity, 1)
)
WHERE closing_mark IS NULL
  AND realized_payout > 0
  AND open_quantity > 0
  AND status <> 'open';

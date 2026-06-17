ALTER TABLE leveraged_positions
    ADD COLUMN IF NOT EXISTS close_source TEXT,
    ADD COLUMN IF NOT EXISTS leverx_custody_complete BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN IF NOT EXISTS external_redeem_payout_quote BIGINT NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS custody_recovered_quote BIGINT NOT NULL DEFAULT 0;

-- Liquidations
UPDATE leveraged_positions
SET close_source = 'liquidation',
    leverx_custody_complete = true
WHERE status = 'liquidated'
  AND close_source IS NULL;

-- External predict redeem left vault borrow uncleared
UPDATE leveraged_positions
SET close_source = 'predict_external',
    leverx_custody_complete = false
WHERE status IN ('closed', 'settled')
  AND open_quantity = 0
  AND borrow_quote > 0
  AND close_source IS NULL;

-- Proper LeverX settle
UPDATE leveraged_positions
SET close_source = 'leverx_settle',
    leverx_custody_complete = true
WHERE status = 'settled'
  AND open_quantity = 0
  AND borrow_quote = 0
  AND close_source IS NULL;

-- Proper LeverX live close
UPDATE leveraged_positions
SET close_source = 'leverx_redeem',
    leverx_custody_complete = true
WHERE status = 'closed'
  AND open_quantity = 0
  AND borrow_quote = 0
  AND close_source IS NULL;

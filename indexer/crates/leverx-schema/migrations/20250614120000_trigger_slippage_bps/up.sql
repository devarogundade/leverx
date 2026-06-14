ALTER TABLE position_triggers
    ADD COLUMN IF NOT EXISTS take_profit_slippage_bps BIGINT NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS stop_loss_slippage_bps BIGINT NOT NULL DEFAULT 0;

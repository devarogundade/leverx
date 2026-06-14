ALTER TABLE position_triggers
    DROP COLUMN IF EXISTS take_profit_slippage_bps,
    DROP COLUMN IF EXISTS stop_loss_slippage_bps;

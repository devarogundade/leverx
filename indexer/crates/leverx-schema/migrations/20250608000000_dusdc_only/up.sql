-- dUSDC-only schema: drop multi-collateral tables and legacy liquidation columns.

DROP TABLE IF EXISTS collateral_balances;
DROP TABLE IF EXISTS swap_pools;
DROP TABLE IF EXISTS collateral_assets;

ALTER TABLE limit_mint_orders DROP COLUMN IF EXISTS collateral_asset;
ALTER TABLE leveraged_positions DROP COLUMN IF EXISTS collateral_asset;

ALTER TABLE liquidations DROP COLUMN IF EXISTS collateral_asset;
ALTER TABLE liquidations DROP COLUMN IF EXISTS collateral_seized;
ALTER TABLE liquidations DROP COLUMN IF EXISTS quote_from_swap;

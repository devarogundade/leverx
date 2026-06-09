-- Restore multi-collateral schema (empty tables; column defaults for re-added fields).

ALTER TABLE limit_mint_orders ADD COLUMN IF NOT EXISTS collateral_asset TEXT NOT NULL DEFAULT '';
ALTER TABLE leveraged_positions ADD COLUMN IF NOT EXISTS collateral_asset TEXT NOT NULL DEFAULT '';

ALTER TABLE liquidations ADD COLUMN IF NOT EXISTS collateral_asset TEXT NOT NULL DEFAULT '';
ALTER TABLE liquidations ADD COLUMN IF NOT EXISTS collateral_seized BIGINT NOT NULL DEFAULT 0;
ALTER TABLE liquidations ADD COLUMN IF NOT EXISTS quote_from_swap BIGINT NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS collateral_assets (
    coin_type TEXT PRIMARY KEY,
    registry_id TEXT NOT NULL,
    decimals SMALLINT NOT NULL,
    max_ltv_bps BIGINT NOT NULL,
    liquidation_ltv_bps BIGINT NOT NULL,
    max_conf_bps BIGINT NOT NULL,
    updated_at_ms BIGINT NOT NULL,
    event_digest TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS swap_pools (
    collateral_asset TEXT PRIMARY KEY,
    pool_id TEXT NOT NULL,
    registry_id TEXT NOT NULL,
    updated_at_ms BIGINT NOT NULL,
    event_digest TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS collateral_balances (
    position_key TEXT NOT NULL,
    account_id TEXT NOT NULL,
    collateral_asset TEXT NOT NULL,
    balance_atoms BIGINT NOT NULL DEFAULT 0,
    updated_at_ms BIGINT NOT NULL,
    PRIMARY KEY (position_key, account_id, collateral_asset)
);

CREATE INDEX IF NOT EXISTS idx_collateral_balances_account ON collateral_balances (account_id);

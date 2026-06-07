-- Canonical market dimension (shared position_key / market_key).
CREATE TABLE IF NOT EXISTS markets (
    market_key TEXT PRIMARY KEY,
    oracle_id TEXT NOT NULL,
    expiry_ms BIGINT NOT NULL,
    strike BIGINT NOT NULL,
    higher_strike BIGINT NOT NULL DEFAULT 0,
    is_up BOOLEAN NOT NULL DEFAULT TRUE,
    is_range BOOLEAN NOT NULL DEFAULT FALSE,
    first_seen_at_ms BIGINT NOT NULL,
    updated_at_ms BIGINT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_markets_oracle_expiry
    ON markets (oracle_id, expiry_ms, strike);

-- Predict manager registry (links global trades to LeverX accounts when known).
CREATE TABLE IF NOT EXISTS predict_managers (
    manager_id TEXT PRIMARY KEY,
    owner TEXT,
    account_id TEXT,
    created_at_ms BIGINT NOT NULL,
    updated_at_ms BIGINT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_predict_managers_account
    ON predict_managers (account_id);

CREATE INDEX IF NOT EXISTS idx_predict_managers_owner
    ON predict_managers (owner);

-- Backfill dimension tables from existing projections before FK enforcement.
INSERT INTO markets (
    market_key, oracle_id, expiry_ms, strike, higher_strike, is_up, is_range,
    first_seen_at_ms, updated_at_ms
)
SELECT position_key, oracle_id, expiry_ms, strike, higher_strike, is_up, is_range,
       COALESCE(opened_at_ms, 0), COALESCE(opened_at_ms, 0)
FROM leveraged_positions
ON CONFLICT (market_key) DO NOTHING;

INSERT INTO markets (
    market_key, oracle_id, expiry_ms, strike, higher_strike, is_up, is_range,
    first_seen_at_ms, updated_at_ms
)
SELECT position_key, oracle_id, expiry_ms, strike, higher_strike, is_up, is_range,
       placed_at_ms, placed_at_ms
FROM limit_mint_orders
ON CONFLICT (market_key) DO NOTHING;

INSERT INTO markets (
    market_key, oracle_id, expiry_ms, strike, higher_strike, is_up, is_range,
    first_seen_at_ms, updated_at_ms
)
SELECT DISTINCT
    position_key,
    split_part(position_key, ':', 1),
    split_part(position_key, ':', 2)::BIGINT,
    split_part(position_key, ':', 3)::BIGINT,
    split_part(position_key, ':', 4)::BIGINT,
    split_part(position_key, ':', 5) = '1',
    split_part(position_key, ':', 6) = '1',
    updated_at_ms,
    updated_at_ms
FROM collateral_balances
ON CONFLICT (market_key) DO NOTHING;

ALTER TABLE global_market_trades
    ADD COLUMN IF NOT EXISTS market_key TEXT;

UPDATE global_market_trades
SET market_key = oracle_id || ':' || expiry_ms || ':' || strike || ':' || higher_strike
    || ':' || CASE WHEN is_up THEN '1' ELSE '0' END
    || ':' || CASE WHEN is_range THEN '1' ELSE '0' END
WHERE market_key IS NULL;

INSERT INTO markets (
    market_key, oracle_id, expiry_ms, strike, higher_strike, is_up, is_range,
    first_seen_at_ms, updated_at_ms
)
SELECT market_key, oracle_id, expiry_ms, strike, higher_strike, is_up, is_range,
       timestamp_ms, timestamp_ms
FROM global_market_trades
WHERE market_key IS NOT NULL
ON CONFLICT (market_key) DO NOTHING;

INSERT INTO predict_managers (manager_id, owner, account_id, created_at_ms, updated_at_ms)
SELECT predict_manager_id, owner, account_id, created_at_ms, updated_at_ms
FROM user_proxies
WHERE predict_manager_id IS NOT NULL
ON CONFLICT (manager_id) DO NOTHING;

-- Supporting indexes for join paths.
CREATE INDEX IF NOT EXISTS idx_market_trades_position
    ON market_trades (position_key, timestamp_ms DESC);

CREATE INDEX IF NOT EXISTS idx_market_trades_account
    ON market_trades (account_id, timestamp_ms DESC)
    WHERE account_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_global_market_trades_market
    ON global_market_trades (market_key, timestamp_ms DESC);

CREATE INDEX IF NOT EXISTS idx_global_market_trades_manager
    ON global_market_trades (manager_id, timestamp_ms DESC);

CREATE INDEX IF NOT EXISTS idx_liquidations_position
    ON liquidations (position_key, account_id);

CREATE INDEX IF NOT EXISTS idx_positions_market_status
    ON leveraged_positions (position_key, status);

CREATE INDEX IF NOT EXISTS idx_limit_orders_market_status
    ON limit_mint_orders (position_key, status);

-- Foreign keys (deferred so a checkpoint batch can insert in any order).
ALTER TABLE predict_managers
    ADD CONSTRAINT fk_predict_managers_account
    FOREIGN KEY (account_id) REFERENCES user_proxies (account_id)
    DEFERRABLE INITIALLY DEFERRED;

ALTER TABLE limit_mint_orders
    ADD CONSTRAINT fk_limit_orders_account
    FOREIGN KEY (account_id) REFERENCES user_proxies (account_id)
    DEFERRABLE INITIALLY DEFERRED,
    ADD CONSTRAINT fk_limit_orders_market
    FOREIGN KEY (position_key) REFERENCES markets (market_key)
    DEFERRABLE INITIALLY DEFERRED,
    ADD CONSTRAINT fk_limit_orders_placed_event
    FOREIGN KEY (placed_event_digest) REFERENCES leverx_events (event_digest)
    DEFERRABLE INITIALLY DEFERRED;

ALTER TABLE leveraged_positions
    ADD CONSTRAINT fk_positions_account
    FOREIGN KEY (account_id) REFERENCES user_proxies (account_id)
    DEFERRABLE INITIALLY DEFERRED,
    ADD CONSTRAINT fk_positions_market
    FOREIGN KEY (position_key) REFERENCES markets (market_key)
    DEFERRABLE INITIALLY DEFERRED;

ALTER TABLE market_trades
    ADD CONSTRAINT fk_market_trades_event
    FOREIGN KEY (event_digest) REFERENCES leverx_events (event_digest)
    DEFERRABLE INITIALLY DEFERRED,
    ADD CONSTRAINT fk_market_trades_market
    FOREIGN KEY (position_key) REFERENCES markets (market_key)
    DEFERRABLE INITIALLY DEFERRED;

ALTER TABLE market_trades
    ADD CONSTRAINT fk_market_trades_account
    FOREIGN KEY (account_id) REFERENCES user_proxies (account_id)
    DEFERRABLE INITIALLY DEFERRED;

ALTER TABLE global_market_trades
    ADD CONSTRAINT fk_global_trades_event
    FOREIGN KEY (event_digest) REFERENCES leverx_events (event_digest)
    DEFERRABLE INITIALLY DEFERRED,
    ADD CONSTRAINT fk_global_trades_market
    FOREIGN KEY (market_key) REFERENCES markets (market_key)
    DEFERRABLE INITIALLY DEFERRED,
    ADD CONSTRAINT fk_global_trades_manager
    FOREIGN KEY (manager_id) REFERENCES predict_managers (manager_id)
    DEFERRABLE INITIALLY DEFERRED;

ALTER TABLE collateral_balances
    ADD CONSTRAINT fk_collateral_balances_account
    FOREIGN KEY (account_id) REFERENCES user_proxies (account_id)
    DEFERRABLE INITIALLY DEFERRED,
    ADD CONSTRAINT fk_collateral_balances_market
    FOREIGN KEY (position_key) REFERENCES markets (market_key)
    DEFERRABLE INITIALLY DEFERRED,
    ADD CONSTRAINT fk_collateral_balances_asset
    FOREIGN KEY (collateral_asset) REFERENCES collateral_assets (coin_type)
    DEFERRABLE INITIALLY DEFERRED;

ALTER TABLE position_triggers
    ADD CONSTRAINT fk_triggers_account
    FOREIGN KEY (account_id) REFERENCES user_proxies (account_id)
    DEFERRABLE INITIALLY DEFERRED;

ALTER TABLE proxy_executors
    ADD CONSTRAINT fk_executors_account
    FOREIGN KEY (account_id) REFERENCES user_proxies (account_id)
    DEFERRABLE INITIALLY DEFERRED;

ALTER TABLE liquidations
    ADD CONSTRAINT fk_liquidations_event
    FOREIGN KEY (event_digest) REFERENCES leverx_events (event_digest)
    DEFERRABLE INITIALLY DEFERRED,
    ADD CONSTRAINT fk_liquidations_account
    FOREIGN KEY (account_id) REFERENCES user_proxies (account_id)
    DEFERRABLE INITIALLY DEFERRED,
    ADD CONSTRAINT fk_liquidations_market
    FOREIGN KEY (position_key) REFERENCES markets (market_key)
    DEFERRABLE INITIALLY DEFERRED,
    ADD CONSTRAINT fk_liquidations_asset
    FOREIGN KEY (collateral_asset) REFERENCES collateral_assets (coin_type)
    DEFERRABLE INITIALLY DEFERRED;

ALTER TABLE account_timeline
    ADD CONSTRAINT fk_timeline_event
    FOREIGN KEY (event_digest) REFERENCES leverx_events (event_digest)
    DEFERRABLE INITIALLY DEFERRED,
    ADD CONSTRAINT fk_timeline_account
    FOREIGN KEY (account_id) REFERENCES user_proxies (account_id)
    DEFERRABLE INITIALLY DEFERRED;

ALTER TABLE vault_snapshots
    ADD CONSTRAINT fk_vault_snapshots_event
    FOREIGN KEY (event_digest) REFERENCES leverx_events (event_digest)
    DEFERRABLE INITIALLY DEFERRED;

ALTER TABLE swap_pools
    ADD CONSTRAINT fk_swap_pools_asset
    FOREIGN KEY (collateral_asset) REFERENCES collateral_assets (coin_type)
    DEFERRABLE INITIALLY DEFERRED;

ALTER TABLE global_market_trades
    ALTER COLUMN market_key SET NOT NULL;

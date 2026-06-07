CREATE TABLE IF NOT EXISTS leverx_events (
    event_digest TEXT PRIMARY KEY,
    event_type TEXT NOT NULL,
    module TEXT NOT NULL,
    package_id TEXT NOT NULL,
    transaction_digest TEXT NOT NULL,
    checkpoint BIGINT NOT NULL,
    timestamp_ms BIGINT NOT NULL,
    parsed_json JSONB NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_leverx_events_type_ts ON leverx_events (event_type, timestamp_ms DESC);
CREATE INDEX IF NOT EXISTS idx_leverx_events_account ON leverx_events ((parsed_json->>'account_id'), timestamp_ms DESC);

CREATE TABLE IF NOT EXISTS user_proxies (
    account_id TEXT PRIMARY KEY,
    owner TEXT NOT NULL,
    predict_manager_id TEXT,
    borrowed_quote BIGINT NOT NULL DEFAULT 0,
    created_at_ms BIGINT NOT NULL,
    updated_at_ms BIGINT NOT NULL
);

CREATE TABLE IF NOT EXISTS limit_mint_orders (
    placed_event_digest TEXT PRIMARY KEY,
    position_key TEXT NOT NULL,
    account_id TEXT NOT NULL,
    owner TEXT NOT NULL,
    oracle_id TEXT NOT NULL,
    expiry_ms BIGINT NOT NULL,
    strike BIGINT NOT NULL,
    higher_strike BIGINT NOT NULL,
    is_range BOOLEAN NOT NULL DEFAULT FALSE,
    is_up BOOLEAN NOT NULL DEFAULT TRUE,
    collateral_asset TEXT NOT NULL DEFAULT '',
    limit_premium_per_unit BIGINT NOT NULL,
    slippage_bps BIGINT NOT NULL,
    market_ask_at_place BIGINT,
    margin_quote BIGINT NOT NULL,
    leverage_bps BIGINT NOT NULL,
    quantity BIGINT NOT NULL,
    order_expires_ms BIGINT NOT NULL,
    status TEXT NOT NULL,
    placed_at_ms BIGINT NOT NULL,
    placed_by TEXT,
    executed_event_digest TEXT UNIQUE,
    filled_at_ms BIGINT,
    market_ask_at_fill BIGINT,
    mint_cost BIGINT,
    executor TEXT,
    cancelled_event_digest TEXT UNIQUE,
    cancelled_at_ms BIGINT,
    cancelled_by TEXT
);

CREATE INDEX IF NOT EXISTS idx_limit_orders_open ON limit_mint_orders (position_key, status, limit_premium_per_unit)
    WHERE status = 'open';
CREATE INDEX IF NOT EXISTS idx_limit_orders_account ON limit_mint_orders (account_id, status, placed_at_ms DESC);

CREATE TABLE IF NOT EXISTS leveraged_positions (
    position_key TEXT NOT NULL,
    account_id TEXT NOT NULL,
    owner TEXT NOT NULL,
    predict_manager_id TEXT,
    oracle_id TEXT NOT NULL,
    expiry_ms BIGINT NOT NULL,
    strike BIGINT NOT NULL,
    higher_strike BIGINT NOT NULL,
    is_up BOOLEAN NOT NULL,
    is_range BOOLEAN NOT NULL,
    collateral_asset TEXT NOT NULL DEFAULT '',
    open_quantity BIGINT NOT NULL DEFAULT 0,
    margin_quote BIGINT NOT NULL DEFAULT 0,
    borrow_quote BIGINT NOT NULL DEFAULT 0,
    leverage_bps BIGINT NOT NULL DEFAULT 0,
    mint_cost BIGINT NOT NULL DEFAULT 0,
    last_order_type SMALLINT,
    status TEXT NOT NULL DEFAULT 'open',
    opened_at_ms BIGINT,
    closed_at_ms BIGINT,
    realized_payout BIGINT NOT NULL DEFAULT 0,
    PRIMARY KEY (position_key, account_id)
);

CREATE INDEX IF NOT EXISTS idx_positions_owner ON leveraged_positions (owner, status);

CREATE TABLE IF NOT EXISTS market_trades (
    event_digest TEXT PRIMARY KEY,
    position_key TEXT NOT NULL,
    oracle_id TEXT NOT NULL,
    trade_kind TEXT NOT NULL,
    side TEXT NOT NULL,
    quantity BIGINT NOT NULL,
    premium_per_unit BIGINT,
    notional_quote BIGINT,
    account_id TEXT,
    owner TEXT,
    order_type SMALLINT,
    timestamp_ms BIGINT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_market_trades_oracle ON market_trades (oracle_id, timestamp_ms DESC);

CREATE TABLE IF NOT EXISTS vault_snapshots (
    event_digest TEXT PRIMARY KEY,
    vault_id TEXT NOT NULL,
    event_type TEXT NOT NULL,
    timestamp_ms BIGINT NOT NULL,
    nav BIGINT,
    utilization_bps BIGINT,
    total_borrowed BIGINT,
    borrow_rate_bps BIGINT,
    lp_apr_bps BIGINT,
    amount BIGINT,
    account_id TEXT,
    owner TEXT,
    payload JSONB NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_vault_snapshots ON vault_snapshots (vault_id, timestamp_ms DESC);

CREATE TABLE IF NOT EXISTS account_timeline (
    event_digest TEXT PRIMARY KEY,
    account_id TEXT NOT NULL,
    owner TEXT,
    event_type TEXT NOT NULL,
    timestamp_ms BIGINT NOT NULL,
    payload JSONB NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_account_timeline ON account_timeline (account_id, timestamp_ms DESC);

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

CREATE TABLE IF NOT EXISTS protocol_settings (
    registry_id TEXT PRIMARY KEY,
    vault_id TEXT,
    trading_paused BOOLEAN NOT NULL DEFAULT FALSE,
    pyth_max_age_secs BIGINT,
    base_rate_bps BIGINT,
    kink_utilization_bps BIGINT,
    slope1_bps BIGINT,
    slope2_bps BIGINT,
    flash_fee_bps BIGINT,
    updated_at_ms BIGINT NOT NULL
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

CREATE TABLE IF NOT EXISTS position_triggers (
    account_id TEXT NOT NULL,
    oracle_id TEXT NOT NULL,
    is_range BOOLEAN NOT NULL,
    take_profit_premium BIGINT NOT NULL DEFAULT 0,
    stop_loss_premium BIGINT NOT NULL DEFAULT 0,
    active BOOLEAN NOT NULL DEFAULT TRUE,
    updated_at_ms BIGINT NOT NULL,
    PRIMARY KEY (account_id, oracle_id, is_range)
);

CREATE TABLE IF NOT EXISTS proxy_executors (
    account_id TEXT NOT NULL,
    executor TEXT NOT NULL,
    active BOOLEAN NOT NULL DEFAULT TRUE,
    registered_at_ms BIGINT NOT NULL,
    revoked_at_ms BIGINT,
    PRIMARY KEY (account_id, executor)
);

CREATE TABLE IF NOT EXISTS liquidations (
    event_digest TEXT PRIMARY KEY,
    position_key TEXT NOT NULL,
    account_id TEXT NOT NULL,
    owner TEXT NOT NULL,
    keeper TEXT NOT NULL,
    collateral_asset TEXT NOT NULL,
    debt_repaid BIGINT NOT NULL,
    collateral_seized BIGINT NOT NULL,
    quote_from_swap BIGINT NOT NULL,
    surplus_quote BIGINT NOT NULL,
    health_bps BIGINT NOT NULL,
    had_position_redeem BOOLEAN NOT NULL,
    timestamp_ms BIGINT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_liquidations_account ON liquidations (account_id, timestamp_ms DESC);

CREATE TABLE IF NOT EXISTS global_market_trades (
    event_digest TEXT PRIMARY KEY,
    event_type TEXT NOT NULL,
    predict_id TEXT NOT NULL,
    manager_id TEXT NOT NULL,
    market_key TEXT NOT NULL,
    oracle_id TEXT NOT NULL,
    expiry_ms BIGINT NOT NULL,
    strike BIGINT NOT NULL,
    higher_strike BIGINT NOT NULL DEFAULT 0,
    is_up BOOLEAN NOT NULL DEFAULT TRUE,
    is_range BOOLEAN NOT NULL,
    quote_asset TEXT NOT NULL,
    trade_side TEXT NOT NULL,
    quantity BIGINT NOT NULL,
    cost BIGINT,
    payout BIGINT,
    ask_price BIGINT,
    bid_price BIGINT,
    trader TEXT,
    owner TEXT,
    executor TEXT,
    is_settled BOOLEAN,
    timestamp_ms BIGINT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_global_market_trades_oracle
    ON global_market_trades (oracle_id, timestamp_ms DESC);

CREATE INDEX IF NOT EXISTS idx_global_market_trades_predict
    ON global_market_trades (predict_id, timestamp_ms DESC);

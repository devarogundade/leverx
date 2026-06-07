-- Volume-based user points for leaderboard (derived from indexed trades).
CREATE TABLE IF NOT EXISTS user_points (
    owner TEXT PRIMARY KEY,
    account_id TEXT,
    volume_quote BIGINT NOT NULL DEFAULT 0,
    trade_count BIGINT NOT NULL DEFAULT 0,
    points BIGINT NOT NULL DEFAULT 0,
    first_trade_at_ms BIGINT,
    last_trade_at_ms BIGINT,
    updated_at_ms BIGINT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_user_points_leaderboard
    ON user_points (points DESC, volume_quote DESC);

ALTER TABLE user_points
    ADD CONSTRAINT fk_user_points_account
    FOREIGN KEY (account_id) REFERENCES user_proxies (account_id)
    DEFERRABLE INITIALLY DEFERRED;

-- Liquidations may reference collateral before whitelist events are indexed.
ALTER TABLE liquidations DROP CONSTRAINT IF EXISTS fk_liquidations_asset;

-- Backfill points from existing LeverX trades (open/close only — limit fills share open events).
INSERT INTO user_points (
    owner, account_id, volume_quote, trade_count, points,
    first_trade_at_ms, last_trade_at_ms, updated_at_ms
)
SELECT
    owner,
    MAX(account_id),
    SUM(COALESCE(notional_quote, 0)),
    COUNT(*),
    SUM(COALESCE(notional_quote, 0)),
    MIN(timestamp_ms),
    MAX(timestamp_ms),
    MAX(timestamp_ms)
FROM market_trades
WHERE owner IS NOT NULL
  AND trade_kind IN ('open', 'close')
GROUP BY owner
ON CONFLICT (owner) DO UPDATE SET
    account_id = COALESCE(EXCLUDED.account_id, user_points.account_id),
    volume_quote = user_points.volume_quote + EXCLUDED.volume_quote,
    trade_count = user_points.trade_count + EXCLUDED.trade_count,
    points = user_points.points + EXCLUDED.points,
    first_trade_at_ms = LEAST(user_points.first_trade_at_ms, EXCLUDED.first_trade_at_ms),
    last_trade_at_ms = GREATEST(user_points.last_trade_at_ms, EXCLUDED.last_trade_at_ms),
    updated_at_ms = GREATEST(user_points.updated_at_ms, EXCLUDED.updated_at_ms);

-- Backfill global Predict volume attributed to trader/owner addresses.
INSERT INTO user_points (
    owner, volume_quote, trade_count, points,
    first_trade_at_ms, last_trade_at_ms, updated_at_ms
)
SELECT
    addr,
    SUM(COALESCE(cost, payout, 0)),
    COUNT(*),
    SUM(COALESCE(cost, payout, 0)),
    MIN(timestamp_ms),
    MAX(timestamp_ms),
    MAX(timestamp_ms)
FROM (
    SELECT COALESCE(trader, owner) AS addr, cost, payout, timestamp_ms
    FROM global_market_trades
    WHERE COALESCE(trader, owner) IS NOT NULL
) g
GROUP BY addr
ON CONFLICT (owner) DO UPDATE SET
    volume_quote = user_points.volume_quote + EXCLUDED.volume_quote,
    trade_count = user_points.trade_count + EXCLUDED.trade_count,
    points = user_points.points + EXCLUDED.points,
    first_trade_at_ms = LEAST(user_points.first_trade_at_ms, EXCLUDED.first_trade_at_ms),
    last_trade_at_ms = GREATEST(user_points.last_trade_at_ms, EXCLUDED.last_trade_at_ms),
    updated_at_ms = GREATEST(user_points.updated_at_ms, EXCLUDED.updated_at_ms);

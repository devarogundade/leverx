-- Leaderboard points are LeverX leveraged volume only (not standalone Predict mint/redeem).
TRUNCATE user_points;

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
GROUP BY owner;

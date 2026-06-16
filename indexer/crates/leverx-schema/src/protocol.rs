//! Protocol constants mirrored from `leverx::protocol_constants` (Move).

/// Default final window at registry init (15 minutes).
pub const DEFAULT_FINAL_WINDOW_MS: i64 = 900_000;

/// Minimum admin-configurable final window (10 minutes).
pub const MIN_FINAL_WINDOW_MS: i64 = 600_000;

/// Maximum admin-configurable final window (4 hours).
pub const MAX_FINAL_WINDOW_MS: i64 = 14_400_000;

/// Default liquidation health threshold at registry init (105%).
pub const DEFAULT_LIQUIDATION_BPS: i64 = 10_500;

/// Maximum admin-configurable liquidation threshold (150%).
pub const MAX_LIQUIDATION_BPS: i64 = 15_000;

/// UI healthy band sits this many bps above the liquidation threshold.
pub const HEALTHY_BAND_BUFFER_BPS: i64 = 500;

/// Resolve the effective liquidation threshold for API clients.
pub fn effective_liquidation_bps(stored: Option<i64>) -> i64 {
    stored
        .filter(|v| *v > 0)
        .map(|v| v.min(MAX_LIQUIDATION_BPS))
        .unwrap_or(DEFAULT_LIQUIDATION_BPS)
}

/// Resolve the effective final window for API clients.
pub fn effective_final_window_ms(stored: Option<i64>) -> i64 {
    stored
        .filter(|v| *v >= MIN_FINAL_WINDOW_MS && *v <= MAX_FINAL_WINDOW_MS)
        .unwrap_or(DEFAULT_FINAL_WINDOW_MS)
}

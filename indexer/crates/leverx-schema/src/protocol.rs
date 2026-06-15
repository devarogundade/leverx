//! Protocol constants mirrored from `leverx::protocol_constants` (Move).

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

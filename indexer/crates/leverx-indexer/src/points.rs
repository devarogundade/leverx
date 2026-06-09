//! Incremental volume → points updates for the LeverX leaderboard.
//! Only leveraged open/close trades (`market_trades`) count — not standalone Predict mint/redeem.

use crate::handlers::{LeverxBatch, UserPointsPatch};

/// Record quote-notional volume for a user (1 point per quote atom).
pub fn record_volume(
    batch: &mut LeverxBatch,
    owner: &str,
    account_id: Option<&str>,
    volume: i64,
    timestamp_ms: i64,
) {
    if volume <= 0 || owner.is_empty() {
        return;
    }
    batch.points_patches.push(UserPointsPatch {
        owner: owner.to_string(),
        account_id: account_id.map(str::to_string),
        volume_delta: volume,
        trade_delta: 1,
        timestamp_ms,
    });
}

//! Ensures parent dimension rows exist before child projections reference them.

use leverx_schema::models::{NewMarket, NewPredictManager};

use crate::handlers::LeverxBatch;
use crate::keys::position_key;

pub fn ensure_market(
    batch: &mut LeverxBatch,
    oracle_id: &str,
    expiry_ms: i64,
    strike: i64,
    higher_strike: i64,
    is_up: bool,
    is_range: bool,
    timestamp_ms: i64,
) -> String {
    let market_key = position_key(oracle_id, expiry_ms, strike, higher_strike, is_up, is_range);
    batch.markets.push(NewMarket {
        market_key: market_key.clone(),
        oracle_id: oracle_id.to_string(),
        expiry_ms,
        strike,
        higher_strike,
        is_up,
        is_range,
        first_seen_at_ms: timestamp_ms,
        updated_at_ms: timestamp_ms,
    });
    market_key
}

pub fn ensure_predict_manager(
    batch: &mut LeverxBatch,
    manager_id: &str,
    owner: Option<&str>,
    account_id: Option<&str>,
    timestamp_ms: i64,
) {
    batch.predict_managers.push(NewPredictManager {
        manager_id: manager_id.to_string(),
        owner: owner.map(str::to_string),
        account_id: account_id.map(str::to_string),
        created_at_ms: timestamp_ms,
        updated_at_ms: timestamp_ms,
    });
}

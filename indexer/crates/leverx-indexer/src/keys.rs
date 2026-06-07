pub fn limit_order_key(
    oracle_id: &str,
    expiry_ms: i64,
    strike: i64,
    higher_strike: i64,
    is_up: bool,
    is_range: bool,
) -> String {
    format!(
        "{oracle_id}:{expiry_ms}:{strike}:{higher_strike}:{}:{}",
        if is_up { 1 } else { 0 },
        if is_range { 1 } else { 0 }
    )
}

/// Canonical market identifier used as `markets.market_key` and `leveraged_positions.position_key`.
pub fn market_key(
    oracle_id: &str,
    expiry_ms: i64,
    strike: i64,
    higher_strike: i64,
    is_up: bool,
    is_range: bool,
) -> String {
    position_key(oracle_id, expiry_ms, strike, higher_strike, is_up, is_range)
}

pub fn position_key(
    oracle_id: &str,
    expiry_ms: i64,
    strike: i64,
    higher_strike: i64,
    is_up: bool,
    is_range: bool,
) -> String {
    format!(
        "{oracle_id}:{expiry_ms}:{strike}:{higher_strike}:{}:{}",
        if is_up { 1 } else { 0 },
        if is_range { 1 } else { 0 }
    )
}

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

/// Normalize `package::module::TYPE` coin types to `0xpackage::module::TYPE` for API consistency.
pub fn normalize_type_name(name: &str) -> String {
    let s = name.trim();
    if s.is_empty() || s.starts_with("0x") {
        return s.to_string();
    }
    format!("0x{s}")
}

#[test_only]
module leverx::protocol_constants_full_tests;

use leverx::protocol_constants;

#[test]
fun leverage_bounds() {
    assert!(protocol_constants::min_leverage_bps() == 11_000, 0);
    assert!(protocol_constants::max_leverage() == 10, 0);
    assert!(protocol_constants::max_leverage_bps() == 100_000, 0);
}

#[test]
fun decimal_getters() {
    assert!(protocol_constants::usd_decimals() == 9, 0);
    assert!(protocol_constants::quote_decimals() == 6, 0);
    assert!(protocol_constants::pyth_exponent_buffer() == 10, 0);
}

#[test]
fun rate_model_defaults_are_ordered() {
    assert!(protocol_constants::default_base_rate_bps() > 0, 0);
    assert!(protocol_constants::default_kink_util_bps() <= protocol_constants::bps(), 0);
    assert!(protocol_constants::default_slope1_bps() > 0, 0);
    assert!(protocol_constants::default_slope2_bps() > 0, 0);
}

#[test]
fun predict_and_order_type_tags() {
    assert!(protocol_constants::predict_price_scale() == 1_000_000_000, 0);
    assert!(protocol_constants::order_type_market() == 0, 0);
    assert!(protocol_constants::order_type_limit() == 1, 0);
    assert!(protocol_constants::max_limit_order_slippage_bps() == 5_000, 0);
}

#[test]
fun year_ms_is_positive() {
    assert!(protocol_constants::year_ms() > 0, 0);
}

#[test]
fun default_liquidation_insurance_bps() {
    assert!(protocol_constants::default_liquidation_insurance_bps() == 100, 0);
}

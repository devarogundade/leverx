#[test_only]
module leverx::protocol_constants_full_tests;

use leverx::protocol_constants;

#[test]
fun fixed_leverage_and_margin_call() {
    assert!(protocol_constants::leverage_bps() == 10_000, 0);
    assert!(protocol_constants::margin_call_bps() == 9_500, 0);
}

#[test]
fun decimal_getters() {
    assert!(protocol_constants::usd_decimals() == 9, 0);
    assert!(protocol_constants::quote_decimals() == 6, 0);
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
fun fee_shares_sum_to_bps() {
    let total = protocol_constants::vault_fee_share_bps()
        + protocol_constants::fee_collector_share_bps()
        + protocol_constants::keeper_fee_share_bps();
    assert!(total == protocol_constants::bps(), 0);
}

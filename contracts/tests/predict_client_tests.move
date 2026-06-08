#[test_only]
module leverx::predict_client_tests;

use leverx::{errors, predict_client, protocol_constants};

#[test]
fun premium_per_unit_and_cost_roundtrip() {
    let quantity = 10;
    let mint_cost = 500_000_000;
    let premium = predict_client::premium_per_unit(mint_cost, quantity);
    assert!(premium == 50_000_000_000_000, 0);
    let cost_back = predict_client::cost_from_premium_per_unit(premium, quantity);
    assert!(cost_back == mint_cost, 0);
}

#[test]
#[expected_failure(abort_code = errors::E_ZERO_QUANTITY)]
fun premium_per_unit_rejects_zero_quantity() {
    predict_client::premium_per_unit(100, 0);
}

#[test]
fun max_acceptable_buy_ask_includes_slippage() {
    let limit = 1_000_000_000;
    let slippage_bps = 500;
    let max_ask = predict_client::max_acceptable_buy_ask(limit, slippage_bps);
    assert!(max_ask == limit + predict_client::premium_slippage_tolerance(limit, slippage_bps), 0);
}

#[test]
fun limit_buy_fill_met_when_ask_within_band() {
    predict_client::assert_limit_buy_fill_met(1_050_000_000, 1_000_000_000, 500);
}

#[test]
#[expected_failure(abort_code = errors::E_LIMIT_PRICE_NOT_MET)]
fun limit_buy_fill_aborts_when_ask_above_slippage_band() {
    predict_client::assert_limit_buy_fill_met(1_051_000_000, 1_000_000_000, 500);
}

#[test]
fun limit_sell_fill_met_when_bid_at_floor() {
    predict_client::assert_limit_sell_bid_met(900_000_000, 900_000_000);
}

#[test]
#[expected_failure(abort_code = errors::E_LIMIT_PRICE_NOT_MET)]
fun limit_sell_aborts_when_bid_below_floor() {
    predict_client::assert_limit_sell_bid_met(899_999_999, 900_000_000);
}

#[test]
fun market_mint_slippage_guard_passes_within_cap() {
    predict_client::assert_market_slippage(1_000_000, 950_000);
}

#[test]
#[expected_failure(abort_code = errors::E_SLIPPAGE_EXCEEDED)]
fun market_mint_slippage_guard_aborts_above_cap() {
    predict_client::assert_market_slippage(1_000_000, 1_000_001);
}

#[test]
fun redeem_slippage_disabled_when_min_payout_zero() {
    predict_client::assert_redeem_slippage(0, 0);
}

#[test]
#[expected_failure(abort_code = errors::E_SLIPPAGE_EXCEEDED)]
fun redeem_slippage_aborts_below_min_payout() {
    predict_client::assert_redeem_slippage(100, 99);
}

#[test]
fun placement_price_aligned_within_frozen_slippage() {
    let limit = 1_000_000_000;
    let slippage_bps = 100;
    predict_client::assert_placement_price_aligned(limit, limit, slippage_bps);
}

#[test]
#[expected_failure(abort_code = errors::E_PLACEMENT_PRICE_NOT_ALIGNED)]
fun placement_price_aborts_when_ask_outside_band() {
    let limit = 1_000_000_000;
    predict_client::assert_placement_price_aligned(1_200_000_000, limit, 100);
}

#[test]
fun premium_slippage_tolerance_scales_with_bps() {
    assert!(predict_client::premium_slippage_tolerance(1_000_000_000, 100) == 10_000_000, 0);
}

#[test]
#[expected_failure(abort_code = errors::E_ZERO_AMOUNT)]
fun limit_buy_fill_rejects_zero_limit() {
    predict_client::assert_limit_buy_fill_met(1, 0, 0);
}

#[test]
#[expected_failure(abort_code = errors::E_ZERO_AMOUNT)]
fun limit_sell_rejects_zero_floor() {
    predict_client::assert_limit_sell_bid_met(100, 0);
}


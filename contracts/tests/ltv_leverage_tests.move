#[test_only]
module leverx::ltv_leverage_tests;

use leverx::{errors, ltv, protocol_constants};

#[test]
#[expected_failure(abort_code = errors::E_INVALID_LEVERAGE)]
fun borrow_for_leverage_rejects_margin_above_position() {
    ltv::borrow_for_leverage(50_000_000, 100_000_000);
}

#[test]
#[expected_failure(abort_code = errors::E_INVALID_MARGIN)]
fun margin_below_min_rejected() {
    ltv::assert_margin_quote(99_999);
}

#[test]
#[expected_failure(abort_code = errors::E_INVALID_MARGIN)]
fun margin_above_max_rejected() {
    ltv::assert_margin_quote(100_000_001);
}

#[test]
fun margin_bounds_accept_valid_amount() {
    ltv::assert_margin_quote(protocol_constants::min_margin_quote());
    ltv::assert_margin_quote(protocol_constants::max_margin_quote());
}

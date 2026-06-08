#[test_only]
module leverx::ltv_leverage_tests;

use leverx::{errors, ltv, protocol_constants};

#[test]
fun position_from_margin_at_2x() {
    let margin = 100_000_000;
    let leverage_bps = 20_000;
    assert!(ltv::position_from_margin(margin, leverage_bps) == 200_000_000, 0);
}

#[test]
fun borrow_for_leverage_is_position_minus_margin() {
    assert!(ltv::borrow_for_leverage(200_000_000, 100_000_000) == 100_000_000, 0);
}

#[test]
#[expected_failure(abort_code = errors::E_INVALID_LEVERAGE)]
fun borrow_for_leverage_rejects_margin_above_position() {
    ltv::borrow_for_leverage(50_000_000, 100_000_000);
}

#[test]
fun max_leverage_bps_matches_protocol_cap() {
    assert!(
        protocol_constants::max_leverage_bps() == protocol_constants::max_leverage() * protocol_constants::bps(),
        0,
    );
}

#[test]
fun conversion_scales_collateral_atoms() {
    let config = ltv::test_conversion_config(6, 6, 1_000_000, 8);
    assert!(ltv::test_convert_amount(config, 100_000_000) == 100_000_000, 0);
    assert!(ltv::test_convert_amount(config, 50_000_000) == 50_000_000, 0);
}

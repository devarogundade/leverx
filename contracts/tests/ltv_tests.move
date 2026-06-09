#[test_only]
module leverx::ltv_tests;

use leverx::{ltv, protocol_constants};

#[test]
fun effective_health_debt_prefers_vault_debt() {
    assert!(ltv::effective_health_debt(500, 1_000) == 500, 0);
    assert!(ltv::effective_health_debt(0, 1_000) == 1_000, 0);
}

#[test]
fun evaluate_position_health_at_margin_call() {
    let debt = 1_000;
    let health = ltv::evaluate_position_health(950, 0, debt);
    assert!(health == 9_500, 0);
    assert!(!ltv::is_position_liquidatable(950, 0, debt), 0);
    assert!(ltv::is_position_liquidatable(949, 0, debt), 0);
}

#[test]
fun zero_debt_is_not_liquidatable() {
    assert!(!ltv::is_position_liquidatable(0, 0, 0), 0);
    assert!(ltv::evaluate_position_health(0, 0, 0) == protocol_constants::bps() * 10, 0);
}

#[test]
fun borrow_for_leverage_is_zero_at_fixed_1x() {
    assert!(ltv::borrow_for_leverage(5_000, 5_000) == 0, 0);
    ltv::assert_leverage_bps(protocol_constants::leverage_bps());
}

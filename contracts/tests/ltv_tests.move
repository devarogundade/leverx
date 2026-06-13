#[test_only]
module leverx::ltv_tests;

use leverx::{ltv, protocol_constants};

const LEVERAGED_BPS: u64 = 20_000;
const LIQUIDATION_BPS: u64 = 9_500;

#[test]
fun effective_health_debt_prefers_vault_debt() {
    assert!(ltv::effective_health_debt(500, 1_000, LEVERAGED_BPS) == 500, 0);
    assert!(ltv::effective_health_debt(0, 1_000, LEVERAGED_BPS) == 1_000, 0);
}

#[test]
fun effective_health_debt_zero_at_one_x() {
    assert!(ltv::effective_health_debt(500, 1_000, protocol_constants::bps()) == 0, 0);
    assert!(!ltv::is_leveraged(protocol_constants::bps()), 0);
}

#[test]
fun evaluate_position_health_at_margin_call() {
    let debt = 1_000;
    let health = ltv::evaluate_position_health(950, 0, debt, LEVERAGED_BPS);
    assert!(health == 9_500, 0);
    assert!(!ltv::is_position_liquidatable(950, 0, debt, LEVERAGED_BPS, LIQUIDATION_BPS), 0);
    assert!(ltv::is_position_liquidatable(949, 0, debt, LEVERAGED_BPS, LIQUIDATION_BPS), 0);
}

#[test]
fun zero_debt_is_not_liquidatable() {
    assert!(!ltv::is_position_liquidatable(0, 0, 0, protocol_constants::bps(), LIQUIDATION_BPS), 0);
    assert!(
        ltv::evaluate_position_health(0, 0, 0, protocol_constants::bps())
            == protocol_constants::bps() * 10,
        0,
    );
}

#[test]
fun one_x_position_is_never_liquidatable() {
    assert!(
        !ltv::is_position_liquidatable(0, 1_000, 1_000, protocol_constants::bps(), LIQUIDATION_BPS),
        0,
    );
}

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
fun min_leverage_bps_is_one_x() {
    ltv::assert_leverage_bps(protocol_constants::min_leverage_bps());
}

#[test]
fun open_position_collateral_health_uses_redeem_payout() {
    let debt = 1_000;
    // Free quote alone is underwater; adding redeem payout restores health.
    assert!(ltv::is_position_liquidatable(0, debt, 0, LEVERAGED_BPS, LIQUIDATION_BPS), 0);
    assert!(!ltv::is_position_liquidatable(950, debt, 0, LEVERAGED_BPS, LIQUIDATION_BPS), 0);
    assert!(!ltv::is_position_liquidatable(0 + 950, debt, 0, LEVERAGED_BPS, LIQUIDATION_BPS), 0);
}

#[test_only]
module leverx::ltv_health_tests;

use leverx::ltv;

#[test]
fun health_includes_quote_balance_in_backing() {
    let config = ltv::test_conversion_config(6, 6, 1_000_000, 8);
    let collateral_quote = ltv::test_convert_amount(config, 100_000_000);
    let quote_balance = 20_000_000;
    let debt = 100_000_000;
    let backing = collateral_quote + quote_balance;
    let health = backing * 10_000 / debt;
    assert!(health == 12_000, 0);
}

#[test]
fun health_without_quote_is_lower() {
    let config = ltv::test_conversion_config(6, 6, 1_000_000, 8);
    let collateral_quote = ltv::test_convert_amount(config, 80_000_000);
    let debt = 100_000_000;
    let health = collateral_quote * 10_000 / debt;
    assert!(health == 8_000, 0);
}

#[test]
fun mul_bps_matches_protocol_constants() {
    assert!(ltv::test_mul_bps(1_000, 8_000) == 800, 0);
}

#[test]
fun liquidatable_when_health_strictly_below_threshold() {
    let config = ltv::test_conversion_config(6, 6, 1_000_000, 8);
    let collateral_quote = ltv::test_convert_amount(config, 84_000_000);
    let debt = 100_000_000;
    let health = collateral_quote * 10_000 / debt;
    assert!(health == 8_400, 0);
    assert!(health < 8_500, 0);
}

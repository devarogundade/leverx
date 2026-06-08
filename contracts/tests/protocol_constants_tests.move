#[test_only]
module leverx::protocol_constants_tests;

use leverx::protocol_constants;

#[test]
fun fee_shares_sum_to_one_hundred_percent() {
    let total = protocol_constants::vault_fee_share_bps()
        + protocol_constants::fee_collector_share_bps()
        + protocol_constants::keeper_fee_share_bps();
    assert!(total == protocol_constants::bps(), 0);
}

#[test]
fun liquidation_ltv_defaults_above_max_ltv() {
    assert!(
        protocol_constants::default_liquidation_ltv_bps()
            > protocol_constants::default_max_ltv_bps(),
        0,
    );
}

#[test]
fun liquidation_pyth_age_wider_than_trading_age() {
    assert!(
        protocol_constants::liquidation_pyth_max_age_secs()
            >= protocol_constants::default_pyth_max_age_secs(),
        0,
    );
}

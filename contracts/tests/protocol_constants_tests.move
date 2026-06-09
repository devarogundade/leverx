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
fun fixed_one_x_leverage() {
    assert!(protocol_constants::leverage_bps() == 10_000, 0);
}

#[test]
fun margin_call_below_full_health() {
    assert!(protocol_constants::margin_call_bps() < protocol_constants::bps(), 0);
}

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
fun leverage_bounds() {
    assert!(protocol_constants::min_leverage_bps() == 11_000, 0);
    assert!(protocol_constants::max_leverage() == 10, 0);
    assert!(
        protocol_constants::max_leverage_bps() == protocol_constants::max_leverage() * protocol_constants::bps(),
        0,
    );
}

#[test]
fun margin_bounds() {
    assert!(protocol_constants::min_margin_quote() == 100_000, 0);
    assert!(protocol_constants::max_margin_quote() == 100_000_000, 0);
}

#[test]
fun margin_call_below_full_health() {
    assert!(protocol_constants::margin_call_bps() < protocol_constants::bps(), 0);
}

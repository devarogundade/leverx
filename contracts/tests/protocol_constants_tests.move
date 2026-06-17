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
    assert!(protocol_constants::min_leverage_bps() == 10_000, 0);
    assert!(protocol_constants::default_final_window_ms() == 1_800_000, 0);
    assert!(protocol_constants::min_final_window_ms() == 60_000, 0);
    assert!(protocol_constants::max_final_window_ms() == 14_400_000, 0);
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
fun liquidation_threshold_defaults_and_bounds() {
    assert!(protocol_constants::default_liquidation_bps() == 10_500, 0);
    assert!(protocol_constants::min_liquidation_bps() == 10_000, 0);
    assert!(protocol_constants::max_liquidation_bps() == 15_000, 0);
    assert!(protocol_constants::liquidation_flash_buffer_bps() == 500, 0);
    assert!(
        protocol_constants::default_liquidation_bps() >= protocol_constants::min_liquidation_bps(),
        0,
    );
    assert!(
        protocol_constants::default_liquidation_bps() <= protocol_constants::max_liquidation_bps(),
        0,
    );
}

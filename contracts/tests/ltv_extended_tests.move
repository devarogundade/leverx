#[test_only]
module leverx::ltv_extended_tests;

use leverx::{collateral_config, events, ltv, protocol_constants};

public struct TestAsset has drop {}

#[test]
fun zero_debt_health_is_max() {
    assert!(protocol_constants::bps() * 10 == 100_000, 0);
}

#[test]
fun conversion_roundtrip_is_consistent() {
    let config = ltv::test_conversion_config(6, 6, 2_000_000, 8);
    let forward = ltv::test_convert_amount(config, 50_000_000);
    let back = ltv::test_convert_amount_inverse(config, forward);
    assert!(back == 50_000_000, 0);
}

#[test]
fun conversion_scales_with_price() {
    let cheap = ltv::test_conversion_config(6, 6, 500_000, 8);
    let rich = ltv::test_conversion_config(6, 6, 2_000_000, 8);
    let cheap_val = ltv::test_convert_amount(cheap, 100_000_000);
    let rich_val = ltv::test_convert_amount(rich, 100_000_000);
    assert!(rich_val == cheap_val * 4, 0);
}

#[test]
fun liquidation_skim_source_constant() {
    assert!(events::liquidation_skim_source() == 1, 0);
}

#[test]
fun fee_source_tags_are_unique() {
    assert!(
        protocol_constants::fee_source_interest()
            != protocol_constants::fee_source_flash_loan(),
        0,
    );
    assert!(
        protocol_constants::fee_source_flash_loan()
            != protocol_constants::fee_source_liquidation(),
        0,
    );
}

#[test]
fun collateral_config_test_helper_sets_liquidation_above_max() {
    let config = ltv::test_collateral_config<TestAsset>(6, x"00", 8_000);
    assert!(collateral_config::liquidation_ltv_bps(&config) == 8_500, 0);
}

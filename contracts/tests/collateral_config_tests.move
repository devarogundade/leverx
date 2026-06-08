#[test_only]
module leverx::collateral_config_tests;

use leverx::collateral_config;
use std::type_name;
use leverx::errors;

public struct TestAsset has drop {}

#[test]
fun valid_launch_style_ltv_passes() {
    let config = collateral_config::new(
        type_name::with_defining_ids<TestAsset>(),
        6,
        x"0011223344556677889900112233445566778899001122334455667788990011",
        9_500,
        10_000,
        1_000,
    );
    collateral_config::assert_valid(&config);
    assert!(collateral_config::max_ltv_bps(&config) == 9_500, 0);
    assert!(collateral_config::liquidation_ltv_bps(&config) == 10_000, 0);
}

#[test]
#[expected_failure(abort_code = errors::E_INVALID_COLLATERAL_CONFIG)]
fun liquidation_ltv_must_exceed_max_ltv() {
    let config = collateral_config::new(
        type_name::with_defining_ids<TestAsset>(),
        6,
        x"0011223344556677889900112233445566778899001122334455667788990011",
        8_000,
        8_000,
        1_000,
    );
    collateral_config::assert_valid(&config);
}

#[test]
#[expected_failure(abort_code = errors::E_INVALID_COLLATERAL_CONFIG)]
fun zero_max_ltv_rejected() {
    let config = collateral_config::new(
        type_name::with_defining_ids<TestAsset>(),
        6,
        x"0011223344556677889900112233445566778899001122334455667788990011",
        0,
        8_500,
        1_000,
    );
    collateral_config::assert_valid(&config);
}

#[test]
#[expected_failure(abort_code = errors::E_INVALID_COLLATERAL_CONFIG)]
fun zero_max_conf_rejected() {
    let config = collateral_config::new(
        type_name::with_defining_ids<TestAsset>(),
        6,
        x"0011223344556677889900112233445566778899001122334455667788990011",
        8_000,
        8_500,
        0,
    );
    collateral_config::assert_valid(&config);
}

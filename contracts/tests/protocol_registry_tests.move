#[test_only]
module leverx::protocol_registry_tests;

use leverx::{collateral_config, errors, protocol_constants, protocol_registry, test_fixtures};
use sui::test_scenario;

#[test]
fun whitelist_and_read_collateral_config() {
    let owner = @0xAD;
    let mut scenario = test_scenario::begin(owner);
    let ctx = scenario.ctx();

    let (admin, mut registry) = protocol_registry::create_for_testing(ctx);
    protocol_registry::whitelist_collateral_asset<test_fixtures::TestCollateral>(
        &admin,
        &mut registry,
        test_fixtures::feed_id(),
        6,
        9_500,
        10_000,
        1_000,
    );

    let config = protocol_registry::collateral_config<test_fixtures::TestCollateral>(&registry);
    assert!(collateral_config::max_ltv_bps(&config) == 9_500, 0);
    assert!(collateral_config::liquidation_ltv_bps(&config) == 10_000, 0);
    assert!(protocol_registry::collateral_configs(&registry).length() == 1, 0);

    scenario.end();
}

#[test]
fun register_swap_pool_after_whitelist() {
    let owner = @0xAD;
    let mut scenario = test_scenario::begin(owner);
    let ctx = scenario.ctx();

    let (admin, mut registry) = protocol_registry::create_for_testing(ctx);
    protocol_registry::whitelist_collateral_asset<test_fixtures::TestCollateral>(
        &admin,
        &mut registry,
        test_fixtures::feed_id(),
        6,
        8_000,
        8_500,
        1_000,
    );
    let pool_id = object::id_from_address(@0x7001);
    protocol_registry::register_swap_pool<test_fixtures::TestCollateral>(
        &admin,
        &mut registry,
        pool_id,
    );
    assert!(
        protocol_registry::swap_pool_id<test_fixtures::TestCollateral>(&registry) == pool_id,
        0,
    );

    scenario.end();
}

#[test]
fun trading_pause_flag_roundtrip() {
    let owner = @0xAD;
    let mut scenario = test_scenario::begin(owner);
    let ctx = scenario.ctx();

    let (admin, mut registry) = protocol_registry::create_for_testing(ctx);
    assert!(!protocol_registry::trading_paused(&registry), 0);
    protocol_registry::set_trading_paused(&admin, &mut registry, true);
    assert!(protocol_registry::trading_paused(&registry), 0);

    scenario.end();
}

#[test]
fun set_pyth_max_age_within_bounds() {
    let owner = @0xAD;
    let mut scenario = test_scenario::begin(owner);
    let ctx = scenario.ctx();

    let (admin, mut registry) = protocol_registry::create_for_testing(ctx);
    protocol_registry::set_pyth_max_age(&admin, &mut registry, 120);
    assert!(protocol_registry::pyth_max_age_secs(&registry) == 120, 0);
    assert!(
        protocol_registry::liquidation_pyth_max_age_secs(&registry)
            == protocol_constants::liquidation_pyth_max_age_secs(),
        0,
    );

    scenario.end();
}

#[test]
#[expected_failure(abort_code = errors::E_INVALID_PYTH_PRICE)]
fun set_pyth_max_age_rejects_zero() {
    let owner = @0xAD;
    let mut scenario = test_scenario::begin(owner);
    let ctx = scenario.ctx();

    let (admin, mut registry) = protocol_registry::create_for_testing(ctx);
    protocol_registry::set_pyth_max_age(&admin, &mut registry, 0);

    scenario.end();
}

#[test]
#[expected_failure(abort_code = errors::E_COLLATERAL_NOT_SUPPORTED)]
fun swap_pool_requires_whitelisted_collateral() {
    let owner = @0xAD;
    let mut scenario = test_scenario::begin(owner);
    let ctx = scenario.ctx();

    let (admin, mut registry) = protocol_registry::create_for_testing(ctx);
    protocol_registry::register_swap_pool<test_fixtures::TestCollateral>(
        &admin,
        &mut registry,
        object::id_from_address(@0x7001),
    );

    scenario.end();
}

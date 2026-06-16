#[test_only]
module leverx::protocol_registry_tests;

use leverx::{errors, protocol_registry};
use sui::test_scenario;

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
fun liquidation_bps_defaults_to_one_hundred_two_percent() {
    let owner = @0xAD;
    let mut scenario = test_scenario::begin(owner);
    let ctx = scenario.ctx();

    let (_admin, registry) = protocol_registry::create_for_testing(ctx);
    assert!(protocol_registry::liquidation_bps(&registry) == 10_200, 0);

    scenario.end();
}

#[test]
fun admin_can_update_liquidation_bps() {
    let owner = @0xAD;
    let mut scenario = test_scenario::begin(owner);
    let ctx = scenario.ctx();

    let (admin, mut registry) = protocol_registry::create_for_testing(ctx);
    protocol_registry::set_liquidation_bps(&admin, &mut registry, 10_000);
    assert!(protocol_registry::liquidation_bps(&registry) == 10_000, 0);
    protocol_registry::set_liquidation_bps(&admin, &mut registry, 15_000);
    assert!(protocol_registry::liquidation_bps(&registry) == 15_000, 0);

    scenario.end();
}

#[test]
#[expected_failure(abort_code = errors::E_INVALID_LIQUIDATION_BPS)]
fun invalid_liquidation_bps_zero_rejected() {
    let owner = @0xAD;
    let mut scenario = test_scenario::begin(owner);
    let ctx = scenario.ctx();

    let (admin, mut registry) = protocol_registry::create_for_testing(ctx);
    protocol_registry::set_liquidation_bps(&admin, &mut registry, 0);

    scenario.end();
}

#[test]
#[expected_failure(abort_code = errors::E_INVALID_LIQUIDATION_BPS)]
fun invalid_liquidation_bps_above_max_rejected() {
    let owner = @0xAD;
    let mut scenario = test_scenario::begin(owner);
    let ctx = scenario.ctx();

    let (admin, mut registry) = protocol_registry::create_for_testing(ctx);
    protocol_registry::set_liquidation_bps(&admin, &mut registry, 15_001);

    scenario.end();
}

#[test]
fun registry_links_predict_vault_and_collector() {
    let owner = @0xAD;
    let mut scenario = test_scenario::begin(owner);
    let ctx = scenario.ctx();

    let (_admin, registry) = protocol_registry::create_for_testing(ctx);
    assert!(protocol_registry::predict_id(&registry) != object::id_from_address(@0x0), 0);
    assert!(protocol_registry::vault_id(&registry) != object::id_from_address(@0x0), 0);
    assert!(protocol_registry::fee_collector_id(&registry) != object::id_from_address(@0x0), 0);

    scenario.end();
}

#[test]
fun admin_can_set_keeper_address() {
    let owner = @0xAD;
    let keeper = @0xKEEP;
    let mut scenario = test_scenario::begin(owner);
    let ctx = scenario.ctx();

    let (admin, mut registry) = protocol_registry::create_for_testing(ctx);
    protocol_registry::set_keeper_address(&admin, &mut registry, keeper);
    assert!(protocol_registry::keeper_address(&registry) == keeper, 0);

    scenario.end();
}

#[test]
fun final_window_defaults_to_five_minutes() {
    let owner = @0xAD;
    let mut scenario = test_scenario::begin(owner);
    let ctx = scenario.ctx();

    let (_admin, registry) = protocol_registry::create_for_testing(ctx);
    assert!(protocol_registry::final_window_ms(&registry) == 300_000, 0);

    scenario.end();
}

#[test]
fun admin_can_update_final_window_ms() {
    let owner = @0xAD;
    let mut scenario = test_scenario::begin(owner);
    let ctx = scenario.ctx();

    let (admin, mut registry) = protocol_registry::create_for_testing(ctx);
    protocol_registry::set_final_window_ms(&admin, &mut registry, 60_000);
    assert!(protocol_registry::final_window_ms(&registry) == 60_000, 0);
    protocol_registry::set_final_window_ms(&admin, &mut registry, 14_400_000);
    assert!(protocol_registry::final_window_ms(&registry) == 14_400_000, 0);

    scenario.end();
}

#[test]
#[expected_failure(abort_code = errors::E_INVALID_FINAL_WINDOW_MS)]
fun invalid_final_window_below_min_rejected() {
    let owner = @0xAD;
    let mut scenario = test_scenario::begin(owner);
    let ctx = scenario.ctx();

    let (admin, mut registry) = protocol_registry::create_for_testing(ctx);
    protocol_registry::set_final_window_ms(&admin, &mut registry, 59_999);

    scenario.end();
}

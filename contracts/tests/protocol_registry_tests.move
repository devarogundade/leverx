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
fun liquidation_bps_defaults_to_one_hundred_five_percent() {
    let owner = @0xAD;
    let mut scenario = test_scenario::begin(owner);
    let ctx = scenario.ctx();

    let (_admin, registry) = protocol_registry::create_for_testing(ctx);
    assert!(protocol_registry::liquidation_bps(&registry) == 10_500, 0);

    scenario.end();
}

#[test]
fun admin_can_update_liquidation_bps() {
    let owner = @0xAD;
    let mut scenario = test_scenario::begin(owner);
    let ctx = scenario.ctx();

    let (admin, mut registry) = protocol_registry::create_for_testing(ctx);
    protocol_registry::set_liquidation_bps(&admin, &mut registry, 8_000);
    assert!(protocol_registry::liquidation_bps(&registry) == 8_000, 0);
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

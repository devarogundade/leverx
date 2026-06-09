#[test_only]
module leverx::protocol_registry_tests;

use leverx::protocol_registry;
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

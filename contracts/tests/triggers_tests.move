#[test_only]
module leverx::triggers_tests;

use leverx::{test_fixtures, triggers, user_proxy};
use sui::test_scenario;

#[test]
fun set_and_read_binary_triggers() {
    let owner = @0x7000;
    let mut scenario = test_scenario::begin(owner);
    let ctx = scenario.ctx();

    let mut proxy = user_proxy::create_for_testing(owner, @0xCAFE, object::id_from_address(@0xBEEF), ctx);
    let key = test_fixtures::sample_binary_key();

    triggers::set_automated_triggers(&mut proxy, key, 900_000_000, 400_000_000, 500, 300, ctx);
    let (tp, sl, tp_slippage, sl_slippage) = triggers::get_triggers(&proxy, key);
    assert!(tp == 900_000_000, 0);
    assert!(sl == 400_000_000, 0);
    assert!(tp_slippage == 500, 0);
    assert!(sl_slippage == 300, 0);

    triggers::clear_automated_triggers(&mut proxy, key, ctx);
    let (tp2, sl2, _, _) = triggers::get_triggers(&proxy, key);
    assert!(tp2 == 0, 0);
    assert!(sl2 == 0, 0);

    scenario.end();
}

#[test]
fun keeper_trigger_threshold_binary() {
    let owner = @0x7000;
    let keeper = @0x8000;
    let mut scenario = test_scenario::begin(owner);
    let ctx = scenario.ctx();

    let mut proxy = user_proxy::create_for_testing(owner, @0xCAFE, object::id_from_address(@0xBEEF), ctx);
    let key = test_fixtures::sample_binary_key();

    triggers::set_automated_triggers(&mut proxy, key, 900_000_000, 400_000_000, 500, 500, ctx);

    scenario.next_tx(keeper);
    let keeper_ctx = scenario.ctx();
    assert!(!user_proxy::can_act(&proxy, keeper_ctx), 0);
    user_proxy::assert_can_act_or_has_binary_trigger(&proxy, key, keeper_ctx);
    user_proxy::assert_binary_trigger_threshold_met(&proxy, key, 900_000_000);
    user_proxy::assert_binary_trigger_threshold_met(&proxy, key, 400_000_000);

    scenario.end();
}

#[test]
fun set_and_read_range_triggers() {
    let owner = @0x7000;
    let mut scenario = test_scenario::begin(owner);
    let ctx = scenario.ctx();

    let mut proxy = user_proxy::create_for_testing(owner, @0xCAFE, object::id_from_address(@0xBEEF), ctx);
    let key = test_fixtures::sample_range_key();

    triggers::set_range_triggers(&mut proxy, key, 800_000_000, 300_000_000, 500, 500, ctx);
    let (tp, sl, tp_slippage, sl_slippage) = triggers::get_range_triggers(&proxy, key);
    assert!(tp == 800_000_000, 0);
    assert!(sl == 300_000_000, 0);
    assert!(tp_slippage == 500, 0);
    assert!(sl_slippage == 500, 0);

    triggers::clear_range_triggers(&mut proxy, key, ctx);
    let (tp2, sl2, _, _) = triggers::get_range_triggers(&proxy, key);
    assert!(tp2 == 0 && sl2 == 0, 0);

    scenario.end();
}

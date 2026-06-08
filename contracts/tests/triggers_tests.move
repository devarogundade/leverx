#[test_only]
module leverx::triggers_tests;

use leverx::{test_fixtures, triggers, user_proxy};
use sui::test_scenario;

#[test]
fun set_and_read_binary_triggers() {
    let owner = @0x7000;
    let mut scenario = test_scenario::begin(owner);
    let ctx = scenario.ctx();

    let mut proxy = user_proxy::create_for_testing(owner, object::id_from_address(@0xBEEF), ctx);
    let key = test_fixtures::sample_binary_key();

    triggers::set_automated_triggers(&mut proxy, key, 900_000_000, 400_000_000, ctx);
    let (tp, sl) = triggers::get_triggers(&proxy, key);
    assert!(tp == 900_000_000, 0);
    assert!(sl == 400_000_000, 0);

    triggers::clear_automated_triggers(&mut proxy, key, ctx);
    let (tp2, sl2) = triggers::get_triggers(&proxy, key);
    assert!(tp2 == 0, 0);
    assert!(sl2 == 0, 0);

    scenario.end();
}

#[test]
fun set_and_read_range_triggers() {
    let owner = @0x7000;
    let mut scenario = test_scenario::begin(owner);
    let ctx = scenario.ctx();

    let mut proxy = user_proxy::create_for_testing(owner, object::id_from_address(@0xBEEF), ctx);
    let key = test_fixtures::sample_range_key();

    triggers::set_range_triggers(&mut proxy, key, 800_000_000, 300_000_000, ctx);
    let (tp, sl) = triggers::get_range_triggers(&proxy, key);
    assert!(tp == 800_000_000, 0);
    assert!(sl == 300_000_000, 0);

    triggers::clear_range_triggers(&mut proxy, key, ctx);
    let (tp2, sl2) = triggers::get_range_triggers(&proxy, key);
    assert!(tp2 == 0 && sl2 == 0, 0);

    scenario.end();
}

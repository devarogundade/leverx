#[test_only]
module leverx::user_proxy_tests;

use leverx::user_proxy;
use sui::test_scenario;

#[test]
fun create_for_testing_sets_owner_and_manager() {
    let owner = @0xA11CE;
    let manager_id = object::id_from_address(@0xBEEF);
    let mut scenario = test_scenario::begin(owner);
    let ctx = scenario.ctx();

    let proxy = user_proxy::create_for_testing(owner, manager_id, ctx);
    assert!(user_proxy::owner(&proxy) == owner, 0);
    assert!(user_proxy::predict_manager_id(&proxy) == manager_id, 0);
    assert!(user_proxy::borrowed_quote(&proxy) == 0, 0);

    scenario.end();
}

#[test]
fun executor_registration_allows_session_actor() {
    let owner = @0xA11CE;
    let executor = @0xECEC;
    let manager_id = object::id_from_address(@0xBEEF);
    let mut scenario = test_scenario::begin(owner);
    let ctx = scenario.ctx();

    let mut proxy = user_proxy::create_for_testing(owner, manager_id, ctx);
    user_proxy::register_executor_cap(&mut proxy, executor, ctx);
    user_proxy::assert_can_act(&proxy, ctx);

    test_scenario::next_tx(&mut scenario, executor);
    let ctx2 = scenario.ctx();
    user_proxy::assert_can_act(&proxy, ctx2);

    scenario.end();
}

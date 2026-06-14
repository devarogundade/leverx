#[test_only]
module leverx::user_proxy_ledger_tests;

use leverx::{errors, protocol_registry, test_fixtures, triggers, user_proxy};
use sui::{coin, test_scenario};

#[test]
fun binary_quote_ledger_deposit() {
    let owner = @0xA11CE;
    let mut scenario = test_scenario::begin(owner);
    let ctx = scenario.ctx();

    let mut proxy = user_proxy::create_for_testing(owner, object::id_from_address(@0xBEEF), ctx);
    let key = test_fixtures::sample_binary_key();
    let mut quote_treasury = test_fixtures::quote_treasury(ctx);

    user_proxy::deposit_quote_for_binary(
        &mut proxy,
        key,
        coin::mint(&mut quote_treasury, 500, ctx),
        ctx,
    );

    assert!(user_proxy::binary_quote_balance(&proxy, key) == 500, 0);
    assert!(user_proxy::binary_margin_debt(&proxy, key) == 0, 0);

    scenario.end();
}

#[test]
fun binary_borrow_and_repay_accounting() {
    let owner = @0xA11CE;
    let mut scenario = test_scenario::begin(owner);
    let ctx = scenario.ctx();

    let mut proxy = user_proxy::create_for_testing(owner, object::id_from_address(@0xBEEF), ctx);
    let key = test_fixtures::sample_binary_key();

    user_proxy::record_borrow_for_binary(&mut proxy, key, 300, ctx);
    assert!(user_proxy::binary_borrowed_quote(&proxy, key) == 300, 0);
    assert!(user_proxy::borrowed_quote(&proxy) == 300, 0);

    user_proxy::record_repay_for_binary(&mut proxy, key, 100);
    assert!(user_proxy::binary_borrowed_quote(&proxy, key) == 200, 0);
    assert!(user_proxy::borrowed_quote(&proxy) == 200, 0);

    scenario.end();
}

#[test]
fun range_ledgers_mirror_binary_behavior() {
    let owner = @0xA11CE;
    let mut scenario = test_scenario::begin(owner);
    let ctx = scenario.ctx();

    let mut proxy = user_proxy::create_for_testing(owner, object::id_from_address(@0xBEEF), ctx);
    let key = test_fixtures::sample_range_key();
    let mut quote_treasury = test_fixtures::quote_treasury(ctx);

    user_proxy::deposit_quote_for_range(
        &mut proxy,
        key,
        coin::mint(&mut quote_treasury, 777, ctx),
        ctx,
    );
    user_proxy::record_borrow_for_range(&mut proxy, key, 111, ctx);
    user_proxy::set_range_margin_debt(&mut proxy, key, 400, ctx);

    assert!(user_proxy::range_quote_balance(&proxy, key) == 777, 0);
    assert!(user_proxy::range_borrowed_quote(&proxy, key) == 111, 0);
    assert!(user_proxy::range_margin_debt(&proxy, key) == 400, 0);

    scenario.end();
}

#[test]
fun margin_debt_clear() {
    let owner = @0xA11CE;
    let mut scenario = test_scenario::begin(owner);
    let ctx = scenario.ctx();

    let mut proxy = user_proxy::create_for_testing(owner, object::id_from_address(@0xBEEF), ctx);
    let key = test_fixtures::sample_binary_key();

    user_proxy::set_binary_margin_debt(&mut proxy, key, 1_000, ctx);
    assert!(user_proxy::binary_margin_debt(&proxy, key) == 1_000, 0);
    user_proxy::clear_binary_margin_debt(&mut proxy, key);
    assert!(user_proxy::binary_margin_debt(&proxy, key) == 0, 0);

    scenario.end();
}

#[test]
fun limit_order_reserve_release_and_cancel() {
    let owner = @0xA11CE;
    let mut scenario = test_scenario::begin(owner);
    let ctx = scenario.ctx();

    let mut proxy = user_proxy::create_for_testing(owner, object::id_from_address(@0xBEEF), ctx);
    let key = test_fixtures::sample_binary_key();
    let mut quote_treasury = test_fixtures::quote_treasury(ctx);

    user_proxy::deposit_quote_for_binary(
        &mut proxy,
        key,
        coin::mint(&mut quote_treasury, 1_000, ctx),
        ctx,
    );

    let order = user_proxy::new_pending_limit_mint_order(
        500_000_000,
        100,
        500_000_000,
        400,
        10_000,
        5,
        9_999_999_999,
        1,
        owner,
        true,
    );
    user_proxy::reserve_binary_quote(&mut proxy, key, 400, ctx);
    user_proxy::place_binary_limit_mint(&mut proxy, key, order);

    assert!(user_proxy::get_binary_limit_mint(&proxy, key).is_some(), 0);
    assert!(user_proxy::binary_quote_balance(&proxy, key) == 600, 0);

    user_proxy::cancel_binary_limit_mint_for_liquidation(&mut proxy, key, ctx);
    assert!(user_proxy::get_binary_limit_mint(&proxy, key).is_none(), 0);
    assert!(user_proxy::binary_quote_balance(&proxy, key) == 1_000, 0);

    scenario.end();
}

#[test]
#[expected_failure(abort_code = errors::E_LIMIT_ORDER_EXISTS)]
fun duplicate_limit_order_aborts() {
    let owner = @0xA11CE;
    let mut scenario = test_scenario::begin(owner);
    let ctx = scenario.ctx();

    let mut proxy = user_proxy::create_for_testing(owner, object::id_from_address(@0xBEEF), ctx);
    let key = test_fixtures::sample_binary_key();
    let order = user_proxy::new_pending_limit_mint_order(
        1, 0, 1, 1, 10_000, 1, 9, 1, owner, true,
    );

    user_proxy::place_binary_limit_mint(&mut proxy, key, order);
    user_proxy::place_binary_limit_mint(&mut proxy, key, order);

    scenario.end();
}

#[test]
fun limit_order_getters_expose_fields() {
    let owner = @0xA11CE;
    let mut scenario = test_scenario::begin(owner);
    let ctx = scenario.ctx();

    let mut proxy = user_proxy::create_for_testing(owner, object::id_from_address(@0xBEEF), ctx);
    let key = test_fixtures::sample_binary_key();
    let order = user_proxy::new_pending_limit_mint_order(
        500_000_000,
        250,
        510_000_000,
        1_000,
        10_000,
        7,
        123_456,
        99,
        owner,
        true,
    );
    user_proxy::place_binary_limit_mint(&mut proxy, key, order);

    let stored = user_proxy::get_binary_limit_mint(&proxy, key);
    assert!(stored.is_some(), 0);
    let order = stored.destroy_some();
    assert!(user_proxy::limit_premium_per_unit(&order) == 500_000_000, 0);
    assert!(user_proxy::slippage_bps(&order) == 250, 0);
    assert!(user_proxy::margin_quote(&order) == 1_000, 0);
    assert!(user_proxy::quantity(&order) == 7, 0);
    assert!(user_proxy::remint_after_deleverage(&order), 0);

    scenario.end();
}

#[test]
#[expected_failure(abort_code = errors::E_NOT_OWNER)]
fun non_owner_cannot_set_triggers_via_module() {
    let owner = @0xA11CE;
    let stranger = @0xBAD;
    let mut scenario = test_scenario::begin(owner);
    let ctx = scenario.ctx();

    let mut proxy = user_proxy::create_for_testing(owner, object::id_from_address(@0xBEEF), ctx);
    let key = test_fixtures::sample_binary_key();

    test_scenario::next_tx(&mut scenario, stranger);
    let ctx2 = scenario.ctx();
    triggers::set_automated_triggers(&mut proxy, key, 100, 50, 500, 500, ctx2);

    scenario.end();
}

#[test]
fun admin_executor_registration_via_registry() {
    let owner = @0xA11CE;
    let executor = @0xECEC;
    let mut scenario = test_scenario::begin(owner);
    let ctx = scenario.ctx();

    let setup = test_fixtures::setup_protocol<test_fixtures::TestQuote>(&mut scenario);
    let mut proxy = user_proxy::create_for_testing(owner, object::id_from_address(@0xBEEF), ctx);

    protocol_registry::register_executor_cap(test_fixtures::admin(&setup), &mut proxy, executor);
    test_scenario::next_tx(&mut scenario, executor);
    user_proxy::assert_can_act(&proxy, scenario.ctx());

    scenario.end();
}

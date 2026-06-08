#[test_only]
module leverx::trade_tests;

use leverx::{errors, leverage_vault, predict_client, protocol_constants, test_fixtures, trade, user_proxy};
use sui::{clock, coin, test_scenario};

// === Quote deposit (trade wrappers) ===

#[test]
fun deposit_quote_for_binary_market_credits_key() {
    let owner = @0xA11CE;
    let mut scenario = test_scenario::begin(owner);
    let ctx = scenario.ctx();

    let mut proxy = user_proxy::create_for_testing(owner, object::id_from_address(@0xBEEF), ctx);
    let key = test_fixtures::sample_binary_key();
    let mut quote_treasury = test_fixtures::quote_treasury(ctx);

    trade::deposit_quote_for_binary_market(
        &mut proxy,
        key,
        coin::mint(&mut quote_treasury, 2_500, ctx),
        ctx,
    );

    assert!(user_proxy::binary_quote_balance(&proxy, key) == 2_500, 0);
    scenario.end();
}

#[test]
fun deposit_quote_for_range_market_credits_key() {
    let owner = @0xA11CE;
    let mut scenario = test_scenario::begin(owner);
    let ctx = scenario.ctx();

    let mut proxy = user_proxy::create_for_testing(owner, object::id_from_address(@0xBEEF), ctx);
    let key = test_fixtures::sample_range_key();
    let mut quote_treasury = test_fixtures::quote_treasury(ctx);

    trade::deposit_quote_for_range_market(
        &mut proxy,
        key,
        coin::mint(&mut quote_treasury, 900, ctx),
        ctx,
    );

    assert!(user_proxy::range_quote_balance(&proxy, key) == 900, 0);
    scenario.end();
}

// === Resting limit order read / cancel ===

#[test]
fun get_binary_limit_mint_order_delegates_to_proxy() {
    let owner = @0xA11CE;
    let mut scenario = test_scenario::begin(owner);
    let ctx = scenario.ctx();

    let mut proxy = user_proxy::create_for_testing(owner, object::id_from_address(@0xBEEF), ctx);
    let key = test_fixtures::sample_binary_key();
    let order = user_proxy::new_pending_limit_mint_order(
        400_000_000,
        100,
        400_000_000,
        500,
        20_000,
        3,
        9_999_999_999,
        1,
        owner,
    );
    user_proxy::place_binary_limit_mint(&mut proxy, key, order);

    let stored = trade::get_binary_limit_mint_order(&proxy, key);
    assert!(stored.is_some(), 0);

    scenario.end();
}

#[test]
fun get_range_limit_mint_order_delegates_to_proxy() {
    let owner = @0xA11CE;
    let mut scenario = test_scenario::begin(owner);
    let ctx = scenario.ctx();

    let mut proxy = user_proxy::create_for_testing(owner, object::id_from_address(@0xBEEF), ctx);
    let key = test_fixtures::sample_range_key();
    let order = user_proxy::new_pending_limit_mint_order(
        300_000_000,
        50,
        300_000_000,
        250,
        20_000,
        2,
        9_999_999_999,
        1,
        owner,
    );
    user_proxy::place_range_limit_mint(&mut proxy, key, order);

    assert!(trade::get_range_limit_mint_order(&proxy, key).is_some(), 0);
    scenario.end();
}

#[test]
fun cancel_binary_limit_mint_order_releases_reserved_margin() {
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
        20_000,
        5,
        9_999_999_999,
        1,
        owner,
    );
    user_proxy::reserve_binary_quote(&mut proxy, key, 400, ctx);
    user_proxy::place_binary_limit_mint(&mut proxy, key, order);

    trade::cancel_binary_limit_mint_order<test_fixtures::TestCollateral>(&mut proxy, key, ctx);

    assert!(trade::get_binary_limit_mint_order(&proxy, key).is_none(), 0);
    assert!(user_proxy::binary_quote_balance(&proxy, key) == 1_000, 0);

    scenario.end();
}

#[test]
fun cancel_range_limit_mint_order_releases_reserved_margin() {
    let owner = @0xA11CE;
    let mut scenario = test_scenario::begin(owner);
    let ctx = scenario.ctx();

    let mut proxy = user_proxy::create_for_testing(owner, object::id_from_address(@0xBEEF), ctx);
    let key = test_fixtures::sample_range_key();
    let mut quote_treasury = test_fixtures::quote_treasury(ctx);

    user_proxy::deposit_quote_for_range(
        &mut proxy,
        key,
        coin::mint(&mut quote_treasury, 800, ctx),
        ctx,
    );

    let order = user_proxy::new_pending_limit_mint_order(
        600_000_000,
        200,
        600_000_000,
        300,
        20_000,
        4,
        9_999_999_999,
        1,
        owner,
    );
    user_proxy::reserve_range_quote(&mut proxy, key, 300, ctx);
    user_proxy::place_range_limit_mint(&mut proxy, key, order);

    trade::cancel_range_limit_mint_order<test_fixtures::TestCollateral>(&mut proxy, key, ctx);

    assert!(trade::get_range_limit_mint_order(&proxy, key).is_none(), 0);
    assert!(user_proxy::range_quote_balance(&proxy, key) == 800, 0);

    scenario.end();
}

// === Proxy factory entrypoints ===

#[test]
fun register_and_revoke_executor_entry() {
    let owner = @0xA11CE;
    let executor = @0xECEC;
    let mut scenario = test_scenario::begin(owner);
    let ctx = scenario.ctx();

    let mut proxy = user_proxy::create_for_testing(owner, object::id_from_address(@0xBEEF), ctx);
    trade::register_executor_entry(&mut proxy, executor, ctx);

    test_scenario::next_tx(&mut scenario, executor);
    user_proxy::assert_can_act(&proxy, scenario.ctx());

    test_scenario::next_tx(&mut scenario, owner);
    trade::revoke_executor_entry(&mut proxy, executor, scenario.ctx());

    scenario.end();
}

#[test]
fun link_predict_manager_entry_updates_proxy() {
    let owner = @0xA11CE;
    let mut scenario = test_scenario::begin(owner);
    let ctx = scenario.ctx();

    let mut proxy = user_proxy::create_for_testing(owner, object::id_from_address(@0xBEEF), ctx);
    let new_manager = object::id_from_address(@0xDEAD);

    trade::link_predict_manager_entry(&mut proxy, new_manager, ctx);
    assert!(user_proxy::predict_manager_id(&proxy) == new_manager, 0);

    scenario.end();
}

// === Deleverage / repay ===

#[test]
fun deleverage_binary_partial_repay_reduces_key_debt() {
    let owner = @0xA11CE;
    let mut scenario = test_scenario::begin(owner);
    let ctx = scenario.ctx();

    let mut setup = test_fixtures::setup_protocol<test_fixtures::TestQuote>(&mut scenario);
    let mut proxy = user_proxy::create_for_testing(owner, object::id_from_address(@0xBEEF), ctx);
    let key = test_fixtures::sample_binary_key();
    let clock = test_fixtures::test_clock(ctx);

    user_proxy::record_borrow_for_binary(&mut proxy, key, 1_000, ctx);
    leverage_vault::set_debt_for_testing(test_fixtures::vault_mut(&mut setup), 1_000, 1_000);

    trade::deleverage_binary_account_balance(
        test_fixtures::registry(&setup),
        test_fixtures::vault_mut(&mut setup),
        test_fixtures::collector_mut(&mut setup),
        &mut proxy,
        key,
        test_fixtures::mint_quote(400, test_fixtures::quote_treasury_mut(&mut setup), ctx),
        &clock,
        ctx,
    );

    assert!(user_proxy::binary_borrowed_quote(&proxy, key) == 600, 0);
    assert!(user_proxy::binary_quote_balance(&proxy, key) == 0, 0);

    clock::destroy_for_testing(clock);
    scenario.end();
}

#[test]
fun deleverage_binary_overpay_credits_surplus_to_key() {
    let owner = @0xA11CE;
    let mut scenario = test_scenario::begin(owner);
    let ctx = scenario.ctx();

    let mut setup = test_fixtures::setup_protocol<test_fixtures::TestQuote>(&mut scenario);
    let mut proxy = user_proxy::create_for_testing(owner, object::id_from_address(@0xBEEF), ctx);
    let key = test_fixtures::sample_binary_key();
    let clock = test_fixtures::test_clock(ctx);

    user_proxy::record_borrow_for_binary(&mut proxy, key, 1_000, ctx);
    leverage_vault::set_debt_for_testing(test_fixtures::vault_mut(&mut setup), 1_000, 1_000);

    trade::deleverage_binary_account_balance(
        test_fixtures::registry(&setup),
        test_fixtures::vault_mut(&mut setup),
        test_fixtures::collector_mut(&mut setup),
        &mut proxy,
        key,
        test_fixtures::mint_quote(1_500, test_fixtures::quote_treasury_mut(&mut setup), ctx),
        &clock,
        ctx,
    );

    assert!(user_proxy::binary_borrowed_quote(&proxy, key) == 0, 0);
    assert!(user_proxy::binary_quote_balance(&proxy, key) == 500, 0);

    clock::destroy_for_testing(clock);
    scenario.end();
}

#[test]
fun deleverage_range_partial_repay_reduces_key_debt() {
    let owner = @0xA11CE;
    let mut scenario = test_scenario::begin(owner);
    let ctx = scenario.ctx();

    let mut setup = test_fixtures::setup_protocol<test_fixtures::TestQuote>(&mut scenario);
    let mut proxy = user_proxy::create_for_testing(owner, object::id_from_address(@0xBEEF), ctx);
    let key = test_fixtures::sample_range_key();
    let clock = test_fixtures::test_clock(ctx);

    user_proxy::record_borrow_for_range(&mut proxy, key, 2_000, ctx);
    leverage_vault::set_debt_for_testing(test_fixtures::vault_mut(&mut setup), 2_000, 2_000);

    trade::deleverage_range_account_balance(
        test_fixtures::registry(&setup),
        test_fixtures::vault_mut(&mut setup),
        test_fixtures::collector_mut(&mut setup),
        &mut proxy,
        key,
        test_fixtures::mint_quote(500, test_fixtures::quote_treasury_mut(&mut setup), ctx),
        &clock,
        ctx,
    );

    assert!(user_proxy::range_borrowed_quote(&proxy, key) == 1_500, 0);

    clock::destroy_for_testing(clock);
    scenario.end();
}

#[test]
fun repay_debt_for_binary_uses_key_quote_balance() {
    let owner = @0xA11CE;
    let mut scenario = test_scenario::begin(owner);
    let ctx = scenario.ctx();

    let mut setup = test_fixtures::setup_protocol<test_fixtures::TestQuote>(&mut scenario);
    let mut proxy = user_proxy::create_for_testing(owner, object::id_from_address(@0xBEEF), ctx);
    let key = test_fixtures::sample_binary_key();
    let clock = test_fixtures::test_clock(ctx);

    user_proxy::deposit_quote_for_binary(
        &mut proxy,
        key,
        test_fixtures::mint_quote(1_000, test_fixtures::quote_treasury_mut(&mut setup), ctx),
        ctx,
    );
    user_proxy::record_borrow_for_binary(&mut proxy, key, 800, ctx);
    leverage_vault::set_debt_for_testing(test_fixtures::vault_mut(&mut setup), 800, 800);

    trade::repay_debt_for_binary(
        test_fixtures::registry(&setup),
        &mut proxy,
        test_fixtures::vault_mut(&mut setup),
        test_fixtures::collector_mut(&mut setup),
        key,
        300,
        &clock,
        ctx,
    );

    assert!(user_proxy::binary_borrowed_quote(&proxy, key) == 500, 0);
    assert!(user_proxy::binary_quote_balance(&proxy, key) == 700, 0);

    clock::destroy_for_testing(clock);
    scenario.end();
}

#[test]
fun repay_debt_for_range_uses_key_quote_balance() {
    let owner = @0xA11CE;
    let mut scenario = test_scenario::begin(owner);
    let ctx = scenario.ctx();

    let mut setup = test_fixtures::setup_protocol<test_fixtures::TestQuote>(&mut scenario);
    let mut proxy = user_proxy::create_for_testing(owner, object::id_from_address(@0xBEEF), ctx);
    let key = test_fixtures::sample_range_key();
    let clock = test_fixtures::test_clock(ctx);

    user_proxy::deposit_quote_for_range(
        &mut proxy,
        key,
        test_fixtures::mint_quote(600, test_fixtures::quote_treasury_mut(&mut setup), ctx),
        ctx,
    );
    user_proxy::record_borrow_for_range(&mut proxy, key, 400, ctx);
    leverage_vault::set_debt_for_testing(test_fixtures::vault_mut(&mut setup), 400, 400);

    trade::repay_debt_for_range(
        test_fixtures::registry(&setup),
        &mut proxy,
        test_fixtures::vault_mut(&mut setup),
        test_fixtures::collector_mut(&mut setup),
        key,
        200,
        &clock,
        ctx,
    );

    assert!(user_proxy::range_borrowed_quote(&proxy, key) == 200, 0);
    assert!(user_proxy::range_quote_balance(&proxy, key) == 400, 0);

    clock::destroy_for_testing(clock);
    scenario.end();
}

#[test]
#[expected_failure(abort_code = errors::E_ZERO_AMOUNT)]
fun deleverage_binary_rejects_zero_repayment() {
    let owner = @0xA11CE;
    let mut scenario = test_scenario::begin(owner);
    let ctx = scenario.ctx();

    let mut setup = test_fixtures::setup_protocol<test_fixtures::TestQuote>(&mut scenario);
    let mut proxy = user_proxy::create_for_testing(owner, object::id_from_address(@0xBEEF), ctx);
    let key = test_fixtures::sample_binary_key();
    let clock = test_fixtures::test_clock(ctx);

    trade::deleverage_binary_account_balance(
        test_fixtures::registry(&setup),
        test_fixtures::vault_mut(&mut setup),
        test_fixtures::collector_mut(&mut setup),
        &mut proxy,
        key,
        test_fixtures::mint_quote(0, test_fixtures::quote_treasury_mut(&mut setup), ctx),
        &clock,
        ctx,
    );

    clock::destroy_for_testing(clock);
    scenario.end();
}

// === Accounting ===

#[test]
fun synchronize_proxy_accounting_accrues_vault_interest() {
    let owner = @0xA11CE;
    let mut scenario = test_scenario::begin(owner);
    let ctx = scenario.ctx();

    let mut setup = test_fixtures::setup_protocol<test_fixtures::TestQuote>(&mut scenario);
    let proxy = user_proxy::create_for_testing(owner, object::id_from_address(@0xBEEF), ctx);
    let mut clock = test_fixtures::test_clock(ctx);

    leverage_vault::set_debt_for_testing(test_fixtures::vault_mut(&mut setup), 100, 100);
    leverage_vault::set_last_accrue_ms_for_testing(test_fixtures::vault_mut(&mut setup), 0);
    clock::increment_for_testing(&mut clock, protocol_constants::year_ms() / 4);

    trade::synchronize_proxy_accounting(test_fixtures::vault_mut(&mut setup), &proxy, &clock);
    assert!(leverage_vault::total_borrowed(test_fixtures::vault(&setup)) > 100, 0);

    clock::destroy_for_testing(clock);
    scenario.end();
}

// === Internal order validation (via test hooks) ===

#[test]
fun validate_redeem_limit_order_accepts_bid_at_floor() {
    let limit = 500_000_000;
    let quantity = 10;
    let floor_total = predict_client::cost_from_premium_per_unit(limit, quantity);
    trade::test_validate_redeem_order(
        protocol_constants::order_type_limit(),
        limit,
        0,
        limit,
        floor_total,
        quantity,
    );
}

#[test]
#[expected_failure(abort_code = errors::E_LIMIT_PRICE_NOT_MET)]
fun validate_redeem_limit_order_rejects_low_payout() {
    let limit = 500_000_000;
    let quantity = 10;
    let floor_total = predict_client::cost_from_premium_per_unit(limit, quantity);
    trade::test_validate_redeem_order(
        protocol_constants::order_type_limit(),
        limit,
        0,
        limit,
        floor_total - 1,
        quantity,
    );
}

#[test]
fun validate_redeem_market_order_respects_min_payout() {
    trade::test_validate_redeem_order(
        protocol_constants::order_type_market(),
        0,
        100,
        0,
        100,
        1,
    );
}

#[test]
#[expected_failure(abort_code = errors::E_SLIPPAGE_EXCEEDED)]
fun validate_redeem_market_order_rejects_below_min_payout() {
    trade::test_validate_redeem_order(
        protocol_constants::order_type_market(),
        0,
        100,
        0,
        99,
        1,
    );
}

#[test]
#[expected_failure(abort_code = errors::E_INVALID_ORDER_TYPE)]
fun validate_redeem_rejects_unknown_order_type() {
    trade::test_validate_redeem_order(99, 0, 0, 0, 0, 1);
}

#[test]
#[expected_failure(abort_code = errors::E_LIMIT_PRICE_NOT_MET)]
fun validate_redeem_limit_order_rejects_bid_below_floor() {
    trade::test_validate_redeem_order(
        protocol_constants::order_type_limit(),
        500_000_000,
        0,
        499_999_999,
        5_000_000_000,
        10,
    );
}

#[test]
#[expected_failure(abort_code = errors::E_INVALID_ORDER_TYPE)]
fun validate_mint_rejects_unknown_order_type() {
    trade::test_assert_mint_order_type(99);
}

#[test]
#[expected_failure(abort_code = errors::E_NOT_AUTHORIZED)]
fun cancel_binary_limit_requires_owner_or_executor() {
    let owner = @0xA11CE;
    let stranger = @0xBAD;
    let mut scenario = test_scenario::begin(owner);
    let ctx = scenario.ctx();

    let mut proxy = user_proxy::create_for_testing(owner, object::id_from_address(@0xBEEF), ctx);
    let key = test_fixtures::sample_binary_key();
    let order = user_proxy::new_pending_limit_mint_order(
        500_000_000, 100, 500_000_000, 400, 20_000, 5, 9_999_999_999, 1, owner,
    );
    user_proxy::place_binary_limit_mint(&mut proxy, key, order);

    test_scenario::next_tx(&mut scenario, stranger);
    trade::cancel_binary_limit_mint_order<test_fixtures::TestCollateral>(
        &mut proxy,
        key,
        scenario.ctx(),
    );

    scenario.end();
}

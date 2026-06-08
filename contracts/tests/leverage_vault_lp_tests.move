#[test_only]
module leverx::leverage_vault_lp_tests;

use leverx::{leverage_vault, lxplp, protocol_constants, test_fixtures};
use sui::{clock, coin, test_scenario};

#[test]
fun supply_and_withdraw_liquidity_roundtrip() {
    let owner = @0x1AA0;
    let mut scenario = test_scenario::begin(owner);
    let ctx = scenario.ctx();

    let lxplp_cap = lxplp::treasury_cap_for_testing(ctx);
    let mut vault = leverage_vault::create_for_testing<test_fixtures::TestQuote>(lxplp_cap, ctx);
    let mut quote_treasury = test_fixtures::quote_treasury(ctx);
    let mut clock = test_fixtures::test_clock(ctx);

    let lp = leverage_vault::deposit_liquidity(
        &mut vault,
        coin::mint(&mut quote_treasury, 1_000, ctx),
        &clock,
        ctx,
    );
    assert!(lp.value() == 1_000, 0);
    assert!(leverage_vault::total_shares(&vault) == 1_000, 0);

    let quote_back = leverage_vault::withdraw_liquidity(&mut vault, lp, &clock, ctx);
    assert!(quote_back.value() == 1_000, 0);
    assert!(leverage_vault::total_shares(&vault) == 0, 0);

    coin::burn_for_testing(quote_back);
    clock::destroy_for_testing(clock);
    scenario.end();
}

#[test]
fun accrue_interest_increases_total_borrowed() {
    let owner = @0x1AA0;
    let mut scenario = test_scenario::begin(owner);
    let ctx = scenario.ctx();

    let lxplp_cap = lxplp::treasury_cap_for_testing(ctx);
    let mut vault = leverage_vault::create_for_testing<test_fixtures::TestQuote>(lxplp_cap, ctx);
    let mut quote_treasury = test_fixtures::quote_treasury(ctx);
    leverage_vault::credit_balance_for_testing(
        &mut vault,
        coin::mint(&mut quote_treasury, 10_000, ctx),
    );
    leverage_vault::set_debt_for_testing(&mut vault, 5_000, 5_000);

    let mut clock = test_fixtures::test_clock(ctx);
    leverage_vault::set_last_accrue_ms_for_testing(&mut vault, 0);
    clock::increment_for_testing(&mut clock, protocol_constants::year_ms() / 2);
    leverage_vault::accrue_interest(&mut vault, &clock);

    assert!(leverage_vault::total_borrowed(&vault) > 5_000, 0);
    assert!(leverage_vault::insurance_fund_balance(&vault) == 0, 0);

    clock::destroy_for_testing(clock);
    scenario.end();
}

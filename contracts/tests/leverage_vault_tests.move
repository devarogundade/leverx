#[test_only]
module leverx::leverage_vault_tests;

use leverx::{errors, leverage_vault, lxplp, protocol_constants, test_fixtures};
use sui::{clock, coin, test_scenario};

#[test]
fun borrow_rate_below_kink_is_linear() {
    let owner = @0xB0B;
    let mut scenario = test_scenario::begin(owner);
    let ctx = scenario.ctx();
    let lxplp_cap = lxplp::treasury_cap_for_testing(ctx);
    let vault = leverage_vault::create_for_testing<test_fixtures::TestQuote>(lxplp_cap, ctx);

    let base = protocol_constants::default_base_rate_bps();
    let util = 4_000;
    let rate = leverage_vault::borrow_rate_at_utilization(&vault, util);
    let expected = base + protocol_constants::default_slope1_bps() * util / protocol_constants::bps();
    assert!(rate == expected, 0);

    scenario.end();
}

#[test]
fun borrow_rate_above_kink_uses_second_slope() {
    let owner = @0xB0B;
    let mut scenario = test_scenario::begin(owner);
    let ctx = scenario.ctx();
    let lxplp_cap = lxplp::treasury_cap_for_testing(ctx);
    let vault = leverage_vault::create_for_testing<test_fixtures::TestQuote>(lxplp_cap, ctx);

    let cfg_kink = protocol_constants::default_kink_util_bps();
    let rate_at_kink = leverage_vault::borrow_rate_at_utilization(&vault, cfg_kink);
    let rate_above = leverage_vault::borrow_rate_at_utilization(&vault, cfg_kink + 1_000);
    assert!(rate_above > rate_at_kink, 0);

    scenario.end();
}

#[test]
fun lp_apr_scales_with_utilization_and_vault_share() {
    let owner = @0xB0B;
    let mut scenario = test_scenario::begin(owner);
    let ctx = scenario.ctx();
    let lxplp_cap = lxplp::treasury_cap_for_testing(ctx);
    let vault = leverage_vault::create_for_testing<test_fixtures::TestQuote>(lxplp_cap, ctx);

    let borrow_rate = 2_000;
    let util = 5_000;
    let apr = leverage_vault::lp_apr_at_utilization(&vault, util, borrow_rate);
    let gross = protocol_constants::mul_bps(borrow_rate, util);
    let expected = protocol_constants::mul_bps(gross, protocol_constants::vault_fee_share_bps());
    assert!(apr == expected, 0);

    scenario.end();
}

#[test]
fun utilization_and_nav_reflect_deposits_and_debt() {
    let owner = @0xB0B;
    let mut scenario = test_scenario::begin(owner);
    let ctx = scenario.ctx();
    let lxplp_cap = lxplp::treasury_cap_for_testing(ctx);
    let mut vault = leverage_vault::create_for_testing<test_fixtures::TestQuote>(lxplp_cap, ctx);

    let mut quote_treasury = test_fixtures::quote_treasury(ctx);
    leverage_vault::credit_balance_for_testing(
        &mut vault,
        coin::mint(&mut quote_treasury, 900, ctx),
    );
    leverage_vault::set_debt_for_testing(&mut vault, 100, 100);

    assert!(leverage_vault::available_liquidity(&vault) == 900, 0);
    assert!(leverage_vault::total_borrowed(&vault) == 100, 0);
    assert!(leverage_vault::nav(&vault) == 1_000, 0);
    assert!(leverage_vault::utilization_bps(&vault) == 1_000, 0);

    scenario.end();
}

#[test]
fun debt_with_accrued_interest_scales_pro_rata() {
    let owner = @0xB0B;
    let mut scenario = test_scenario::begin(owner);
    let ctx = scenario.ctx();
    let lxplp_cap = lxplp::treasury_cap_for_testing(ctx);
    let mut vault = leverage_vault::create_for_testing<test_fixtures::TestQuote>(lxplp_cap, ctx);

    leverage_vault::set_debt_for_testing(&mut vault, 110, 100);
    let ledger_debt = leverage_vault::debt_with_accrued_interest(&vault, 50);
    assert!(ledger_debt == 55, 0);

    scenario.end();
}

#[test]
fun repayment_split_separates_interest_and_principal() {
    let owner = @0xB0B;
    let mut scenario = test_scenario::begin(owner);
    let ctx = scenario.ctx();
    let lxplp_cap = lxplp::treasury_cap_for_testing(ctx);
    let mut vault = leverage_vault::create_for_testing<test_fixtures::TestQuote>(lxplp_cap, ctx);

    leverage_vault::set_debt_for_testing(&mut vault, 120, 100);
    let (interest, principal) = leverage_vault::repayment_split_for_ledger_principal(&vault, 50, 60);
    assert!(interest == 10, 0);
    assert!(principal == 50, 0);

    scenario.end();
}

#[test]
fun flash_loan_fee_matches_configured_bps() {
    let owner = @0xB0B;
    let mut scenario = test_scenario::begin(owner);
    let ctx = scenario.ctx();
    let lxplp_cap = lxplp::treasury_cap_for_testing(ctx);
    let mut vault = leverage_vault::create_for_testing<test_fixtures::TestQuote>(lxplp_cap, ctx);
    let mut quote_treasury = test_fixtures::quote_treasury(ctx);
    leverage_vault::credit_balance_for_testing(
        &mut vault,
        coin::mint(&mut quote_treasury, 1_000_000, ctx),
    );

    let mut clock = test_fixtures::test_clock(ctx);
    let (borrowed, receipt) = leverage_vault::borrow_flash_liquidity(
        &mut vault,
        100_000,
        &clock,
        ctx,
    );
    let (amount, fee) = leverage_vault::flash_receipt_amounts(receipt);
    assert!(borrowed.value() == amount, 0);
    assert!(fee == protocol_constants::mul_bps(100_000, protocol_constants::default_flash_fee_bps()), 0);

    coin::burn_for_testing(borrowed);
    clock::destroy_for_testing(clock);
    scenario.end();
}

#[test]
#[expected_failure(abort_code = errors::E_INSUFFICIENT_VAULT_LIQUIDITY)]
fun flash_borrow_aborts_when_liquidity_insufficient() {
    let owner = @0xB0B;
    let mut scenario = test_scenario::begin(owner);
    let ctx = scenario.ctx();
    let lxplp_cap = lxplp::treasury_cap_for_testing(ctx);
    let mut vault = leverage_vault::create_for_testing<test_fixtures::TestQuote>(lxplp_cap, ctx);
    let clock = test_fixtures::test_clock(ctx);

    let (_coin, _receipt) = leverage_vault::borrow_flash_liquidity(&mut vault, 1, &clock, ctx);

    clock::destroy_for_testing(clock);
    scenario.end();
}

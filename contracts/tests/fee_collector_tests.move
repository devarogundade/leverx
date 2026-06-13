#[test_only]
module leverx::fee_collector_tests;

use leverx::{errors, fee_collector, leverage_vault, protocol_constants, test_fixtures};
use sui::{clock, coin, test_scenario};

#[test]
fun distribute_protocol_fee_splits_80_10_10() {
    let owner = @0xFEE;
    let mut scenario = test_scenario::begin(owner);
    let ctx = scenario.ctx();

    let mut setup = test_fixtures::setup_protocol<test_fixtures::TestQuote>(&mut scenario);

    let fee = test_fixtures::mint_quote(1_000, test_fixtures::quote_treasury_mut(&mut setup), ctx);
    fee_collector::distribute_protocol_fee(
        test_fixtures::vault_mut(&mut setup),
        test_fixtures::collector_mut(&mut setup),
        fee,
        protocol_constants::fee_source_liquidation(),
        ctx,
    );

    let vault_share = protocol_constants::mul_bps(1_000, protocol_constants::vault_fee_share_bps());
    let collector_share = protocol_constants::mul_bps(1_000, protocol_constants::fee_collector_share_bps());
    assert!(leverage_vault::available_liquidity(test_fixtures::vault(&setup)) == 1_000_000_000 + vault_share, 0);
    assert!(fee_collector::balance(test_fixtures::collector(&setup)) == collector_share, 0);
    assert!(fee_collector::total_collected(test_fixtures::collector(&setup)) == collector_share, 0);

    scenario.end();
}

#[test]
fun flash_loan_repay_credits_vault_and_splits_fee() {
    let owner = @0xFEE;
    let mut scenario = test_scenario::begin(owner);
    let ctx = scenario.ctx();

    let mut setup = test_fixtures::setup_protocol<test_fixtures::TestQuote>(&mut scenario);
    let mut clock = test_fixtures::test_clock(ctx);

    let (mut borrowed, receipt) = leverage_vault::borrow_flash_liquidity(
        test_fixtures::vault_mut(&mut setup),
        100_000,
        &clock,
        ctx,
    );
    let fee = protocol_constants::mul_bps(100_000, protocol_constants::default_flash_fee_bps());
    let fee_coin = test_fixtures::mint_quote(fee, test_fixtures::quote_treasury_mut(&mut setup), ctx);
    coin::join(&mut borrowed, fee_coin);

    let liquidity_before = leverage_vault::available_liquidity(test_fixtures::vault(&setup));
    fee_collector::repay_flash_liquidity(
        test_fixtures::vault_mut(&mut setup),
        test_fixtures::collector_mut(&mut setup),
        borrowed,
        receipt,
        object::id(test_fixtures::vault(&setup)),
        &clock,
        ctx,
    );

    assert!(leverage_vault::available_liquidity(test_fixtures::vault(&setup)) >= liquidity_before + 100_000, 0);
    assert!(fee_collector::balance(test_fixtures::collector(&setup)) > 0, 0);

    clock::destroy_for_testing(clock);
    scenario.end();
}

#[test]
#[expected_failure(abort_code = errors::E_INVALID_FLASH_REPAYMENT)]
fun flash_repay_aborts_when_underpaid() {
    let owner = @0xFEE;
    let mut scenario = test_scenario::begin(owner);
    let ctx = scenario.ctx();

    let mut setup = test_fixtures::setup_protocol<test_fixtures::TestQuote>(&mut scenario);
    let clock = test_fixtures::test_clock(ctx);

    let underpay = test_fixtures::mint_quote(1, test_fixtures::quote_treasury_mut(&mut setup), ctx);
    fee_collector::repay_flash_liquidity(
        test_fixtures::vault_mut(&mut setup),
        test_fixtures::collector_mut(&mut setup),
        underpay,
        leverage_vault::flash_receipt_for_testing(100, 1),
        object::id(test_fixtures::vault(&setup)),
        &clock,
        ctx,
    );

    clock::destroy_for_testing(clock);
    scenario.end();
}

#[test]
fun distribute_liquidation_surplus_funds_insurance() {
    let owner = @0xFEE;
    let mut scenario = test_scenario::begin(owner);
    let ctx = scenario.ctx();

    let mut setup = test_fixtures::setup_protocol<test_fixtures::TestQuote>(&mut scenario);
    let account_id = object::id(test_fixtures::vault(&setup));

    let skim = test_fixtures::mint_quote(1_000, test_fixtures::quote_treasury_mut(&mut setup), ctx);
    fee_collector::distribute_liquidation_surplus(
        test_fixtures::vault_mut(&mut setup),
        test_fixtures::collector_mut(&mut setup),
        account_id,
        skim,
        ctx,
    );

    let insurance_share = protocol_constants::mul_bps(1_000, protocol_constants::vault_fee_share_bps());
    assert!(leverage_vault::insurance_fund_balance(test_fixtures::vault(&setup)) == insurance_share, 0);

    scenario.end();
}

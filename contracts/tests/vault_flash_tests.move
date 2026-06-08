#[test_only]
module leverx::vault_flash_tests;

use leverx::{leverage_vault, protocol_constants, test_fixtures, vault_flash};
use sui::{clock, coin, test_scenario};

#[test]
fun borrow_and_repay_via_registry_wrappers() {
    let owner = @0xF1A50;
    let mut scenario = test_scenario::begin(owner);
    let ctx = scenario.ctx();

    let mut setup = test_fixtures::setup_protocol<test_fixtures::TestQuote>(&mut scenario);
    let mut clock = test_fixtures::test_clock(ctx);

    let (mut borrowed, receipt) = vault_flash::borrow_flash_liquidity(
        test_fixtures::registry(&setup),
        test_fixtures::vault_mut(&mut setup),
        50_000,
        &clock,
        ctx,
    );
    let fee = protocol_constants::mul_bps(50_000, protocol_constants::default_flash_fee_bps());
    coin::join(
        &mut borrowed,
        test_fixtures::mint_quote(fee, test_fixtures::quote_treasury_mut(&mut setup), ctx),
    );

    vault_flash::repay_flash_liquidity(
        test_fixtures::registry(&setup),
        test_fixtures::vault_mut(&mut setup),
        test_fixtures::collector_mut(&mut setup),
        borrowed,
        receipt,
        &clock,
        ctx,
    );

    assert!(leverage_vault::available_liquidity(test_fixtures::vault(&setup)) >= 1_000_000_000, 0);

    clock::destroy_for_testing(clock);
    scenario.end();
}

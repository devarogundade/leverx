#[test_only]
module leverx::test_fixtures;

use deepbook_predict::{market_key, range_key};
use leverx::{
    fee_collector,
    leverage_vault,
    lxplp,
    protocol_registry::{Self, AdminCap, LeverxRegistry},
};
use sui::{clock::{Self, Clock}, coin::{Self, Coin, TreasuryCap}, test_scenario};

public struct TestQuote has drop {}
public struct TestCollateral has drop {}

const FEED_ID: vector<u8> =
    x"0011223344556677889900112233445566778899001122334455667788990011";

public fun feed_id(): vector<u8> {
    FEED_ID
}

public fun quote_treasury(ctx: &mut TxContext): TreasuryCap<TestQuote> {
    coin::create_treasury_cap_for_testing(ctx)
}

public fun collateral_treasury(ctx: &mut TxContext): TreasuryCap<TestCollateral> {
    coin::create_treasury_cap_for_testing(ctx)
}

public fun mint_quote(amount: u64, treasury: &mut TreasuryCap<TestQuote>, ctx: &mut TxContext): Coin<TestQuote> {
    coin::mint(treasury, amount, ctx)
}

public fun mint_collateral(
    amount: u64,
    treasury: &mut TreasuryCap<TestCollateral>,
    ctx: &mut TxContext,
): Coin<TestCollateral> {
    coin::mint(treasury, amount, ctx)
}

public fun test_clock(ctx: &mut TxContext): Clock {
    clock::create_for_testing(ctx)
}

public fun sample_binary_key(): market_key::MarketKey {
    market_key::up(object::id_from_address(@0xCAFE), 1_700_000_000_000, 50_000_000_000)
}

public fun sample_range_key(): range_key::RangeKey {
    range_key::new(
        object::id_from_address(@0xCAFE),
        1_700_000_000_000,
        40_000_000_000,
        60_000_000_000,
    )
}

public struct ProtocolSetup<phantom Quote> {
    admin: AdminCap,
    registry: LeverxRegistry,
    vault: leverage_vault::LeverageVault<Quote>,
    collector: fee_collector::FeeCollector<Quote>,
    quote_treasury: TreasuryCap<Quote>,
}

public fun setup_protocol<Quote: drop>(
    scenario: &mut test_scenario::Scenario,
): ProtocolSetup<Quote> {
    let ctx = scenario.ctx();

    let lxplp_treasury = lxplp::treasury_cap_for_testing(ctx);
    let mut vault = leverage_vault::create_for_testing(lxplp_treasury, ctx);
    let vault_id = object::id(&vault);
    let mut collector = fee_collector::new_for_testing<Quote>(vault_id, ctx);
    let collector_id = object::id(&collector);

    let (admin, mut registry) = protocol_registry::create_for_testing(ctx);
    protocol_registry::link_vault_for_testing(&mut registry, vault_id, collector_id);
    protocol_registry::whitelist_collateral_asset<TestCollateral>(
        &admin,
        &mut registry,
        FEED_ID,
        6,
        8_000,
        8_500,
        1_000,
    );

    let mut quote_treasury = coin::create_treasury_cap_for_testing<Quote>(ctx);
    leverage_vault::credit_balance_for_testing(
        &mut vault,
        coin::mint(&mut quote_treasury, 1_000_000_000, ctx),
    );

    ProtocolSetup {
        admin,
        registry,
        vault,
        collector,
        quote_treasury,
    }
}

public fun admin<Quote>(setup: &ProtocolSetup<Quote>): &AdminCap {
    &setup.admin
}

public fun registry<Quote>(setup: &ProtocolSetup<Quote>): &LeverxRegistry {
    &setup.registry
}

public fun vault<Quote>(setup: &ProtocolSetup<Quote>): &leverage_vault::LeverageVault<Quote> {
    &setup.vault
}

public fun vault_mut<Quote>(setup: &mut ProtocolSetup<Quote>): &mut leverage_vault::LeverageVault<Quote> {
    &mut setup.vault
}

public fun collector<Quote>(setup: &ProtocolSetup<Quote>): &fee_collector::FeeCollector<Quote> {
    &setup.collector
}

public fun collector_mut<Quote>(setup: &mut ProtocolSetup<Quote>): &mut fee_collector::FeeCollector<Quote> {
    &mut setup.collector
}

public fun quote_treasury_mut<Quote>(setup: &mut ProtocolSetup<Quote>): &mut TreasuryCap<Quote> {
    &mut setup.quote_treasury
}

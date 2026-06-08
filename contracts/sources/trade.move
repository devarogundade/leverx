// Copyright (c) LeverX contributors
// SPDX-License-Identifier: Apache-2.0

/// Primary PTB (programmable transaction block) surface for LeverX leveraged prediction trading.
///
/// Composes `UserProxy`, `LeverageVault`, DeepBook Predict, and spot swap into user-callable
/// transaction functions: proxy factory, per-market-key collateral, swaps, leveraged mint/redeem,
/// resting limit orders, expiry settlement, deleverage/repay, and read-only quotes and health.
/// Mutating flows delegate to internal `execute_*` helpers and emit indexer events via `events`.
module leverx::trade;

use deepbook::{pool::Pool, registry::Registry};
use deepbook_predict::{
    market_key::MarketKey,
    oracle::OracleSVI,
    predict::Predict,
    predict_manager::PredictManager,
    range_key::RangeKey,
};
use leverx::{
    user_proxy::{Self, UserProxy},
    protocol_constants,
    errors,
    events,
    fee_collector::{Self, FeeCollector},
    ltv,
    predict_client,
    protocol_registry::{Self, LeverxRegistry},
    spot_swap,
    leverage_vault::{Self as vault_mod, LeverageVault},
};
use pyth::price_info::PriceInfoObject;
use std::u128;
use sui::{clock::Clock, coin::{Self, Coin}};
use token::deep::DEEP;

// === Factory ===

/// Create a new `UserProxy` owned by the sender and linked to a DeepBook Predict manager.
public entry fun create_user_proxy(
    deepbook_registry: &Registry,
    predict_manager_id: ID,
    ctx: &mut TxContext,
) {
    user_proxy::create(deepbook_registry, predict_manager_id, ctx);
}

/// Re-link the proxy to a different DeepBook Predict `PredictManager` (owner or executor).
public entry fun link_predict_manager_entry(
    proxy: &mut UserProxy,
    manager_id: ID,
    ctx: &TxContext,
) {
    user_proxy::link_predict_manager(proxy, manager_id, ctx);
}

/// Grant a session executor (e.g. bot key) permission to act on behalf of the proxy owner.
public entry fun register_executor_entry(
    proxy: &mut UserProxy,
    executor: address,
    ctx: &TxContext,
) {
    user_proxy::register_executor_cap(proxy, executor, ctx);
}

/// Revoke a previously registered session executor.
public entry fun revoke_executor_entry(
    proxy: &mut UserProxy,
    executor: address,
    ctx: &TxContext,
) {
    user_proxy::revoke_executor_cap(proxy, executor, ctx);
}

// === Collateral (per market key — not shared across positions) ===

/// Deposit collateral into a binary market key; emits `CollateralDeposited` with quote valuation.
public fun deposit_collateral_for_binary<Collateral, Quote>(
    registry: &LeverxRegistry,
    proxy: &mut UserProxy,
    key: MarketKey,
    collateral_oracle: &PriceInfoObject,
    quote_oracle: &PriceInfoObject,
    collateral: Coin<Collateral>,
    clock: &Clock,
    ctx: &mut TxContext,
) {
    let amount = collateral.value();
    assert!(amount > 0, errors::zero_amount());
    let _ = registry.collateral_config<Collateral>();
    proxy.deposit_collateral_for_binary(key, collateral, ctx);

    let value_quote = ltv::collateral_value_in_quote<Collateral, Quote>(
        registry,
        collateral_oracle,
        quote_oracle,
        amount,
        clock,
    );
    events::emit_collateral_deposited(
        object::id(proxy),
        proxy.owner(),
        key.oracle_id(),
        key.expiry(),
        key.strike(),
        0,
        key.is_up(),
        false,
        std::type_name::with_defining_ids<Collateral>(),
        amount,
        value_quote,
        proxy.binary_collateral_balance<Collateral>(key),
    );
}

/// Deposit collateral into a range market key; emits `CollateralDeposited` with quote valuation.
public fun deposit_collateral_for_range<Collateral, Quote>(
    registry: &LeverxRegistry,
    proxy: &mut UserProxy,
    key: RangeKey,
    collateral_oracle: &PriceInfoObject,
    quote_oracle: &PriceInfoObject,
    collateral: Coin<Collateral>,
    clock: &Clock,
    ctx: &mut TxContext,
) {
    let amount = collateral.value();
    assert!(amount > 0, errors::zero_amount());
    let _ = registry.collateral_config<Collateral>();
    proxy.deposit_collateral_for_range(key, collateral, ctx);

    let value_quote = ltv::collateral_value_in_quote<Collateral, Quote>(
        registry,
        collateral_oracle,
        quote_oracle,
        amount,
        clock,
    );
    events::emit_collateral_deposited(
        object::id(proxy),
        proxy.owner(),
        key.oracle_id(),
        key.expiry(),
        key.lower_strike(),
        key.higher_strike(),
        false,
        true,
        std::type_name::with_defining_ids<Collateral>(),
        amount,
        value_quote,
        proxy.range_collateral_balance<Collateral>(key),
    );
}

/// Deposit quote margin into a binary market key (no vault borrow).
public fun deposit_quote_for_binary_market<Quote>(
    proxy: &mut UserProxy,
    key: MarketKey,
    quote: Coin<Quote>,
    ctx: &mut TxContext,
) {
    proxy.deposit_quote_for_binary(key, quote, ctx);
}

/// Deposit quote margin into a range market key (no vault borrow).
public fun deposit_quote_for_range_market<Quote>(
    proxy: &mut UserProxy,
    key: RangeKey,
    quote: Coin<Quote>,
    ctx: &mut TxContext,
) {
    proxy.deposit_quote_for_range(key, quote, ctx);
}

/// Withdraw collateral from a binary market key after LTV check; accrues vault interest first.
public fun withdraw_collateral_for_binary<Collateral, Quote>(
    registry: &LeverxRegistry,
    proxy: &mut UserProxy,
    vault: &mut LeverageVault<Quote>,
    key: MarketKey,
    amount: u64,
    collateral_oracle: &PriceInfoObject,
    quote_oracle: &PriceInfoObject,
    clock: &Clock,
    ctx: &mut TxContext,
): Coin<Collateral> {
    proxy.assert_can_act(ctx);
    vault_mod::accrue_interest(vault, clock);
    let ledger_principal = proxy.binary_borrowed_quote(key);
    let debt = vault_mod::debt_with_accrued_interest(vault, ledger_principal);
    ltv::assert_withdraw_allowed<Collateral, Quote>(
        registry,
        proxy.binary_collateral_balance<Collateral>(key),
        proxy.binary_quote_balance(key),
        amount,
        debt,
        collateral_oracle,
        quote_oracle,
        clock,
    );
    let coin = proxy.withdraw_collateral_from_binary<Collateral>(key, amount, ctx);
    events::emit_collateral_withdrawn(
        object::id(proxy),
        proxy.owner(),
        key.oracle_id(),
        key.expiry(),
        key.strike(),
        0,
        key.is_up(),
        false,
        std::type_name::with_defining_ids<Collateral>(),
        amount,
        proxy.binary_collateral_balance<Collateral>(key),
    );
    coin
}

/// Withdraw collateral from a range market key after LTV check; accrues vault interest first.
public fun withdraw_collateral_for_range<Collateral, Quote>(
    registry: &LeverxRegistry,
    proxy: &mut UserProxy,
    vault: &mut LeverageVault<Quote>,
    key: RangeKey,
    amount: u64,
    collateral_oracle: &PriceInfoObject,
    quote_oracle: &PriceInfoObject,
    clock: &Clock,
    ctx: &mut TxContext,
): Coin<Collateral> {
    proxy.assert_can_act(ctx);
    vault_mod::accrue_interest(vault, clock);
    let ledger_principal = proxy.range_borrowed_quote(key);
    let debt = vault_mod::debt_with_accrued_interest(vault, ledger_principal);
    ltv::assert_withdraw_allowed<Collateral, Quote>(
        registry,
        proxy.range_collateral_balance<Collateral>(key),
        proxy.range_quote_balance(key),
        amount,
        debt,
        collateral_oracle,
        quote_oracle,
        clock,
    );
    let coin = proxy.withdraw_collateral_from_range<Collateral>(key, amount, ctx);
    events::emit_collateral_withdrawn(
        object::id(proxy),
        proxy.owner(),
        key.oracle_id(),
        key.expiry(),
        key.lower_strike(),
        key.higher_strike(),
        false,
        true,
        std::type_name::with_defining_ids<Collateral>(),
        amount,
        proxy.range_collateral_balance<Collateral>(key),
    );
    coin
}

// === Swap (quote credited to the market key) ===

/// Swap key collateral to quote via DeepBook spot; proceeds credited to the binary market key.
public fun swap_collateral_to_quote_for_binary<BaseAsset, QuoteAsset>(
    registry: &LeverxRegistry,
    proxy: &mut UserProxy,
    key: MarketKey,
    pool: &mut Pool<BaseAsset, QuoteAsset>,
    base_amount: u64,
    client_order_id: u64,
    clock: &Clock,
    ctx: &mut TxContext,
): u64 {
    spot_swap::assert_distinct_swap_assets<BaseAsset, QuoteAsset>();
    let base_coin = proxy.withdraw_collateral_from_binary<BaseAsset>(key, base_amount, ctx);
    proxy.deposit_physical(base_coin, ctx);
    let quote_received = spot_swap::swap_to_quote(
        registry,
        proxy,
        pool,
        base_amount,
        client_order_id,
        clock,
        ctx,
    );
    let quote_coin = proxy.withdraw_physical<QuoteAsset>(quote_received, ctx);
    proxy.deposit_quote_for_binary(key, quote_coin, ctx);
    events::emit_collateral_swapped(
        object::id(proxy),
        proxy.owner(),
        key.oracle_id(),
        key.expiry(),
        key.strike(),
        0,
        key.is_up(),
        false,
        std::type_name::with_defining_ids<BaseAsset>(),
        std::type_name::with_defining_ids<QuoteAsset>(),
        base_amount,
        quote_received,
        pool.id(),
        proxy.binary_collateral_balance<BaseAsset>(key),
        proxy.binary_quote_balance(key),
    );
    quote_received
}

/// Swap key collateral to quote via DeepBook spot; proceeds credited to the range market key.
public fun swap_collateral_to_quote_for_range<BaseAsset, QuoteAsset>(
    registry: &LeverxRegistry,
    proxy: &mut UserProxy,
    key: RangeKey,
    pool: &mut Pool<BaseAsset, QuoteAsset>,
    base_amount: u64,
    client_order_id: u64,
    clock: &Clock,
    ctx: &mut TxContext,
): u64 {
    spot_swap::assert_distinct_swap_assets<BaseAsset, QuoteAsset>();
    let base_coin = proxy.withdraw_collateral_from_range<BaseAsset>(key, base_amount, ctx);
    proxy.deposit_physical(base_coin, ctx);
    let quote_received = spot_swap::swap_to_quote(
        registry,
        proxy,
        pool,
        base_amount,
        client_order_id,
        clock,
        ctx,
    );
    let quote_coin = proxy.withdraw_physical<QuoteAsset>(quote_received, ctx);
    proxy.deposit_quote_for_range(key, quote_coin, ctx);
    events::emit_collateral_swapped(
        object::id(proxy),
        proxy.owner(),
        key.oracle_id(),
        key.expiry(),
        key.lower_strike(),
        key.higher_strike(),
        false,
        true,
        std::type_name::with_defining_ids<BaseAsset>(),
        std::type_name::with_defining_ids<QuoteAsset>(),
        base_amount,
        quote_received,
        pool.id(),
        proxy.range_collateral_balance<BaseAsset>(key),
        proxy.range_quote_balance(key),
    );
    quote_received
}

/// Swap collateral coins in-place via DeepBook; quote out credited to the binary market key.
public fun swap_collateral_to_quote_via_swaps_for_binary<BaseAsset, QuoteAsset>(
    registry: &LeverxRegistry,
    proxy: &mut UserProxy,
    key: MarketKey,
    pool: &mut Pool<BaseAsset, QuoteAsset>,
    base_in: Coin<BaseAsset>,
    fee_deep: Coin<DEEP>,
    min_quote_out: u64,
    clock: &Clock,
    ctx: &mut TxContext,
): (Coin<BaseAsset>, Coin<QuoteAsset>, Coin<DEEP>) {
    spot_swap::assert_distinct_swap_assets<BaseAsset, QuoteAsset>();
    let base_amount = base_in.value();
    let (base_left, quote_out, deep_left) = spot_swap::swap_collateral_coin(
        pool,
        base_in,
        fee_deep,
        min_quote_out,
        clock,
        ctx,
    );
    let quote_received = quote_out.value();
    proxy.deposit_quote_for_binary(key, quote_out, ctx);
    events::emit_collateral_swapped(
        object::id(proxy),
        proxy.owner(),
        key.oracle_id(),
        key.expiry(),
        key.strike(),
        0,
        key.is_up(),
        false,
        std::type_name::with_defining_ids<BaseAsset>(),
        std::type_name::with_defining_ids<QuoteAsset>(),
        base_amount,
        quote_received,
        pool.id(),
        proxy.binary_collateral_balance<BaseAsset>(key),
        proxy.binary_quote_balance(key),
    );
    (base_left, coin::zero(ctx), deep_left)
}

/// Swap collateral coins in-place via DeepBook; quote out credited to the range market key.
public fun swap_collateral_to_quote_via_swaps_for_range<BaseAsset, QuoteAsset>(
    registry: &LeverxRegistry,
    proxy: &mut UserProxy,
    key: RangeKey,
    pool: &mut Pool<BaseAsset, QuoteAsset>,
    base_in: Coin<BaseAsset>,
    fee_deep: Coin<DEEP>,
    min_quote_out: u64,
    clock: &Clock,
    ctx: &mut TxContext,
): (Coin<BaseAsset>, Coin<QuoteAsset>, Coin<DEEP>) {
    spot_swap::assert_distinct_swap_assets<BaseAsset, QuoteAsset>();
    let base_amount = base_in.value();
    let (base_left, quote_out, deep_left) = spot_swap::swap_collateral_coin(
        pool,
        base_in,
        fee_deep,
        min_quote_out,
        clock,
        ctx,
    );
    let quote_received = quote_out.value();
    proxy.deposit_quote_for_range(key, quote_out, ctx);
    events::emit_collateral_swapped(
        object::id(proxy),
        proxy.owner(),
        key.oracle_id(),
        key.expiry(),
        key.lower_strike(),
        key.higher_strike(),
        false,
        true,
        std::type_name::with_defining_ids<BaseAsset>(),
        std::type_name::with_defining_ids<QuoteAsset>(),
        base_amount,
        quote_received,
        pool.id(),
        proxy.range_collateral_balance<BaseAsset>(key),
        proxy.range_quote_balance(key),
    );
    (base_left, coin::zero(ctx), deep_left)
}

// === Leveraged binary ===

/// Market mint at current oracle ask with explicit slippage cap (`max_mint_cost`).
public fun leveraged_mint_binary_market<Collateral, Quote>(
    registry: &LeverxRegistry,
    vault: &mut LeverageVault<Quote>,
    proxy: &mut UserProxy,
    predict_global: &mut Predict,
    manager: &mut PredictManager,
    oracle: &OracleSVI,
    collateral_oracle: &PriceInfoObject,
    quote_oracle: &PriceInfoObject,
    key: MarketKey,
    margin_quote: u64,
    leverage_bps: u64,
    quantity: u64,
    max_mint_cost: u64,
    clock: &Clock,
    ctx: &mut TxContext,
) {
    execute_leveraged_mint_binary<Collateral, Quote>(
        registry,
        vault,
        proxy,
        predict_global,
        manager,
        oracle,
        collateral_oracle,
        quote_oracle,
        key,
        margin_quote,
        leverage_bps,
        quantity,
        protocol_constants::order_type_market(),
        0,
        max_mint_cost,
        0,
        true,
        clock,
        ctx,
    );
}

/// Immediate limit mint: fills when market ask is at or below `limit + slippage_bps`.
public fun leveraged_mint_binary_limit<Collateral, Quote>(
    registry: &LeverxRegistry,
    vault: &mut LeverageVault<Quote>,
    proxy: &mut UserProxy,
    predict_global: &mut Predict,
    manager: &mut PredictManager,
    oracle: &OracleSVI,
    collateral_oracle: &PriceInfoObject,
    quote_oracle: &PriceInfoObject,
    key: MarketKey,
    margin_quote: u64,
    leverage_bps: u64,
    quantity: u64,
    limit_premium_per_unit: u64,
    slippage_bps: u64,
    clock: &Clock,
    ctx: &mut TxContext,
) {
    execute_leveraged_mint_binary<Collateral, Quote>(
        registry,
        vault,
        proxy,
        predict_global,
        manager,
        oracle,
        collateral_oracle,
        quote_oracle,
        key,
        margin_quote,
        leverage_bps,
        quantity,
        protocol_constants::order_type_limit(),
        limit_premium_per_unit,
        0,
        slippage_bps,
        true,
        clock,
        ctx,
    );
}

/// Market redeem at current oracle bid with `min_payout` slippage floor.
public fun leveraged_redeem_binary_market<Quote>(
    registry: &LeverxRegistry,
    vault: &mut LeverageVault<Quote>,
    collector: &mut FeeCollector<Quote>,
    proxy: &mut UserProxy,
    predict_global: &mut Predict,
    manager: &mut PredictManager,
    oracle: &OracleSVI,
    key: MarketKey,
    quantity: u64,
    min_payout: u64,
    clock: &Clock,
    ctx: &mut TxContext,
) {
    execute_leveraged_redeem_binary(
        registry,
        vault,
        collector,
        proxy,
        predict_global,
        manager,
        oracle,
        key,
        quantity,
        protocol_constants::order_type_market(),
        0,
        min_payout,
        false,
        clock,
        ctx,
    );
}

/// Limit redeem: only fills when current market bid is at or above `min_premium_per_unit`.
public fun leveraged_redeem_binary_limit<Quote>(
    registry: &LeverxRegistry,
    vault: &mut LeverageVault<Quote>,
    collector: &mut FeeCollector<Quote>,
    proxy: &mut UserProxy,
    predict_global: &mut Predict,
    manager: &mut PredictManager,
    oracle: &OracleSVI,
    key: MarketKey,
    quantity: u64,
    min_premium_per_unit: u64,
    clock: &Clock,
    ctx: &mut TxContext,
) {
    execute_leveraged_redeem_binary(
        registry,
        vault,
        collector,
        proxy,
        predict_global,
        manager,
        oracle,
        key,
        quantity,
        protocol_constants::order_type_limit(),
        min_premium_per_unit,
        0,
        false,
        clock,
        ctx,
    );
}

// === Leveraged range ===

/// Market mint a range position at current oracle ask with explicit slippage cap (`max_mint_cost`).
public fun leveraged_mint_range_market<Collateral, Quote>(
    registry: &LeverxRegistry,
    vault: &mut LeverageVault<Quote>,
    proxy: &mut UserProxy,
    predict_global: &mut Predict,
    manager: &mut PredictManager,
    oracle: &OracleSVI,
    collateral_oracle: &PriceInfoObject,
    quote_oracle: &PriceInfoObject,
    key: RangeKey,
    margin_quote: u64,
    leverage_bps: u64,
    quantity: u64,
    max_mint_cost: u64,
    clock: &Clock,
    ctx: &mut TxContext,
) {
    execute_leveraged_mint_range<Collateral, Quote>(
        registry,
        vault,
        proxy,
        predict_global,
        manager,
        oracle,
        collateral_oracle,
        quote_oracle,
        key,
        margin_quote,
        leverage_bps,
        quantity,
        protocol_constants::order_type_market(),
        0,
        max_mint_cost,
        0,
        true,
        clock,
        ctx,
    );
}

/// Immediate limit mint for a range position: fills when market ask is at or below `limit + slippage_bps`.
public fun leveraged_mint_range_limit<Collateral, Quote>(
    registry: &LeverxRegistry,
    vault: &mut LeverageVault<Quote>,
    proxy: &mut UserProxy,
    predict_global: &mut Predict,
    manager: &mut PredictManager,
    oracle: &OracleSVI,
    collateral_oracle: &PriceInfoObject,
    quote_oracle: &PriceInfoObject,
    key: RangeKey,
    margin_quote: u64,
    leverage_bps: u64,
    quantity: u64,
    limit_premium_per_unit: u64,
    slippage_bps: u64,
    clock: &Clock,
    ctx: &mut TxContext,
) {
    execute_leveraged_mint_range<Collateral, Quote>(
        registry,
        vault,
        proxy,
        predict_global,
        manager,
        oracle,
        collateral_oracle,
        quote_oracle,
        key,
        margin_quote,
        leverage_bps,
        quantity,
        protocol_constants::order_type_limit(),
        limit_premium_per_unit,
        0,
        slippage_bps,
        true,
        clock,
        ctx,
    );
}

// === Resting limit mint orders (place / execute / cancel) ===

/// Register a resting binary buy limit. Anyone may call; market ask must align with limit ± slippage.
public fun place_binary_limit_mint_order<Collateral, Quote>(
    registry: &LeverxRegistry,
    proxy: &mut UserProxy,
    predict_global: &Predict,
    oracle: &OracleSVI,
    key: MarketKey,
    limit_premium_per_unit: u64,
    placement_slippage_bps: u64,
    margin_quote: u64,
    leverage_bps: u64,
    quantity: u64,
    expires_ms: u64,
    clock: &Clock,
    ctx: &mut TxContext,
) {
    assert!(!registry.trading_paused(), errors::trading_paused());
    proxy.assert_can_act(ctx);
    assert!(quantity > 0, errors::zero_quantity());
    assert!(margin_quote > 0, errors::zero_amount());
    assert!(
        proxy.binary_quote_balance(key) >= margin_quote,
        errors::insufficient_collateral(),
    );
    let now = clock.timestamp_ms();
    assert!(expires_ms > now, errors::invalid_limit_order_expiry());
    assert!(expires_ms <= key.expiry(), errors::invalid_limit_order_expiry());

    let (market_ask, _) =
        predict_client::market_ask_binary(predict_global, oracle, key, quantity, clock);
    predict_client::assert_premium_within_bounds(
        predict_global,
        key.oracle_id(),
        limit_premium_per_unit,
    );
    predict_client::assert_placement_price_aligned(
        market_ask,
        limit_premium_per_unit,
        placement_slippage_bps,
    );

    let order = user_proxy::new_pending_limit_mint_order(
        limit_premium_per_unit,
        placement_slippage_bps,
        market_ask,
        margin_quote,
        leverage_bps,
        quantity,
        expires_ms,
        now,
        ctx.sender(),
    );
    proxy.place_binary_limit_mint(key, order);
    user_proxy::reserve_binary_quote(proxy, key, margin_quote, ctx);

    events::emit_limit_mint_order_placed(
        object::id(proxy),
        proxy.owner(),
        key.oracle_id(),
        key.expiry(),
        key.strike(),
        0,
        false,
        key.is_up(),
        std::type_name::with_defining_ids<Collateral>(),
        limit_premium_per_unit,
        placement_slippage_bps,
        market_ask,
        margin_quote,
        leverage_bps,
        quantity,
        expires_ms,
        ctx.sender(),
    );
}

/// Register a resting range buy limit.
public fun place_range_limit_mint_order<Collateral, Quote>(
    registry: &LeverxRegistry,
    proxy: &mut UserProxy,
    predict_global: &Predict,
    oracle: &OracleSVI,
    key: RangeKey,
    limit_premium_per_unit: u64,
    placement_slippage_bps: u64,
    margin_quote: u64,
    leverage_bps: u64,
    quantity: u64,
    expires_ms: u64,
    clock: &Clock,
    ctx: &mut TxContext,
) {
    assert!(!registry.trading_paused(), errors::trading_paused());
    proxy.assert_can_act(ctx);
    assert!(quantity > 0, errors::zero_quantity());
    assert!(margin_quote > 0, errors::zero_amount());
    assert!(
        proxy.range_quote_balance(key) >= margin_quote,
        errors::insufficient_collateral(),
    );
    let now = clock.timestamp_ms();
    assert!(expires_ms > now, errors::invalid_limit_order_expiry());
    assert!(expires_ms <= key.expiry(), errors::invalid_limit_order_expiry());

    let (market_ask, _) =
        predict_client::market_ask_range(predict_global, oracle, key, quantity, clock);
    predict_client::assert_premium_within_bounds(
        predict_global,
        key.oracle_id(),
        limit_premium_per_unit,
    );
    predict_client::assert_placement_price_aligned(
        market_ask,
        limit_premium_per_unit,
        placement_slippage_bps,
    );

    let order = user_proxy::new_pending_limit_mint_order(
        limit_premium_per_unit,
        placement_slippage_bps,
        market_ask,
        margin_quote,
        leverage_bps,
        quantity,
        expires_ms,
        now,
        ctx.sender(),
    );
    proxy.place_range_limit_mint(key, order);
    user_proxy::reserve_range_quote(proxy, key, margin_quote, ctx);

    events::emit_limit_mint_order_placed(
        object::id(proxy),
        proxy.owner(),
        key.oracle_id(),
        key.expiry(),
        key.lower_strike(),
        key.higher_strike(),
        true,
        false,
        std::type_name::with_defining_ids<Collateral>(),
        limit_premium_per_unit,
        placement_slippage_bps,
        market_ask,
        margin_quote,
        leverage_bps,
        quantity,
        expires_ms,
        ctx.sender(),
    );
}

/// Fill a resting binary limit mint using the slippage frozen at placement.
public fun execute_binary_limit_mint_order<Collateral, Quote>(
    registry: &LeverxRegistry,
    vault: &mut LeverageVault<Quote>,
    proxy: &mut UserProxy,
    predict_global: &mut Predict,
    manager: &mut PredictManager,
    oracle: &OracleSVI,
    collateral_oracle: &PriceInfoObject,
    quote_oracle: &PriceInfoObject,
    key: MarketKey,
    clock: &Clock,
    ctx: &mut TxContext,
) {
    user_proxy::assert_binary_limit_mint_not_expired(proxy, key, clock);
    let order = proxy.take_binary_limit_mint(key);
    user_proxy::release_binary_quote_reserve(
        proxy,
        key,
        user_proxy::margin_quote(&order),
        ctx,
    );
    let (market_ask, mint_cost) = execute_placed_limit_mint_binary<Collateral, Quote>(
        registry,
        vault,
        proxy,
        predict_global,
        manager,
        oracle,
        collateral_oracle,
        quote_oracle,
        key,
        user_proxy::limit_premium_per_unit(&order),
        user_proxy::slippage_bps(&order),
        user_proxy::margin_quote(&order),
        user_proxy::leverage_bps(&order),
        user_proxy::quantity(&order),
        clock,
        ctx,
    );
    events::emit_limit_mint_order_executed(
        object::id(proxy),
        proxy.owner(),
        ctx.sender(),
        key.oracle_id(),
        key.expiry(),
        key.strike(),
        0,
        false,
        key.is_up(),
        std::type_name::with_defining_ids<Collateral>(),
        user_proxy::limit_premium_per_unit(&order),
        user_proxy::slippage_bps(&order),
        market_ask,
        mint_cost,
        user_proxy::quantity(&order),
        user_proxy::expires_ms(&order),
    );
}

/// Fill a resting range limit mint.
public fun execute_range_limit_mint_order<Collateral, Quote>(
    registry: &LeverxRegistry,
    vault: &mut LeverageVault<Quote>,
    proxy: &mut UserProxy,
    predict_global: &mut Predict,
    manager: &mut PredictManager,
    oracle: &OracleSVI,
    collateral_oracle: &PriceInfoObject,
    quote_oracle: &PriceInfoObject,
    key: RangeKey,
    clock: &Clock,
    ctx: &mut TxContext,
) {
    user_proxy::assert_range_limit_mint_not_expired(proxy, key, clock);
    let order = proxy.take_range_limit_mint(key);
    user_proxy::release_range_quote_reserve(
        proxy,
        key,
        user_proxy::margin_quote(&order),
        ctx,
    );
    let (market_ask, mint_cost) = execute_placed_limit_mint_range<Collateral, Quote>(
        registry,
        vault,
        proxy,
        predict_global,
        manager,
        oracle,
        collateral_oracle,
        quote_oracle,
        key,
        user_proxy::limit_premium_per_unit(&order),
        user_proxy::slippage_bps(&order),
        user_proxy::margin_quote(&order),
        user_proxy::leverage_bps(&order),
        user_proxy::quantity(&order),
        clock,
        ctx,
    );
    events::emit_limit_mint_order_executed(
        object::id(proxy),
        proxy.owner(),
        ctx.sender(),
        key.oracle_id(),
        key.expiry(),
        key.lower_strike(),
        key.higher_strike(),
        true,
        false,
        std::type_name::with_defining_ids<Collateral>(),
        user_proxy::limit_premium_per_unit(&order),
        user_proxy::slippage_bps(&order),
        market_ask,
        mint_cost,
        user_proxy::quantity(&order),
        user_proxy::expires_ms(&order),
    );
}

/// Cancel a resting binary limit mint order and release reserved quote margin.
public fun cancel_binary_limit_mint_order<Collateral>(
    proxy: &mut UserProxy,
    key: MarketKey,
    ctx: &mut TxContext,
) {
    proxy.assert_can_act(ctx);
    let order = proxy.cancel_binary_limit_mint(key);
    user_proxy::release_binary_quote_reserve(
        proxy,
        key,
        user_proxy::margin_quote(&order),
        ctx,
    );
    events::emit_limit_mint_order_cancelled(
        object::id(proxy),
        proxy.owner(),
        key.oracle_id(),
        key.expiry(),
        key.strike(),
        0,
        false,
        key.is_up(),
        std::type_name::with_defining_ids<Collateral>(),
        user_proxy::expires_ms(&order),
        ctx.sender(),
    );
}

/// Cancel a resting range limit mint order and release reserved quote margin.
public fun cancel_range_limit_mint_order<Collateral>(
    proxy: &mut UserProxy,
    key: RangeKey,
    ctx: &mut TxContext,
) {
    proxy.assert_can_act(ctx);
    let order = proxy.cancel_range_limit_mint(key);
    user_proxy::release_range_quote_reserve(
        proxy,
        key,
        user_proxy::margin_quote(&order),
        ctx,
    );
    events::emit_limit_mint_order_cancelled(
        object::id(proxy),
        proxy.owner(),
        key.oracle_id(),
        key.expiry(),
        key.lower_strike(),
        key.higher_strike(),
        true,
        false,
        std::type_name::with_defining_ids<Collateral>(),
        user_proxy::expires_ms(&order),
        ctx.sender(),
    );
}

/// Read the pending resting binary limit mint order for a market key, if any.
public fun get_binary_limit_mint_order(
    proxy: &UserProxy,
    key: MarketKey,
): Option<user_proxy::PendingLimitMintOrder> {
    proxy.get_binary_limit_mint(key)
}

/// Read the pending resting range limit mint order for a market key, if any.
public fun get_range_limit_mint_order(
    proxy: &UserProxy,
    key: RangeKey,
): Option<user_proxy::PendingLimitMintOrder> {
    proxy.get_range_limit_mint(key)
}

// === Redeem ===

/// Market redeem a range position at current oracle bid with `min_payout` slippage floor.
public fun leveraged_redeem_range_market<Quote>(
    registry: &LeverxRegistry,
    vault: &mut LeverageVault<Quote>,
    collector: &mut FeeCollector<Quote>,
    proxy: &mut UserProxy,
    predict_global: &mut Predict,
    manager: &mut PredictManager,
    oracle: &OracleSVI,
    key: RangeKey,
    quantity: u64,
    min_payout: u64,
    clock: &Clock,
    ctx: &mut TxContext,
) {
    execute_leveraged_redeem_range(
        registry,
        vault,
        collector,
        proxy,
        predict_global,
        manager,
        oracle,
        key,
        quantity,
        protocol_constants::order_type_market(),
        0,
        min_payout,
        false,
        clock,
        ctx,
    );
}

/// Limit redeem for a range position: only fills when market bid is at or above `min_premium_per_unit`.
public fun leveraged_redeem_range_limit<Quote>(
    registry: &LeverxRegistry,
    vault: &mut LeverageVault<Quote>,
    collector: &mut FeeCollector<Quote>,
    proxy: &mut UserProxy,
    predict_global: &mut Predict,
    manager: &mut PredictManager,
    oracle: &OracleSVI,
    key: RangeKey,
    quantity: u64,
    min_premium_per_unit: u64,
    clock: &Clock,
    ctx: &mut TxContext,
) {
    execute_leveraged_redeem_range(
        registry,
        vault,
        collector,
        proxy,
        predict_global,
        manager,
        oracle,
        key,
        quantity,
        protocol_constants::order_type_limit(),
        min_premium_per_unit,
        0,
        false,
        clock,
        ctx,
    );
}

// === Settlement ===

/// Redeem a settled binary position after oracle expiry; payout repays key debt and credits surplus.
public fun settle_expired_proxy_position<Quote>(
    registry: &LeverxRegistry,
    vault: &mut LeverageVault<Quote>,
    collector: &mut FeeCollector<Quote>,
    proxy: &mut UserProxy,
    predict_global: &mut Predict,
    manager: &mut PredictManager,
    oracle: &OracleSVI,
    key: MarketKey,
    quantity: u64,
    clock: &Clock,
    ctx: &mut TxContext,
) {
    assert!(!registry.trading_paused(), errors::trading_paused());
    assert!(oracle.is_settled(), errors::oracle_not_settled());
    proxy.assert_can_act(ctx);

    let balance_before = predict_client::manager_balance<Quote>(manager);
    predict_client::redeem_settled_permissionless<Quote>(
        predict_global,
        manager,
        oracle,
        key,
        quantity,
        clock,
        ctx,
    );
    let payout = predict_client::manager_balance<Quote>(manager) - balance_before;

    repay_from_payout_binary(vault, collector, proxy, manager, payout, key, quantity, true, clock, ctx);
}

/// Redeem a settled range position after oracle expiry; payout repays key debt and credits surplus.
public fun settle_expired_proxy_range<Quote>(
    registry: &LeverxRegistry,
    vault: &mut LeverageVault<Quote>,
    collector: &mut FeeCollector<Quote>,
    proxy: &mut UserProxy,
    predict_global: &mut Predict,
    manager: &mut PredictManager,
    oracle: &OracleSVI,
    key: RangeKey,
    quantity: u64,
    clock: &Clock,
    ctx: &mut TxContext,
) {
    assert!(!registry.trading_paused(), errors::trading_paused());
    assert!(oracle.is_settled(), errors::oracle_not_settled());
    proxy.assert_can_act(ctx);

    let balance_before = predict_client::manager_balance<Quote>(manager);
    predict_client::redeem_range<Quote>(
        predict_global,
        manager,
        oracle,
        key,
        quantity,
        clock,
        ctx,
    );
    let payout = predict_client::manager_balance<Quote>(manager) - balance_before;

    repay_from_payout_range(vault, collector, proxy, manager, payout, key, quantity, true, clock, ctx);
}

// === Accounting ===

/// Accrue vault interest and emit a proxy-wide borrowed-quote snapshot for indexers.
public fun synchronize_proxy_accounting<Quote>(
    vault: &mut LeverageVault<Quote>,
    proxy: &UserProxy,
    clock: &Clock,
) {
    vault_mod::accrue_interest(vault, clock);
    events::emit_proxy_accounting_synced(object::id(proxy), proxy.borrowed_quote());
}

// === Deleverage / Repay ===

/// Repay binary key vault debt from external quote coins; surplus credited back to the key.
public fun deleverage_binary_account_balance<Quote>(
    registry: &LeverxRegistry,
    vault: &mut LeverageVault<Quote>,
    collector: &mut FeeCollector<Quote>,
    proxy: &mut UserProxy,
    key: MarketKey,
    repayment_funds: Coin<Quote>,
    clock: &Clock,
    ctx: &mut TxContext,
) {
    proxy.assert_can_act(ctx);
    protocol_registry::assert_vault(registry, vault);
    protocol_registry::assert_fee_collector(registry, collector);
    vault_mod::accrue_interest(vault, clock);
    let amount = repayment_funds.value();
    assert!(amount > 0, errors::zero_amount());
    let ledger_principal = proxy.binary_borrowed_quote(key);
    let debt = vault_mod::debt_with_accrued_interest(vault, ledger_principal);
    let repay_amt = if (amount > debt) { debt } else { amount };
    let principal_repaid = if (repay_amt >= debt) {
        ledger_principal
    } else {
        ((repay_amt as u128) * (ledger_principal as u128) / (debt as u128)) as u64
    };
    let mut funds = repayment_funds;
    let repay_coin = funds.split(repay_amt, ctx);
    fee_collector::repay_vault_for_ledger_principal(
        vault,
        collector,
        repay_coin,
        ledger_principal,
        protocol_constants::fee_source_interest(),
        clock,
        ctx,
    );
    if (principal_repaid > 0) {
        proxy.record_repay_for_binary(key, principal_repaid);
    };
    events::emit_vault_repaid(
        object::id(vault),
        object::id(proxy),
        proxy.owner(),
        repay_amt,
        vault_mod::total_borrowed(vault),
        vault_mod::utilization_bps(vault),
        vault_mod::current_borrow_rate(vault),
        vault_mod::current_lp_apr_bps(vault),
    );
    if (funds.value() > 0) {
        proxy.credit_quote_for_binary(key, funds, ctx);
    } else {
        coin::destroy_zero(funds);
    };
    events::emit_debt_repaid(object::id(proxy), proxy.owner(), repay_amt, proxy.borrowed_quote());
}

/// Repay range key vault debt from external quote coins; surplus credited back to the key.
public fun deleverage_range_account_balance<Quote>(
    registry: &LeverxRegistry,
    vault: &mut LeverageVault<Quote>,
    collector: &mut FeeCollector<Quote>,
    proxy: &mut UserProxy,
    key: RangeKey,
    repayment_funds: Coin<Quote>,
    clock: &Clock,
    ctx: &mut TxContext,
) {
    proxy.assert_can_act(ctx);
    protocol_registry::assert_vault(registry, vault);
    protocol_registry::assert_fee_collector(registry, collector);
    vault_mod::accrue_interest(vault, clock);
    let amount = repayment_funds.value();
    assert!(amount > 0, errors::zero_amount());
    let ledger_principal = proxy.range_borrowed_quote(key);
    let debt = vault_mod::debt_with_accrued_interest(vault, ledger_principal);
    let repay_amt = if (amount > debt) { debt } else { amount };
    let principal_repaid = if (repay_amt >= debt) {
        ledger_principal
    } else {
        ((repay_amt as u128) * (ledger_principal as u128) / (debt as u128)) as u64
    };
    let mut funds = repayment_funds;
    let repay_coin = funds.split(repay_amt, ctx);
    fee_collector::repay_vault_for_ledger_principal(
        vault,
        collector,
        repay_coin,
        ledger_principal,
        protocol_constants::fee_source_interest(),
        clock,
        ctx,
    );
    if (principal_repaid > 0) {
        proxy.record_repay_for_range(key, principal_repaid);
    };
    events::emit_vault_repaid(
        object::id(vault),
        object::id(proxy),
        proxy.owner(),
        repay_amt,
        vault_mod::total_borrowed(vault),
        vault_mod::utilization_bps(vault),
        vault_mod::current_borrow_rate(vault),
        vault_mod::current_lp_apr_bps(vault),
    );
    if (funds.value() > 0) {
        proxy.credit_quote_for_range(key, funds, ctx);
    } else {
        coin::destroy_zero(funds);
    };
    events::emit_debt_repaid(object::id(proxy), proxy.owner(), repay_amt, proxy.borrowed_quote());
}

/// Repay binary key debt using quote already held on the market key.
public fun repay_debt_for_binary<Quote>(
    registry: &LeverxRegistry,
    proxy: &mut UserProxy,
    vault: &mut LeverageVault<Quote>,
    collector: &mut FeeCollector<Quote>,
    key: MarketKey,
    amount: u64,
    clock: &Clock,
    ctx: &mut TxContext,
) {
    let quote = proxy.withdraw_quote_from_binary<Quote>(key, amount, ctx);
    deleverage_binary_account_balance(
        registry,
        vault,
        collector,
        proxy,
        key,
        quote,
        clock,
        ctx,
    );
}

/// Repay range key debt using quote already held on the market key.
public fun repay_debt_for_range<Quote>(
    registry: &LeverxRegistry,
    proxy: &mut UserProxy,
    vault: &mut LeverageVault<Quote>,
    collector: &mut FeeCollector<Quote>,
    key: RangeKey,
    amount: u64,
    clock: &Clock,
    ctx: &mut TxContext,
) {
    let quote = proxy.withdraw_quote_from_range<Quote>(key, amount, ctx);
    deleverage_range_account_balance(
        registry,
        vault,
        collector,
        proxy,
        key,
        quote,
        clock,
        ctx,
    );
}

// === Read ===

/// Read-only quote for a leveraged binary mint. Returns `(market_ask_per_unit, mint_cost, borrow_quote)`.
public fun quote_leveraged_mint_binary<Collateral, Quote>(
    registry: &LeverxRegistry,
    proxy: &UserProxy,
    predict_global: &Predict,
    oracle: &OracleSVI,
    collateral_oracle: &PriceInfoObject,
    quote_oracle: &PriceInfoObject,
    key: MarketKey,
    margin_quote: u64,
    leverage_bps: u64,
    quantity: u64,
    clock: &Clock,
): (u64, u64, u64) {
    let (market_ask, mint_cost) =
        predict_client::market_ask_binary(predict_global, oracle, key, quantity, clock);
    let borrow_quote = quote_borrow_for_leverage_binary<Collateral, Quote>(
        registry,
        proxy,
        key,
        margin_quote,
        leverage_bps,
        collateral_oracle,
        quote_oracle,
        clock,
    );
    (market_ask, mint_cost, borrow_quote)
}

/// Read-only quote for a leveraged range mint.
public fun quote_leveraged_mint_range<Collateral, Quote>(
    registry: &LeverxRegistry,
    proxy: &UserProxy,
    predict_global: &Predict,
    oracle: &OracleSVI,
    collateral_oracle: &PriceInfoObject,
    quote_oracle: &PriceInfoObject,
    key: RangeKey,
    margin_quote: u64,
    leverage_bps: u64,
    quantity: u64,
    clock: &Clock,
): (u64, u64, u64) {
    let (market_ask, mint_cost) =
        predict_client::market_ask_range(predict_global, oracle, key, quantity, clock);
    let borrow_quote = quote_borrow_for_leverage_range<Collateral, Quote>(
        registry,
        proxy,
        key,
        margin_quote,
        leverage_bps,
        collateral_oracle,
        quote_oracle,
        clock,
    );
    (market_ask, mint_cost, borrow_quote)
}

/// Read-only quote for binary redeem. Returns `(market_bid_per_unit, expected_payout)`.
public fun quote_leveraged_redeem_binary(
    predict_global: &Predict,
    oracle: &OracleSVI,
    key: MarketKey,
    quantity: u64,
    clock: &Clock,
): (u64, u64) {
    predict_client::market_bid_binary(predict_global, oracle, key, quantity, clock)
}

/// Read-only quote for range redeem.
public fun quote_leveraged_redeem_range(
    predict_global: &Predict,
    oracle: &OracleSVI,
    key: RangeKey,
    quantity: u64,
    clock: &Clock,
): (u64, u64) {
    predict_client::market_bid_range(predict_global, oracle, key, quantity, clock)
}

/// True when the binary market key's LTV is at or below the asset liquidation threshold.
public fun is_binary_position_liquidatable<Collateral, Quote>(
    registry: &LeverxRegistry,
    vault: &mut LeverageVault<Quote>,
    proxy: &UserProxy,
    key: MarketKey,
    collateral_oracle: &PriceInfoObject,
    quote_oracle: &PriceInfoObject,
    clock: &Clock,
): bool {
    vault_mod::accrue_interest(vault, clock);
    let debt = vault_mod::debt_with_accrued_interest(vault, proxy.binary_borrowed_quote(key));
    let liq_max_age = protocol_registry::liquidation_pyth_max_age_secs(registry);
    ltv::is_liquidatable_with_max_age<Collateral, Quote>(
        registry,
        proxy.binary_collateral_balance<Collateral>(key),
        proxy.binary_quote_balance(key),
        debt,
        collateral_oracle,
        quote_oracle,
        liq_max_age,
        clock,
    )
}

/// True when the range market key's LTV is at or below the asset liquidation threshold.
public fun is_range_position_liquidatable<Collateral, Quote>(
    registry: &LeverxRegistry,
    vault: &mut LeverageVault<Quote>,
    proxy: &UserProxy,
    key: RangeKey,
    collateral_oracle: &PriceInfoObject,
    quote_oracle: &PriceInfoObject,
    clock: &Clock,
): bool {
    vault_mod::accrue_interest(vault, clock);
    let debt = vault_mod::debt_with_accrued_interest(vault, proxy.range_borrowed_quote(key));
    let liq_max_age = protocol_registry::liquidation_pyth_max_age_secs(registry);
    ltv::is_liquidatable_with_max_age<Collateral, Quote>(
        registry,
        proxy.range_collateral_balance<Collateral>(key),
        proxy.range_quote_balance(key),
        debt,
        collateral_oracle,
        quote_oracle,
        liq_max_age,
        clock,
    )
}

/// Current collateral health for a binary market key, in basis points (10_000 = 100% LTV).
public fun evaluate_binary_position_health<Collateral, Quote>(
    registry: &LeverxRegistry,
    vault: &mut LeverageVault<Quote>,
    proxy: &UserProxy,
    key: MarketKey,
    collateral_oracle: &PriceInfoObject,
    quote_oracle: &PriceInfoObject,
    clock: &Clock,
): u64 {
    vault_mod::accrue_interest(vault, clock);
    let debt = vault_mod::debt_with_accrued_interest(vault, proxy.binary_borrowed_quote(key));
    ltv::evaluate_account_health<Collateral, Quote>(
        registry,
        proxy.binary_collateral_balance<Collateral>(key),
        proxy.binary_quote_balance(key),
        debt,
        collateral_oracle,
        quote_oracle,
        clock,
    )
}

/// Current collateral health for a range market key, in basis points (10_000 = 100% LTV).
public fun evaluate_range_position_health<Collateral, Quote>(
    registry: &LeverxRegistry,
    vault: &mut LeverageVault<Quote>,
    proxy: &UserProxy,
    key: RangeKey,
    collateral_oracle: &PriceInfoObject,
    quote_oracle: &PriceInfoObject,
    clock: &Clock,
): u64 {
    vault_mod::accrue_interest(vault, clock);
    let debt = vault_mod::debt_with_accrued_interest(vault, proxy.range_borrowed_quote(key));
    ltv::evaluate_account_health<Collateral, Quote>(
        registry,
        proxy.range_collateral_balance<Collateral>(key),
        proxy.range_quote_balance(key),
        debt,
        collateral_oracle,
        quote_oracle,
        clock,
    )
}

// === Internal ===

fun quote_borrow_for_leverage_binary<Collateral, Quote>(
    registry: &LeverxRegistry,
    proxy: &UserProxy,
    key: MarketKey,
    margin_quote: u64,
    leverage_bps: u64,
    collateral_oracle: &PriceInfoObject,
    quote_oracle: &PriceInfoObject,
    clock: &Clock,
): u64 {
    assert!(margin_quote > 0, errors::zero_amount());
    assert!(
        leverage_bps >= protocol_constants::min_leverage_bps()
            && leverage_bps <= protocol_constants::max_leverage_bps(),
        errors::invalid_leverage(),
    );
    let position_quote = ltv::position_from_margin(margin_quote, leverage_bps);
    let borrow_quote = ltv::borrow_for_leverage(position_quote, margin_quote);
    ltv::assert_incremental_borrow_allowed<Collateral, Quote>(
        registry,
        collateral_oracle,
        quote_oracle,
        proxy.binary_collateral_balance<Collateral>(key),
        proxy.binary_borrowed_quote(key),
        borrow_quote,
        clock,
    );
    borrow_quote
}

fun quote_borrow_for_leverage_range<Collateral, Quote>(
    registry: &LeverxRegistry,
    proxy: &UserProxy,
    key: RangeKey,
    margin_quote: u64,
    leverage_bps: u64,
    collateral_oracle: &PriceInfoObject,
    quote_oracle: &PriceInfoObject,
    clock: &Clock,
): u64 {
    assert!(margin_quote > 0, errors::zero_amount());
    assert!(
        leverage_bps >= protocol_constants::min_leverage_bps()
            && leverage_bps <= protocol_constants::max_leverage_bps(),
        errors::invalid_leverage(),
    );
    let position_quote = ltv::position_from_margin(margin_quote, leverage_bps);
    let borrow_quote = ltv::borrow_for_leverage(position_quote, margin_quote);
    ltv::assert_incremental_borrow_allowed<Collateral, Quote>(
        registry,
        collateral_oracle,
        quote_oracle,
        proxy.range_collateral_balance<Collateral>(key),
        proxy.range_borrowed_quote(key),
        borrow_quote,
        clock,
    );
    borrow_quote
}

/// Fill a resting binary limit mint (uses frozen placement slippage).
fun execute_placed_limit_mint_binary<Collateral, Quote>(
    registry: &LeverxRegistry,
    vault: &mut LeverageVault<Quote>,
    proxy: &mut UserProxy,
    predict_global: &mut Predict,
    manager: &mut PredictManager,
    oracle: &OracleSVI,
    collateral_oracle: &PriceInfoObject,
    quote_oracle: &PriceInfoObject,
    key: MarketKey,
    limit_premium_per_unit: u64,
    slippage_bps: u64,
    margin_quote: u64,
    leverage_bps: u64,
    quantity: u64,
    clock: &Clock,
    ctx: &mut TxContext,
): (u64, u64) {
    let (market_ask, mint_cost) =
        predict_client::market_ask_binary(predict_global, oracle, key, quantity, clock);
    execute_leveraged_mint_binary<Collateral, Quote>(
        registry,
        vault,
        proxy,
        predict_global,
        manager,
        oracle,
        collateral_oracle,
        quote_oracle,
        key,
        margin_quote,
        leverage_bps,
        quantity,
        protocol_constants::order_type_limit(),
        limit_premium_per_unit,
        0,
        slippage_bps,
        false,
        clock,
        ctx,
    );
    (market_ask, mint_cost)
}

/// Fill a resting range limit mint (uses frozen placement slippage).
fun execute_placed_limit_mint_range<Collateral, Quote>(
    registry: &LeverxRegistry,
    vault: &mut LeverageVault<Quote>,
    proxy: &mut UserProxy,
    predict_global: &mut Predict,
    manager: &mut PredictManager,
    oracle: &OracleSVI,
    collateral_oracle: &PriceInfoObject,
    quote_oracle: &PriceInfoObject,
    key: RangeKey,
    limit_premium_per_unit: u64,
    slippage_bps: u64,
    margin_quote: u64,
    leverage_bps: u64,
    quantity: u64,
    clock: &Clock,
    ctx: &mut TxContext,
): (u64, u64) {
    let (market_ask, mint_cost) =
        predict_client::market_ask_range(predict_global, oracle, key, quantity, clock);
    execute_leveraged_mint_range<Collateral, Quote>(
        registry,
        vault,
        proxy,
        predict_global,
        manager,
        oracle,
        collateral_oracle,
        quote_oracle,
        key,
        margin_quote,
        leverage_bps,
        quantity,
        protocol_constants::order_type_limit(),
        limit_premium_per_unit,
        0,
        slippage_bps,
        false,
        clock,
        ctx,
    );
    (market_ask, mint_cost)
}

/// Core binary leveraged mint: borrow, fund Predict manager, mint, and emit `LeveragedPositionOpened`.
fun execute_leveraged_mint_binary<Collateral, Quote>(
    registry: &LeverxRegistry,
    vault: &mut LeverageVault<Quote>,
    proxy: &mut UserProxy,
    predict_global: &mut Predict,
    manager: &mut PredictManager,
    oracle: &OracleSVI,
    collateral_oracle: &PriceInfoObject,
    quote_oracle: &PriceInfoObject,
    key: MarketKey,
    margin_quote: u64,
    leverage_bps: u64,
    quantity: u64,
    order_type: u8,
    limit_premium_per_unit: u64,
    max_mint_cost: u64,
    slippage_bps: u64,
    require_auth: bool,
    clock: &Clock,
    ctx: &mut TxContext,
) {
    let (_, borrow_quote) = plan_leverage_binary<Collateral, Quote>(
        registry,
        proxy,
        manager,
        key,
        margin_quote,
        leverage_bps,
        collateral_oracle,
        quote_oracle,
        require_auth,
        clock,
        ctx,
    );
    let (market_ask, mint_cost) =
        predict_client::market_ask_binary(predict_global, oracle, key, quantity, clock);

    validate_mint_order(
        predict_global,
        key.oracle_id(),
        order_type,
        limit_premium_per_unit,
        slippage_bps,
        max_mint_cost,
        market_ask,
        mint_cost,
        quantity,
    );
    assert!(mint_cost <= margin_quote + borrow_quote, errors::mint_cost_exceeds_position());

    execute_borrow_binary(registry, vault, proxy, key, borrow_quote, clock, ctx);
    let funding = proxy.withdraw_quote_from_binary<Quote>(key, mint_cost, ctx);
    predict_client::deposit_quote(manager, funding, ctx);
    predict_client::mint_binary<Quote>(predict_global, manager, oracle, key, quantity, clock, ctx);

    emit_open_binary<Collateral>(
        proxy,
        manager,
        key,
        quantity,
        margin_quote,
        borrow_quote,
        leverage_bps,
        mint_cost,
        order_type,
        limit_premium_per_unit,
        market_ask,
        max_mint_cost,
    );
}

/// Core range leveraged mint: borrow, fund Predict manager, mint, and emit `LeveragedPositionOpened`.
fun execute_leveraged_mint_range<Collateral, Quote>(
    registry: &LeverxRegistry,
    vault: &mut LeverageVault<Quote>,
    proxy: &mut UserProxy,
    predict_global: &mut Predict,
    manager: &mut PredictManager,
    oracle: &OracleSVI,
    collateral_oracle: &PriceInfoObject,
    quote_oracle: &PriceInfoObject,
    key: RangeKey,
    margin_quote: u64,
    leverage_bps: u64,
    quantity: u64,
    order_type: u8,
    limit_premium_per_unit: u64,
    max_mint_cost: u64,
    slippage_bps: u64,
    require_auth: bool,
    clock: &Clock,
    ctx: &mut TxContext,
) {
    let (_, borrow_quote) = plan_leverage_range<Collateral, Quote>(
        registry,
        proxy,
        manager,
        key,
        margin_quote,
        leverage_bps,
        collateral_oracle,
        quote_oracle,
        require_auth,
        clock,
        ctx,
    );
    let (market_ask, mint_cost) =
        predict_client::market_ask_range(predict_global, oracle, key, quantity, clock);

    validate_mint_order(
        predict_global,
        key.oracle_id(),
        order_type,
        limit_premium_per_unit,
        slippage_bps,
        max_mint_cost,
        market_ask,
        mint_cost,
        quantity,
    );
    assert!(mint_cost <= margin_quote + borrow_quote, errors::mint_cost_exceeds_position());

    execute_borrow_range(registry, vault, proxy, key, borrow_quote, clock, ctx);
    let funding = proxy.withdraw_quote_from_range<Quote>(key, mint_cost, ctx);
    predict_client::deposit_quote(manager, funding, ctx);
    predict_client::mint_range<Quote>(predict_global, manager, oracle, key, quantity, clock, ctx);

    emit_open_range<Collateral>(
        proxy,
        manager,
        key,
        quantity,
        margin_quote,
        borrow_quote,
        leverage_bps,
        mint_cost,
        order_type,
        limit_premium_per_unit,
        market_ask,
        max_mint_cost,
    );
}

fun assert_valid_order_type(order_type: u8) {
    assert!(
        order_type == protocol_constants::order_type_limit()
            || order_type == protocol_constants::order_type_market(),
        errors::invalid_order_type(),
    );
}

fun validate_mint_order(
    predict_global: &Predict,
    oracle_id: ID,
    order_type: u8,
    limit_premium_per_unit: u64,
    slippage_bps: u64,
    max_mint_cost: u64,
    market_ask: u64,
    mint_cost: u64,
    quantity: u64,
) {
    assert_valid_order_type(order_type);
    if (order_type == protocol_constants::order_type_limit()) {
        predict_client::assert_premium_within_bounds(predict_global, oracle_id, limit_premium_per_unit);
        predict_client::assert_limit_buy_fill_met(market_ask, limit_premium_per_unit, slippage_bps);
        let max_ask = predict_client::max_acceptable_buy_ask(limit_premium_per_unit, slippage_bps);
        let max_total = predict_client::cost_from_premium_per_unit(max_ask, quantity);
        assert!(mint_cost <= max_total, errors::limit_price_not_met());
    } else {
        predict_client::assert_market_slippage(max_mint_cost, mint_cost);
        predict_client::assert_premium_within_bounds(predict_global, oracle_id, market_ask);
    };
}

/// Core binary redeem: validate order, redeem via Predict, repay key debt from payout.
fun execute_leveraged_redeem_binary<Quote>(
    registry: &LeverxRegistry,
    vault: &mut LeverageVault<Quote>,
    collector: &mut FeeCollector<Quote>,
    proxy: &mut UserProxy,
    predict_global: &mut Predict,
    manager: &mut PredictManager,
    oracle: &OracleSVI,
    key: MarketKey,
    quantity: u64,
    order_type: u8,
    limit_premium_per_unit: u64,
    min_payout: u64,
    is_settled: bool,
    clock: &Clock,
    ctx: &mut TxContext,
) {
    assert!(!registry.trading_paused(), errors::trading_paused());
    proxy.assert_can_act(ctx);
    assert!(object::id(manager) == proxy.predict_manager_id(), errors::invalid_manager());

    let (market_bid, expected_payout) =
        predict_client::market_bid_binary(predict_global, oracle, key, quantity, clock);
    validate_redeem_order(
        order_type,
        limit_premium_per_unit,
        min_payout,
        market_bid,
        expected_payout,
        quantity,
    );

    let balance_before = predict_client::manager_balance<Quote>(manager);
    predict_client::redeem_binary<Quote>(predict_global, manager, oracle, key, quantity, clock, ctx);
    let payout = predict_client::manager_balance<Quote>(manager) - balance_before;

    repay_from_payout_binary(vault, collector, proxy, manager, payout, key, quantity, is_settled, clock, ctx);
}

/// Core range redeem: validate order, redeem via Predict, repay key debt from payout.
fun execute_leveraged_redeem_range<Quote>(
    registry: &LeverxRegistry,
    vault: &mut LeverageVault<Quote>,
    collector: &mut FeeCollector<Quote>,
    proxy: &mut UserProxy,
    predict_global: &mut Predict,
    manager: &mut PredictManager,
    oracle: &OracleSVI,
    key: RangeKey,
    quantity: u64,
    order_type: u8,
    limit_premium_per_unit: u64,
    min_payout: u64,
    is_settled: bool,
    clock: &Clock,
    ctx: &mut TxContext,
) {
    assert!(!registry.trading_paused(), errors::trading_paused());
    proxy.assert_can_act(ctx);
    assert!(object::id(manager) == proxy.predict_manager_id(), errors::invalid_manager());

    let (market_bid, expected_payout) =
        predict_client::market_bid_range(predict_global, oracle, key, quantity, clock);
    validate_redeem_order(
        order_type,
        limit_premium_per_unit,
        min_payout,
        market_bid,
        expected_payout,
        quantity,
    );

    let balance_before = predict_client::manager_balance<Quote>(manager);
    predict_client::redeem_range<Quote>(predict_global, manager, oracle, key, quantity, clock, ctx);
    let payout = predict_client::manager_balance<Quote>(manager) - balance_before;

    repay_from_payout_range(vault, collector, proxy, manager, payout, key, quantity, is_settled, clock, ctx);
}

fun validate_redeem_order(
    order_type: u8,
    limit_premium_per_unit: u64,
    min_payout: u64,
    market_bid: u64,
    expected_payout: u64,
    quantity: u64,
) {
    assert_valid_order_type(order_type);
    if (order_type == protocol_constants::order_type_limit()) {
        predict_client::assert_limit_sell_bid_met(market_bid, limit_premium_per_unit);
        let floor_total =
            predict_client::cost_from_premium_per_unit(limit_premium_per_unit, quantity);
        assert!(expected_payout >= floor_total, errors::limit_price_not_met());
    } else {
        predict_client::assert_redeem_slippage(min_payout, expected_payout);
    };
}

fun plan_leverage_binary<Collateral, Quote>(
    registry: &LeverxRegistry,
    proxy: &mut UserProxy,
    manager: &PredictManager,
    key: MarketKey,
    margin_quote: u64,
    leverage_bps: u64,
    collateral_oracle: &PriceInfoObject,
    quote_oracle: &PriceInfoObject,
    require_auth: bool,
    clock: &Clock,
    ctx: &TxContext,
): (u64, u64) {
    assert!(!registry.trading_paused(), errors::trading_paused());
    if (require_auth) {
        proxy.assert_can_act(ctx);
    };
    assert!(object::id(manager) == proxy.predict_manager_id(), errors::invalid_manager());
    assert!(margin_quote > 0, errors::zero_amount());
    assert!(
        leverage_bps >= protocol_constants::min_leverage_bps()
            && leverage_bps <= protocol_constants::max_leverage_bps(),
        errors::invalid_leverage(),
    );

    let position_quote = ltv::position_from_margin(margin_quote, leverage_bps);
    let borrow_quote = ltv::borrow_for_leverage(position_quote, margin_quote);

    ltv::assert_incremental_borrow_allowed<Collateral, Quote>(
        registry,
        collateral_oracle,
        quote_oracle,
        proxy.binary_collateral_balance<Collateral>(key),
        proxy.binary_borrowed_quote(key),
        borrow_quote,
        clock,
    );

    assert!(
        proxy.binary_quote_balance(key) >= margin_quote,
        errors::insufficient_collateral(),
    );
    (0, borrow_quote)
}

fun plan_leverage_range<Collateral, Quote>(
    registry: &LeverxRegistry,
    proxy: &mut UserProxy,
    manager: &PredictManager,
    key: RangeKey,
    margin_quote: u64,
    leverage_bps: u64,
    collateral_oracle: &PriceInfoObject,
    quote_oracle: &PriceInfoObject,
    require_auth: bool,
    clock: &Clock,
    ctx: &TxContext,
): (u64, u64) {
    assert!(!registry.trading_paused(), errors::trading_paused());
    if (require_auth) {
        proxy.assert_can_act(ctx);
    };
    assert!(object::id(manager) == proxy.predict_manager_id(), errors::invalid_manager());
    assert!(margin_quote > 0, errors::zero_amount());
    assert!(
        leverage_bps >= protocol_constants::min_leverage_bps()
            && leverage_bps <= protocol_constants::max_leverage_bps(),
        errors::invalid_leverage(),
    );

    let position_quote = ltv::position_from_margin(margin_quote, leverage_bps);
    let borrow_quote = ltv::borrow_for_leverage(position_quote, margin_quote);

    ltv::assert_incremental_borrow_allowed<Collateral, Quote>(
        registry,
        collateral_oracle,
        quote_oracle,
        proxy.range_collateral_balance<Collateral>(key),
        proxy.range_borrowed_quote(key),
        borrow_quote,
        clock,
    );

    assert!(
        proxy.range_quote_balance(key) >= margin_quote,
        errors::insufficient_collateral(),
    );
    (0, borrow_quote)
}

/// Borrow quote from the vault for a binary market key and record proxy debt.
fun execute_borrow_binary<Quote>(
    registry: &LeverxRegistry,
    vault: &mut LeverageVault<Quote>,
    proxy: &mut UserProxy,
    key: MarketKey,
    borrow_quote: u64,
    clock: &Clock,
    ctx: &mut TxContext,
) {
    protocol_registry::assert_vault(registry, vault);
    if (borrow_quote > 0) {
        let borrowed = vault_mod::borrow(vault, borrow_quote, clock, ctx);
        proxy.credit_quote_for_binary(key, borrowed, ctx);
        proxy.record_borrow_for_binary(key, borrow_quote, ctx);
        events::emit_vault_borrowed(
            object::id(vault),
            object::id(proxy),
            proxy.owner(),
            borrow_quote,
            vault_mod::total_borrowed(vault),
            vault_mod::utilization_bps(vault),
            vault_mod::current_borrow_rate(vault),
            vault_mod::current_lp_apr_bps(vault),
        );
        events::emit_debt_borrowed(
            object::id(proxy),
            proxy.owner(),
            borrow_quote,
            proxy.borrowed_quote(),
        );
    };
}

/// Borrow quote from the vault for a range market key and record proxy debt.
fun execute_borrow_range<Quote>(
    registry: &LeverxRegistry,
    vault: &mut LeverageVault<Quote>,
    proxy: &mut UserProxy,
    key: RangeKey,
    borrow_quote: u64,
    clock: &Clock,
    ctx: &mut TxContext,
) {
    protocol_registry::assert_vault(registry, vault);
    if (borrow_quote > 0) {
        let borrowed = vault_mod::borrow(vault, borrow_quote, clock, ctx);
        proxy.credit_quote_for_range(key, borrowed, ctx);
        proxy.record_borrow_for_range(key, borrow_quote, ctx);
        events::emit_vault_borrowed(
            object::id(vault),
            object::id(proxy),
            proxy.owner(),
            borrow_quote,
            vault_mod::total_borrowed(vault),
            vault_mod::utilization_bps(vault),
            vault_mod::current_borrow_rate(vault),
            vault_mod::current_lp_apr_bps(vault),
        );
        events::emit_debt_borrowed(
            object::id(proxy),
            proxy.owner(),
            borrow_quote,
            proxy.borrowed_quote(),
        );
    };
}

fun repay_from_payout_binary<Quote>(
    vault: &mut LeverageVault<Quote>,
    collector: &mut FeeCollector<Quote>,
    proxy: &mut UserProxy,
    manager: &mut PredictManager,
    payout: u64,
    key: MarketKey,
    quantity: u64,
    is_settled: bool,
    clock: &Clock,
    ctx: &mut TxContext,
) {
    if (payout == 0) return;

    vault_mod::accrue_interest(vault, clock);
    let ledger_principal = proxy.binary_borrowed_quote(key);
    let debt = vault_mod::debt_with_accrued_interest(vault, ledger_principal);
    let repay_amt = if (payout >= debt) { debt } else { payout };
    let principal_repaid = if (repay_amt >= debt) {
        ledger_principal
    } else {
        ((repay_amt as u128) * (ledger_principal as u128) / (debt as u128)) as u64
    };
    let surplus = payout - repay_amt;

    let mut payout_coin = predict_client::withdraw_quote(manager, payout, ctx);
    if (repay_amt > 0) {
        let repay_coin = payout_coin.split(repay_amt, ctx);
        fee_collector::repay_vault_for_ledger_principal(
            vault,
            collector,
            repay_coin,
            ledger_principal,
            protocol_constants::fee_source_interest(),
            clock,
            ctx,
        );
        if (principal_repaid > 0) {
            proxy.record_repay_for_binary(key, principal_repaid);
        };
        events::emit_vault_repaid(
            object::id(vault),
            object::id(proxy),
            proxy.owner(),
            repay_amt,
            vault_mod::total_borrowed(vault),
            vault_mod::utilization_bps(vault),
            vault_mod::current_borrow_rate(vault),
            vault_mod::current_lp_apr_bps(vault),
        );
        events::emit_debt_repaid(object::id(proxy), proxy.owner(), repay_amt, proxy.borrowed_quote());
    };
    if (payout_coin.value() > 0) {
        proxy.credit_quote_for_binary(key, payout_coin, ctx);
    } else {
        coin::destroy_zero(payout_coin);
    };

    events::emit_leveraged_position_closed(
        object::id(proxy),
        proxy.owner(),
        object::id(manager),
        key.oracle_id(),
        key.expiry(),
        key.strike(),
        0,
        key.is_up(),
        false,
        quantity,
        payout,
        repay_amt,
        surplus,
        proxy.binary_borrowed_quote(key),
        is_settled,
    );
}

fun repay_from_payout_range<Quote>(
    vault: &mut LeverageVault<Quote>,
    collector: &mut FeeCollector<Quote>,
    proxy: &mut UserProxy,
    manager: &mut PredictManager,
    payout: u64,
    key: RangeKey,
    quantity: u64,
    is_settled: bool,
    clock: &Clock,
    ctx: &mut TxContext,
) {
    if (payout == 0) return;

    vault_mod::accrue_interest(vault, clock);
    let ledger_principal = proxy.range_borrowed_quote(key);
    let debt = vault_mod::debt_with_accrued_interest(vault, ledger_principal);
    let repay_amt = if (payout >= debt) { debt } else { payout };
    let principal_repaid = if (repay_amt >= debt) {
        ledger_principal
    } else {
        ((repay_amt as u128) * (ledger_principal as u128) / (debt as u128)) as u64
    };
    let surplus = payout - repay_amt;

    let mut payout_coin = predict_client::withdraw_quote(manager, payout, ctx);
    if (repay_amt > 0) {
        let repay_coin = payout_coin.split(repay_amt, ctx);
        fee_collector::repay_vault_for_ledger_principal(
            vault,
            collector,
            repay_coin,
            ledger_principal,
            protocol_constants::fee_source_interest(),
            clock,
            ctx,
        );
        if (principal_repaid > 0) {
            proxy.record_repay_for_range(key, principal_repaid);
        };
        events::emit_vault_repaid(
            object::id(vault),
            object::id(proxy),
            proxy.owner(),
            repay_amt,
            vault_mod::total_borrowed(vault),
            vault_mod::utilization_bps(vault),
            vault_mod::current_borrow_rate(vault),
            vault_mod::current_lp_apr_bps(vault),
        );
        events::emit_debt_repaid(object::id(proxy), proxy.owner(), repay_amt, proxy.borrowed_quote());
    };
    if (payout_coin.value() > 0) {
        proxy.credit_quote_for_range(key, payout_coin, ctx);
    } else {
        coin::destroy_zero(payout_coin);
    };

    events::emit_leveraged_position_closed(
        object::id(proxy),
        proxy.owner(),
        object::id(manager),
        key.oracle_id(),
        key.expiry(),
        key.lower_strike(),
        key.higher_strike(),
        false,
        true,
        quantity,
        payout,
        repay_amt,
        surplus,
        proxy.range_borrowed_quote(key),
        is_settled,
    );
}

/// Emit `LeveragedPositionOpened` for a binary mint fill.
fun emit_open_binary<Collateral>(
    proxy: &UserProxy,
    manager: &PredictManager,
    key: MarketKey,
    quantity: u64,
    margin_quote: u64,
    borrow_quote: u64,
    leverage_bps: u64,
    mint_cost: u64,
    order_type: u8,
    limit_premium_per_unit: u64,
    market_ask_at_fill: u64,
    max_mint_cost: u64,
) {
    events::emit_leveraged_position_opened(
        object::id(proxy),
        proxy.owner(),
        object::id(manager),
        key.oracle_id(),
        key.expiry(),
        key.strike(),
        0,
        key.is_up(),
        false,
        std::type_name::with_defining_ids<Collateral>(),
        quantity,
        margin_quote,
        borrow_quote,
        leverage_bps,
        mint_cost,
        proxy.borrowed_quote(),
        order_type,
        limit_premium_per_unit,
        market_ask_at_fill,
        max_mint_cost,
    );
}

/// Emit `LeveragedPositionOpened` for a range mint fill.
fun emit_open_range<Collateral>(
    proxy: &UserProxy,
    manager: &PredictManager,
    key: RangeKey,
    quantity: u64,
    margin_quote: u64,
    borrow_quote: u64,
    leverage_bps: u64,
    mint_cost: u64,
    order_type: u8,
    limit_premium_per_unit: u64,
    market_ask_at_fill: u64,
    max_mint_cost: u64,
) {
    events::emit_leveraged_position_opened(
        object::id(proxy),
        proxy.owner(),
        object::id(manager),
        key.oracle_id(),
        key.expiry(),
        key.lower_strike(),
        key.higher_strike(),
        false,
        true,
        std::type_name::with_defining_ids<Collateral>(),
        quantity,
        margin_quote,
        borrow_quote,
        leverage_bps,
        mint_cost,
        proxy.borrowed_quote(),
        order_type,
        limit_premium_per_unit,
        market_ask_at_fill,
        max_mint_cost,
    );
}

// === Test hooks ===

#[test_only]
public fun test_validate_redeem_order(
    order_type: u8,
    limit_premium_per_unit: u64,
    min_payout: u64,
    market_bid: u64,
    expected_payout: u64,
    quantity: u64,
) {
    validate_redeem_order(
        order_type,
        limit_premium_per_unit,
        min_payout,
        market_bid,
        expected_payout,
        quantity,
    );
}

#[test_only]
public fun test_assert_mint_order_type(order_type: u8) {
    assert_valid_order_type(order_type);
}

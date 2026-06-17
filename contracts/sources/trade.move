// Copyright (c) LeverX contributors
// SPDX-License-Identifier: Apache-2.0

/// Primary PTB (programmable transaction block) surface for LeverX leveraged prediction trading.
///
/// Composes `UserProxy`, `LeverageVault`, and DeepBook Predict into user-callable
/// transaction functions: proxy factory, quote margin, leveraged mint/redeem,
/// resting limit orders, expiry settlement, deleverage/repay, and read-only quotes and health.
/// Mutating flows delegate to internal `execute_*` helpers and emit indexer events via `events`.
module leverx::trade;

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
    leverage_vault::{Self as vault_mod, LeverageVault},
    triggers,
};
use std::u128;
use sui::{clock::Clock, coin::{Self, Coin}};

fun assert_registry_predict(registry: &LeverxRegistry, predict: &Predict) {
    protocol_registry::assert_predict(registry, predict);
}

fun assert_registry_vault_collector<Quote>(
    registry: &LeverxRegistry,
    vault: &LeverageVault<Quote>,
    collector: &FeeCollector<Quote>,
) {
    protocol_registry::assert_vault(registry, vault);
    protocol_registry::assert_fee_collector(registry, collector);
}

// === Factory ===

/// Create a new `UserProxy` linked to a keeper-owned DeepBook Predict manager.
///
/// The trader (`ctx.sender()`) becomes the primary owner. The protocol keeper
/// (`registry.keeper_address`, which also owns the linked Predict manager) is
/// recorded as the secondary owner so it can relay trades as an authorized actor
/// without a separate executor-registration transaction.
public entry fun create_user_proxy(
    registry: &LeverxRegistry,
    manager: &PredictManager,
    ctx: &mut TxContext,
) {
    protocol_registry::assert_keeper_managed_manager(registry, manager);
    user_proxy::create(
        object::id(manager),
        protocol_registry::keeper_address(registry),
        ctx,
    );
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

/// Deposit quote into the single trading account (the only deposit surface).
public fun deposit_quote<Quote>(
    proxy: &mut UserProxy,
    quote: Coin<Quote>,
    ctx: &mut TxContext,
) {
    proxy.deposit_quote(quote, ctx);
}

/// Withdraw quote from the trading account to the trader (the only withdraw surface).
///
/// The full trading-account balance is withdrawable at any time; outstanding borrow is not
/// subtracted (open positions are collateralised by their locked margin + redeemable value).
public fun withdraw_quote<Quote>(
    proxy: &mut UserProxy,
    amount: u64,
    ctx: &mut TxContext,
) {
    proxy.withdraw_quote<Quote>(amount, ctx);
}

/// Set whether force-deleverage should remint a 1x position for a binary market key.
public fun set_remint_after_deleverage_binary_market(
    proxy: &mut UserProxy,
    key: MarketKey,
    remint_after_deleverage: bool,
    ctx: &mut TxContext,
) {
    proxy.assert_can_act(ctx);
    proxy.set_binary_remint_after_deleverage(key, remint_after_deleverage, ctx);
}

/// Set whether force-deleverage should remint a 1x position for a range market key.
public fun set_remint_after_deleverage_range_market(
    proxy: &mut UserProxy,
    key: RangeKey,
    remint_after_deleverage: bool,
    ctx: &mut TxContext,
) {
    proxy.assert_can_act(ctx);
    proxy.set_range_remint_after_deleverage(key, remint_after_deleverage, ctx);
}

/// Market mint at current oracle ask with explicit slippage cap (`max_mint_cost`).
public fun leveraged_mint_binary_market<Quote>(
    registry: &LeverxRegistry,
    vault: &mut LeverageVault<Quote>,
    proxy: &mut UserProxy,
    predict_global: &mut Predict,
    manager: &mut PredictManager,
    oracle: &OracleSVI,
    key: MarketKey,
    margin_quote: u64,
    leverage_bps: u64,
    quantity: u64,
    max_mint_cost: u64,
    slippage_bps: u64,
    remint_after_deleverage: bool,
    clock: &Clock,
    ctx: &mut TxContext,
) {
    execute_leveraged_mint_binary<Quote>(
        registry,
        vault,
        proxy,
        predict_global,
        manager,
        oracle,
        key,
        margin_quote,
        leverage_bps,
        quantity,
        protocol_constants::order_type_market(),
        0,
        max_mint_cost,
        slippage_bps,
        remint_after_deleverage,
        true,
        clock,
        ctx,
    );
}

/// Immediate limit mint: fills when market ask is at or below `limit + slippage_bps`.
public fun leveraged_mint_binary_limit<Quote>(
    registry: &LeverxRegistry,
    vault: &mut LeverageVault<Quote>,
    proxy: &mut UserProxy,
    predict_global: &mut Predict,
    manager: &mut PredictManager,
    oracle: &OracleSVI,
    key: MarketKey,
    margin_quote: u64,
    leverage_bps: u64,
    quantity: u64,
    limit_premium_per_unit: u64,
    slippage_bps: u64,
    remint_after_deleverage: bool,
    clock: &Clock,
    ctx: &mut TxContext,
) {
    execute_leveraged_mint_binary<Quote>(
        registry,
        vault,
        proxy,
        predict_global,
        manager,
        oracle,
        key,
        margin_quote,
        leverage_bps,
        quantity,
        protocol_constants::order_type_limit(),
        limit_premium_per_unit,
        0,
        slippage_bps,
        remint_after_deleverage,
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
public fun leveraged_mint_range_market<Quote>(
    registry: &LeverxRegistry,
    vault: &mut LeverageVault<Quote>,
    proxy: &mut UserProxy,
    predict_global: &mut Predict,
    manager: &mut PredictManager,
    oracle: &OracleSVI,
    key: RangeKey,
    margin_quote: u64,
    leverage_bps: u64,
    quantity: u64,
    max_mint_cost: u64,
    slippage_bps: u64,
    remint_after_deleverage: bool,
    clock: &Clock,
    ctx: &mut TxContext,
) {
    execute_leveraged_mint_range<Quote>(
        registry,
        vault,
        proxy,
        predict_global,
        manager,
        oracle,
        key,
        margin_quote,
        leverage_bps,
        quantity,
        protocol_constants::order_type_market(),
        0,
        max_mint_cost,
        slippage_bps,
        remint_after_deleverage,
        true,
        clock,
        ctx,
    );
}

/// Immediate limit mint for a range position: fills when market ask is at or below `limit + slippage_bps`.
public fun leveraged_mint_range_limit<Quote>(
    registry: &LeverxRegistry,
    vault: &mut LeverageVault<Quote>,
    proxy: &mut UserProxy,
    predict_global: &mut Predict,
    manager: &mut PredictManager,
    oracle: &OracleSVI,
    key: RangeKey,
    margin_quote: u64,
    leverage_bps: u64,
    quantity: u64,
    limit_premium_per_unit: u64,
    slippage_bps: u64,
    remint_after_deleverage: bool,
    clock: &Clock,
    ctx: &mut TxContext,
) {
    execute_leveraged_mint_range<Quote>(
        registry,
        vault,
        proxy,
        predict_global,
        manager,
        oracle,
        key,
        margin_quote,
        leverage_bps,
        quantity,
        protocol_constants::order_type_limit(),
        limit_premium_per_unit,
        0,
        slippage_bps,
        remint_after_deleverage,
        true,
        clock,
        ctx,
    );
}

// === Resting limit mint orders (place / execute / cancel) ===

/// Register a resting binary buy limit. Anyone may call; market ask must align with limit ± slippage.
public fun place_binary_limit_mint_order<Quote>(
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
    remint_after_deleverage: bool,
    clock: &Clock,
    ctx: &mut TxContext,
) {
    assert!(!registry.trading_paused(), errors::trading_paused());
    assert_registry_predict(registry, predict_global);
    proxy.assert_can_act(ctx);
    assert!(quantity > 0, errors::zero_quantity());
    assert!(margin_quote > 0, errors::zero_amount());
    ltv::assert_leverage_bps(leverage_bps);
    assert_leveraged_mint_window(registry, key.expiry(), leverage_bps, clock);
    assert_leveraged_resting_order_expiry(registry, key.expiry(), expires_ms, leverage_bps);
    assert!(
        proxy.trading_quote_balance() >= margin_quote,
        errors::insufficient_margin(),
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
        remint_after_deleverage,
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
public fun place_range_limit_mint_order<Quote>(
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
    remint_after_deleverage: bool,
    clock: &Clock,
    ctx: &mut TxContext,
) {
    assert!(!registry.trading_paused(), errors::trading_paused());
    assert_registry_predict(registry, predict_global);
    proxy.assert_can_act(ctx);
    assert!(quantity > 0, errors::zero_quantity());
    assert!(margin_quote > 0, errors::zero_amount());
    ltv::assert_leverage_bps(leverage_bps);
    assert_leveraged_mint_window(registry, key.expiry(), leverage_bps, clock);
    assert_leveraged_resting_order_expiry(registry, key.expiry(), expires_ms, leverage_bps);
    assert!(
        proxy.trading_quote_balance() >= margin_quote,
        errors::insufficient_margin(),
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
        remint_after_deleverage,
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
public fun execute_binary_limit_mint_order<Quote>(
    registry: &LeverxRegistry,
    vault: &mut LeverageVault<Quote>,
    proxy: &mut UserProxy,
    predict_global: &mut Predict,
    manager: &mut PredictManager,
    oracle: &OracleSVI,
    key: MarketKey,
    clock: &Clock,
    ctx: &mut TxContext,
) {
    assert!(!registry.trading_paused(), errors::trading_paused());
    protocol_registry::assert_keeper(registry, ctx);
    assert_registry_predict(registry, predict_global);
    protocol_registry::assert_vault(registry, vault);
    user_proxy::assert_binary_limit_mint_not_expired(proxy, key, clock);
    let order = proxy.take_binary_limit_mint(key);
    assert_leveraged_mint_window(registry, key.expiry(), user_proxy::leverage_bps(&order), clock);
    user_proxy::release_binary_quote_reserve(
        proxy,
        key,
        user_proxy::margin_quote(&order),
        ctx,
    );
    let (market_ask, mint_cost) = execute_placed_limit_mint_binary<Quote>(
        registry,
        vault,
        proxy,
        predict_global,
        manager,
        oracle,
        key,
        user_proxy::limit_premium_per_unit(&order),
        user_proxy::slippage_bps(&order),
        user_proxy::margin_quote(&order),
        user_proxy::leverage_bps(&order),
        user_proxy::quantity(&order),
        user_proxy::remint_after_deleverage(&order),
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
        user_proxy::limit_premium_per_unit(&order),
        user_proxy::slippage_bps(&order),
        market_ask,
        mint_cost,
        user_proxy::quantity(&order),
        user_proxy::expires_ms(&order),
    );
}

/// Fill a resting range limit mint.
public fun execute_range_limit_mint_order<Quote>(
    registry: &LeverxRegistry,
    vault: &mut LeverageVault<Quote>,
    proxy: &mut UserProxy,
    predict_global: &mut Predict,
    manager: &mut PredictManager,
    oracle: &OracleSVI,
    key: RangeKey,
    clock: &Clock,
    ctx: &mut TxContext,
) {
    assert!(!registry.trading_paused(), errors::trading_paused());
    protocol_registry::assert_keeper(registry, ctx);
    assert_registry_predict(registry, predict_global);
    protocol_registry::assert_vault(registry, vault);
    user_proxy::assert_range_limit_mint_not_expired(proxy, key, clock);
    let order = proxy.take_range_limit_mint(key);
    assert_leveraged_mint_window(registry, key.expiry(), user_proxy::leverage_bps(&order), clock);
    user_proxy::release_range_quote_reserve(
        proxy,
        key,
        user_proxy::margin_quote(&order),
        ctx,
    );
    let (market_ask, mint_cost) = execute_placed_limit_mint_range<Quote>(
        registry,
        vault,
        proxy,
        predict_global,
        manager,
        oracle,
        key,
        user_proxy::limit_premium_per_unit(&order),
        user_proxy::slippage_bps(&order),
        user_proxy::margin_quote(&order),
        user_proxy::leverage_bps(&order),
        user_proxy::quantity(&order),
        user_proxy::remint_after_deleverage(&order),
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
        user_proxy::limit_premium_per_unit(&order),
        user_proxy::slippage_bps(&order),
        market_ask,
        mint_cost,
        user_proxy::quantity(&order),
        user_proxy::expires_ms(&order),
    );
}

/// Cancel a resting binary limit mint order and release reserved quote margin.
public fun cancel_binary_limit_mint_order(
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
        user_proxy::expires_ms(&order),
        ctx.sender(),
    );
}

/// Cancel a resting range limit mint order and release reserved quote margin.
public fun cancel_range_limit_mint_order(
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
        user_proxy::expires_ms(&order),
        ctx.sender(),
    );
}

/// Permissionless: cancel an expired binary limit mint and release reserved margin.
public fun expire_binary_limit_mint_order(
    proxy: &mut UserProxy,
    key: MarketKey,
    clock: &Clock,
    ctx: &mut TxContext,
) {
    user_proxy::assert_binary_limit_mint_expired(proxy, key, clock);
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
        user_proxy::expires_ms(&order),
        ctx.sender(),
    );
}

/// Permissionless: cancel an expired range limit mint and release reserved margin.
public fun expire_range_limit_mint_order(
    proxy: &mut UserProxy,
    key: RangeKey,
    clock: &Clock,
    ctx: &mut TxContext,
) {
    user_proxy::assert_range_limit_mint_expired(proxy, key, clock);
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
    settle_expired_proxy_position_inner<Quote>(
        registry,
        vault,
        collector,
        proxy,
        predict_global,
        manager,
        oracle,
        key,
        quantity,
        true,
        clock,
        ctx,
    );
}

/// Keeper path: same as [`settle_expired_proxy_position`] without owner/executor auth.
public fun settle_expired_proxy_position_permissionless<Quote>(
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
    protocol_registry::assert_keeper(registry, ctx);
    settle_expired_proxy_position_inner<Quote>(
        registry,
        vault,
        collector,
        proxy,
        predict_global,
        manager,
        oracle,
        key,
        quantity,
        false,
        clock,
        ctx,
    );
}

fun settle_expired_proxy_position_inner<Quote>(
    registry: &LeverxRegistry,
    vault: &mut LeverageVault<Quote>,
    collector: &mut FeeCollector<Quote>,
    proxy: &mut UserProxy,
    predict_global: &mut Predict,
    manager: &mut PredictManager,
    oracle: &OracleSVI,
    key: MarketKey,
    quantity: u64,
    require_auth: bool,
    clock: &Clock,
    ctx: &mut TxContext,
) {
    assert_registry_predict(registry, predict_global);
    assert_registry_vault_collector(registry, vault, collector);
    assert!(oracle.is_settled(), errors::oracle_not_settled());
    assert!(quantity > 0, errors::zero_quantity());
    if (require_auth) {
        proxy.assert_can_act(ctx);
    };
    assert!(object::id(manager) == proxy.predict_manager_id(), errors::invalid_manager());

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

    repay_from_payout_binary(vault, collector, proxy, manager, payout, key, quantity, true, false, clock, ctx);
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
    settle_expired_proxy_range_inner<Quote>(
        registry,
        vault,
        collector,
        proxy,
        predict_global,
        manager,
        oracle,
        key,
        quantity,
        true,
        clock,
        ctx,
    );
}

/// Keeper path: same as [`settle_expired_proxy_range`] without owner/executor auth.
public fun settle_expired_proxy_range_permissionless<Quote>(
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
    protocol_registry::assert_keeper(registry, ctx);
    settle_expired_proxy_range_inner<Quote>(
        registry,
        vault,
        collector,
        proxy,
        predict_global,
        manager,
        oracle,
        key,
        quantity,
        false,
        clock,
        ctx,
    );
}

fun settle_expired_proxy_range_inner<Quote>(
    registry: &LeverxRegistry,
    vault: &mut LeverageVault<Quote>,
    collector: &mut FeeCollector<Quote>,
    proxy: &mut UserProxy,
    predict_global: &mut Predict,
    manager: &mut PredictManager,
    oracle: &OracleSVI,
    key: RangeKey,
    quantity: u64,
    require_auth: bool,
    clock: &Clock,
    ctx: &mut TxContext,
) {
    assert_registry_predict(registry, predict_global);
    assert_registry_vault_collector(registry, vault, collector);
    assert!(oracle.is_settled(), errors::oracle_not_settled());
    assert!(quantity > 0, errors::zero_quantity());
    if (require_auth) {
        proxy.assert_can_act(ctx);
    };
    assert!(object::id(manager) == proxy.predict_manager_id(), errors::invalid_manager());

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

    repay_from_payout_range(vault, collector, proxy, manager, payout, key, quantity, true, false, clock, ctx);
}

// === Force deleverage (keeper, final hour before expiry) ===

/// Permissionless: in the final hour before expiry, redeem leveraged exposure, repay vault debt, remint 1x if surplus remains.
public fun force_deleverage_binary_at_expiry<Quote>(
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
    assert_registry_predict(registry, predict_global);
    assert_registry_vault_collector(registry, vault, collector);
    protocol_registry::assert_keeper(registry, ctx);
    assert!(object::id(manager) == proxy.predict_manager_id(), errors::invalid_manager());
    assert_force_deleverage_window(registry, key.expiry(), clock);
    assert!(!oracle.is_settled(), errors::oracle_already_settled());
    assert!(proxy.binary_borrowed_quote(key) > 0, errors::no_leveraged_exposure());
    assert!(quantity > 0, errors::zero_quantity());

    vault_mod::accrue_interest(vault, clock);
    let vault_debt =
        vault_mod::debt_with_accrued_interest(vault, proxy.binary_borrowed_quote(key));
    assert_force_deleverage_healthy_binary(
        predict_global,
        oracle,
        proxy,
        key,
        quantity,
        vault_debt,
        protocol_registry::liquidation_bps(registry),
        clock,
    );

    let balance_before = predict_client::manager_balance<Quote>(manager);
    predict_client::redeem_binary<Quote>(
        predict_global,
        manager,
        oracle,
        key,
        quantity,
        clock,
        ctx,
    );
    let payout = predict_client::manager_balance<Quote>(manager) - balance_before;

    let remint_after = proxy.binary_remint_after_deleverage(key);
    repay_from_payout_binary(
        vault,
        collector,
        proxy,
        manager,
        payout,
        key,
        quantity,
        false,
        remint_after,
        clock,
        ctx,
    );

    let remint_qty = if (remint_after) {
        try_remint_unleveraged_binary(
            registry,
            vault,
            proxy,
            predict_global,
            manager,
            oracle,
            key,
            clock,
            ctx,
        )
    } else {
        0
    };
    if (remint_after) {
        finalize_binary_key_after_force_deleverage_remint<Quote>(proxy, manager, key, ctx);
    };

    events::emit_position_force_deleveraged(
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
        remint_qty,
        ctx.sender(),
    );
}

/// Permissionless range variant of [`force_deleverage_binary_at_expiry`].
public fun force_deleverage_range_at_expiry<Quote>(
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
    assert_registry_predict(registry, predict_global);
    assert_registry_vault_collector(registry, vault, collector);
    protocol_registry::assert_keeper(registry, ctx);
    assert!(object::id(manager) == proxy.predict_manager_id(), errors::invalid_manager());
    assert_force_deleverage_window(registry, key.expiry(), clock);
    assert!(!oracle.is_settled(), errors::oracle_already_settled());
    assert!(proxy.range_borrowed_quote(key) > 0, errors::no_leveraged_exposure());
    assert!(quantity > 0, errors::zero_quantity());

    vault_mod::accrue_interest(vault, clock);
    let vault_debt =
        vault_mod::debt_with_accrued_interest(vault, proxy.range_borrowed_quote(key));
    assert_force_deleverage_healthy_range(
        predict_global,
        oracle,
        proxy,
        key,
        quantity,
        vault_debt,
        protocol_registry::liquidation_bps(registry),
        clock,
    );

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

    let remint_after = proxy.range_remint_after_deleverage(key);
    repay_from_payout_range(
        vault,
        collector,
        proxy,
        manager,
        payout,
        key,
        quantity,
        false,
        remint_after,
        clock,
        ctx,
    );

    let remint_qty = if (remint_after) {
        try_remint_unleveraged_range(
            registry,
            vault,
            proxy,
            predict_global,
            manager,
            oracle,
            key,
            clock,
            ctx,
        )
    } else {
        0
    };
    if (remint_after) {
        finalize_range_key_after_force_deleverage_remint<Quote>(proxy, manager, key, ctx);
    };

    events::emit_position_force_deleveraged(
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
        remint_qty,
        ctx.sender(),
    );
}

// === Post-expiry repay (keeper, after expiry until oracle settles) ===

/// Permissionless: after market expiry, redeem live contracts and repay vault debt (no remint).
public fun force_repay_binary_post_expiry<Quote>(
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
    assert_registry_predict(registry, predict_global);
    assert_registry_vault_collector(registry, vault, collector);
    protocol_registry::assert_keeper(registry, ctx);
    assert!(object::id(manager) == proxy.predict_manager_id(), errors::invalid_manager());
    assert!(clock.timestamp_ms() >= key.expiry(), errors::market_still_open());
    assert!(!oracle.is_settled(), errors::oracle_already_settled());
    assert!(proxy.binary_borrowed_quote(key) > 0, errors::no_leveraged_exposure());
    assert!(quantity > 0, errors::zero_quantity());

    let balance_before = predict_client::manager_balance<Quote>(manager);
    predict_client::redeem_binary<Quote>(
        predict_global,
        manager,
        oracle,
        key,
        quantity,
        clock,
        ctx,
    );
    let payout = predict_client::manager_balance<Quote>(manager) - balance_before;

    repay_from_payout_binary(
        vault,
        collector,
        proxy,
        manager,
        payout,
        key,
        quantity,
        false,
        false,
        clock,
        ctx,
    );

    events::emit_position_force_deleveraged(
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
        0,
        ctx.sender(),
    );
}

/// Permissionless range variant of [`force_repay_binary_post_expiry`].
public fun force_repay_range_post_expiry<Quote>(
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
    assert_registry_predict(registry, predict_global);
    assert_registry_vault_collector(registry, vault, collector);
    protocol_registry::assert_keeper(registry, ctx);
    assert!(object::id(manager) == proxy.predict_manager_id(), errors::invalid_manager());
    assert!(clock.timestamp_ms() >= key.expiry(), errors::market_still_open());
    assert!(!oracle.is_settled(), errors::oracle_already_settled());
    assert!(proxy.range_borrowed_quote(key) > 0, errors::no_leveraged_exposure());
    assert!(quantity > 0, errors::zero_quantity());

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

    repay_from_payout_range(
        vault,
        collector,
        proxy,
        manager,
        payout,
        key,
        quantity,
        false,
        false,
        clock,
        ctx,
    );

    events::emit_position_force_deleveraged(
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
        0,
        ctx.sender(),
    );
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

/// Repay binary key vault debt from external quote coins; surplus credited to the trading account.
public fun deleverage_binary_account_balance<Quote>(
    registry: &LeverxRegistry,
    vault: &mut LeverageVault<Quote>,
    collector: &mut FeeCollector<Quote>,
    proxy: &mut UserProxy,
    key: MarketKey,
    repayment_funds: Coin<Quote>,
    slippage_bps: u64,
    clock: &Clock,
    ctx: &mut TxContext,
) {
    proxy.assert_can_act(ctx);
    assert!(slippage_bps <= protocol_constants::max_limit_order_slippage_bps(), errors::slippage_too_high());
    protocol_registry::assert_vault(registry, vault);
    protocol_registry::assert_fee_collector(registry, collector);
    vault_mod::accrue_interest(vault, clock);
    let amount = repayment_funds.value();
    assert!(amount > 0, errors::zero_amount());
    let ledger_principal = proxy.binary_borrowed_quote(key);
    let debt = vault_mod::debt_with_accrued_interest(vault, ledger_principal);
    let repay_amt = if (amount > debt) { debt } else { amount };
    let principal_repaid = principal_repaid_for_payment(repay_amt, debt, ledger_principal);
    let mut funds = repayment_funds;
    let repay_coin = funds.split(repay_amt, ctx);
    if (ledger_principal > 0) {
        fee_collector::repay_vault_for_ledger_principal(
            vault,
            collector,
            repay_coin,
            ledger_principal,
            protocol_constants::fee_source_interest(),
            clock,
            ctx,
        );
    } else {
        coin::destroy_zero(repay_coin);
    };
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
        proxy.credit_trading_quote(funds, ctx);
    } else {
        coin::destroy_zero(funds);
    };
    events::emit_debt_repaid(object::id(proxy), proxy.owner(), repay_amt, proxy.borrowed_quote());
    sync_binary_leverage_after_vault_repay(proxy, key, ctx);
    emit_binary_key_borrow_state(proxy, key);
}

/// Repay range key vault debt from external quote coins; surplus credited to the trading account.
public fun deleverage_range_account_balance<Quote>(
    registry: &LeverxRegistry,
    vault: &mut LeverageVault<Quote>,
    collector: &mut FeeCollector<Quote>,
    proxy: &mut UserProxy,
    key: RangeKey,
    repayment_funds: Coin<Quote>,
    slippage_bps: u64,
    clock: &Clock,
    ctx: &mut TxContext,
) {
    proxy.assert_can_act(ctx);
    assert!(slippage_bps <= protocol_constants::max_limit_order_slippage_bps(), errors::slippage_too_high());
    protocol_registry::assert_vault(registry, vault);
    protocol_registry::assert_fee_collector(registry, collector);
    vault_mod::accrue_interest(vault, clock);
    let amount = repayment_funds.value();
    assert!(amount > 0, errors::zero_amount());
    let ledger_principal = proxy.range_borrowed_quote(key);
    let debt = vault_mod::debt_with_accrued_interest(vault, ledger_principal);
    let repay_amt = if (amount > debt) { debt } else { amount };
    let principal_repaid = principal_repaid_for_payment(repay_amt, debt, ledger_principal);
    let mut funds = repayment_funds;
    let repay_coin = funds.split(repay_amt, ctx);
    if (ledger_principal > 0) {
        fee_collector::repay_vault_for_ledger_principal(
            vault,
            collector,
            repay_coin,
            ledger_principal,
            protocol_constants::fee_source_interest(),
            clock,
            ctx,
        );
    } else {
        coin::destroy_zero(repay_coin);
    };
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
        proxy.credit_trading_quote(funds, ctx);
    } else {
        coin::destroy_zero(funds);
    };
    events::emit_debt_repaid(object::id(proxy), proxy.owner(), repay_amt, proxy.borrowed_quote());
    sync_range_leverage_after_vault_repay(proxy, key, ctx);
    emit_range_key_borrow_state(proxy, key);
}

/// Repay binary key debt using quote drawn from the trading account.
public fun repay_debt_for_binary<Quote>(
    registry: &LeverxRegistry,
    proxy: &mut UserProxy,
    vault: &mut LeverageVault<Quote>,
    collector: &mut FeeCollector<Quote>,
    key: MarketKey,
    amount: u64,
    slippage_bps: u64,
    clock: &Clock,
    ctx: &mut TxContext,
) {
    let quote = proxy.take_trading_quote<Quote>(amount, ctx);
    deleverage_binary_account_balance(
        registry,
        vault,
        collector,
        proxy,
        key,
        quote,
        slippage_bps,
        clock,
        ctx,
    );
}

/// Repay range key debt using quote drawn from the trading account.
public fun repay_debt_for_range<Quote>(
    registry: &LeverxRegistry,
    proxy: &mut UserProxy,
    vault: &mut LeverageVault<Quote>,
    collector: &mut FeeCollector<Quote>,
    key: RangeKey,
    amount: u64,
    slippage_bps: u64,
    clock: &Clock,
    ctx: &mut TxContext,
) {
    let quote = proxy.take_trading_quote<Quote>(amount, ctx);
    deleverage_range_account_balance(
        registry,
        vault,
        collector,
        proxy,
        key,
        quote,
        slippage_bps,
        clock,
        ctx,
    );
}

// === Read ===

/// Read-only quote for a leveraged binary mint. Returns `(market_ask_per_unit, mint_cost, borrow_quote)`.
public fun quote_leveraged_mint_binary<Quote>(
    registry: &LeverxRegistry,
    proxy: &UserProxy,
    predict_global: &Predict,
    oracle: &OracleSVI,
    key: MarketKey,
    margin_quote: u64,
    leverage_bps: u64,
    quantity: u64,
    clock: &Clock,
): (u64, u64, u64) {
    assert_registry_predict(registry, predict_global);
    assert_leveraged_mint_window(registry, key.expiry(), leverage_bps, clock);
    let (market_ask, mint_cost) =
        predict_client::market_ask_binary(predict_global, oracle, key, quantity, clock);
    let borrow_quote = quote_borrow_for_leverage_binary(
        registry,
        proxy,
        key,
        margin_quote,
        leverage_bps,
    );
    (market_ask, mint_cost, borrow_quote)
}

/// Read-only quote for a leveraged range mint.
public fun quote_leveraged_mint_range<Quote>(
    registry: &LeverxRegistry,
    proxy: &UserProxy,
    predict_global: &Predict,
    oracle: &OracleSVI,
    key: RangeKey,
    margin_quote: u64,
    leverage_bps: u64,
    quantity: u64,
    clock: &Clock,
): (u64, u64, u64) {
    assert_registry_predict(registry, predict_global);
    assert_leveraged_mint_window(registry, key.expiry(), leverage_bps, clock);
    let (market_ask, mint_cost) =
        predict_client::market_ask_range(predict_global, oracle, key, quantity, clock);
    let borrow_quote = quote_borrow_for_leverage_range(
        registry,
        proxy,
        key,
        margin_quote,
        leverage_bps,
    );
    (market_ask, mint_cost, borrow_quote)
}

/// Read-only quote for binary redeem. Returns `(market_bid_per_unit, expected_payout)`.
public fun quote_leveraged_redeem_binary(
    registry: &LeverxRegistry,
    predict_global: &Predict,
    oracle: &OracleSVI,
    key: MarketKey,
    quantity: u64,
    clock: &Clock,
): (u64, u64) {
    assert_registry_predict(registry, predict_global);
    predict_client::market_bid_binary(predict_global, oracle, key, quantity, clock)
}

/// Read-only quote for range redeem.
public fun quote_leveraged_redeem_range(
    registry: &LeverxRegistry,
    predict_global: &Predict,
    oracle: &OracleSVI,
    key: RangeKey,
    quantity: u64,
    clock: &Clock,
): (u64, u64) {
    assert_registry_predict(registry, predict_global);
    predict_client::market_bid_range(predict_global, oracle, key, quantity, clock)
}

/// True when free quote on the key is below the margin-call threshold (ignores open contracts).
public fun is_binary_position_liquidatable<Quote>(
    registry: &LeverxRegistry,
    vault: &mut LeverageVault<Quote>,
    proxy: &UserProxy,
    key: MarketKey,
    clock: &Clock,
): bool {
    protocol_registry::assert_vault(registry, vault);
    vault_mod::accrue_interest(vault, clock);
    let vault_debt = vault_mod::debt_with_accrued_interest(vault, proxy.binary_borrowed_quote(key));
    let liquidation_bps = protocol_registry::liquidation_bps(registry);
    ltv::is_position_liquidatable(
        proxy.binary_quote_balance(key),
        vault_debt,
        proxy.binary_margin_debt(key),
        proxy.binary_leverage_bps(key),
        liquidation_bps,
    )
}

/// True when collateral (free quote + live redeem bid for `quantity`) is below margin-call.
public fun is_binary_position_liquidatable_with_open_position<Quote>(
    registry: &LeverxRegistry,
    vault: &mut LeverageVault<Quote>,
    proxy: &UserProxy,
    predict_global: &Predict,
    oracle: &OracleSVI,
    key: MarketKey,
    quantity: u64,
    clock: &Clock,
): bool {
    protocol_registry::assert_vault(registry, vault);
    assert_registry_predict(registry, predict_global);
    assert!(quantity > 0, errors::zero_quantity());
    vault_mod::accrue_interest(vault, clock);
    let vault_debt = vault_mod::debt_with_accrued_interest(vault, proxy.binary_borrowed_quote(key));
    let (_, expected_payout) =
        predict_client::market_bid_binary(predict_global, oracle, key, quantity, clock);
    let collateral = proxy.binary_quote_balance(key) + expected_payout;
    let liquidation_bps = protocol_registry::liquidation_bps(registry);
    ltv::is_position_liquidatable(
        collateral,
        vault_debt,
        proxy.binary_margin_debt(key),
        proxy.binary_leverage_bps(key),
        liquidation_bps,
    )
}

/// True when free quote on the key is below the margin-call threshold (ignores open contracts).
public fun is_range_position_liquidatable<Quote>(
    registry: &LeverxRegistry,
    vault: &mut LeverageVault<Quote>,
    proxy: &UserProxy,
    key: RangeKey,
    clock: &Clock,
): bool {
    protocol_registry::assert_vault(registry, vault);
    vault_mod::accrue_interest(vault, clock);
    let vault_debt = vault_mod::debt_with_accrued_interest(vault, proxy.range_borrowed_quote(key));
    let liquidation_bps = protocol_registry::liquidation_bps(registry);
    ltv::is_position_liquidatable(
        proxy.range_quote_balance(key),
        vault_debt,
        proxy.range_margin_debt(key),
        proxy.range_leverage_bps(key),
        liquidation_bps,
    )
}

/// True when collateral (free quote + live redeem bid for `quantity`) is below margin-call.
public fun is_range_position_liquidatable_with_open_position<Quote>(
    registry: &LeverxRegistry,
    vault: &mut LeverageVault<Quote>,
    proxy: &UserProxy,
    predict_global: &Predict,
    oracle: &OracleSVI,
    key: RangeKey,
    quantity: u64,
    clock: &Clock,
): bool {
    protocol_registry::assert_vault(registry, vault);
    assert_registry_predict(registry, predict_global);
    assert!(quantity > 0, errors::zero_quantity());
    vault_mod::accrue_interest(vault, clock);
    let vault_debt = vault_mod::debt_with_accrued_interest(vault, proxy.range_borrowed_quote(key));
    let (_, expected_payout) =
        predict_client::market_bid_range(predict_global, oracle, key, quantity, clock);
    let collateral = proxy.range_quote_balance(key) + expected_payout;
    let liquidation_bps = protocol_registry::liquidation_bps(registry);
    ltv::is_position_liquidatable(
        collateral,
        vault_debt,
        proxy.range_margin_debt(key),
        proxy.range_leverage_bps(key),
        liquidation_bps,
    )
}

/// Current quote health for a binary market key, in basis points (free quote only).
public fun evaluate_binary_position_health<Quote>(
    registry: &LeverxRegistry,
    vault: &mut LeverageVault<Quote>,
    proxy: &UserProxy,
    key: MarketKey,
    clock: &Clock,
): u64 {
    protocol_registry::assert_vault(registry, vault);
    vault_mod::accrue_interest(vault, clock);
    let vault_debt = vault_mod::debt_with_accrued_interest(vault, proxy.binary_borrowed_quote(key));
    ltv::evaluate_position_health(
        proxy.binary_quote_balance(key),
        vault_debt,
        proxy.binary_margin_debt(key),
        proxy.binary_leverage_bps(key),
    )
}

/// Health in bps using free quote plus live redeem bid for `quantity`.
public fun evaluate_binary_position_health_with_open_position<Quote>(
    registry: &LeverxRegistry,
    vault: &mut LeverageVault<Quote>,
    proxy: &UserProxy,
    predict_global: &Predict,
    oracle: &OracleSVI,
    key: MarketKey,
    quantity: u64,
    clock: &Clock,
): u64 {
    protocol_registry::assert_vault(registry, vault);
    assert_registry_predict(registry, predict_global);
    assert!(quantity > 0, errors::zero_quantity());
    vault_mod::accrue_interest(vault, clock);
    let vault_debt = vault_mod::debt_with_accrued_interest(vault, proxy.binary_borrowed_quote(key));
    let (_, expected_payout) =
        predict_client::market_bid_binary(predict_global, oracle, key, quantity, clock);
    let collateral = proxy.binary_quote_balance(key) + expected_payout;
    ltv::evaluate_position_health(
        collateral,
        vault_debt,
        proxy.binary_margin_debt(key),
        proxy.binary_leverage_bps(key),
    )
}

/// Current quote health for a range market key, in basis points (free quote only).
public fun evaluate_range_position_health<Quote>(
    registry: &LeverxRegistry,
    vault: &mut LeverageVault<Quote>,
    proxy: &UserProxy,
    key: RangeKey,
    clock: &Clock,
): u64 {
    protocol_registry::assert_vault(registry, vault);
    vault_mod::accrue_interest(vault, clock);
    let vault_debt = vault_mod::debt_with_accrued_interest(vault, proxy.range_borrowed_quote(key));
    ltv::evaluate_position_health(
        proxy.range_quote_balance(key),
        vault_debt,
        proxy.range_margin_debt(key),
        proxy.range_leverage_bps(key),
    )
}

/// Health in bps using free quote plus live redeem bid for `quantity`.
public fun evaluate_range_position_health_with_open_position<Quote>(
    registry: &LeverxRegistry,
    vault: &mut LeverageVault<Quote>,
    proxy: &UserProxy,
    predict_global: &Predict,
    oracle: &OracleSVI,
    key: RangeKey,
    quantity: u64,
    clock: &Clock,
): u64 {
    protocol_registry::assert_vault(registry, vault);
    assert_registry_predict(registry, predict_global);
    assert!(quantity > 0, errors::zero_quantity());
    vault_mod::accrue_interest(vault, clock);
    let vault_debt = vault_mod::debt_with_accrued_interest(vault, proxy.range_borrowed_quote(key));
    let (_, expected_payout) =
        predict_client::market_bid_range(predict_global, oracle, key, quantity, clock);
    let collateral = proxy.range_quote_balance(key) + expected_payout;
    ltv::evaluate_position_health(
        collateral,
        vault_debt,
        proxy.range_margin_debt(key),
        proxy.range_leverage_bps(key),
    )
}

/// Vault flash principal for liquidation: accrued ledger debt plus protocol buffer bps.
public fun quote_liquidation_flash_borrow<Quote>(
    registry: &LeverxRegistry,
    vault: &mut LeverageVault<Quote>,
    ledger_principal: u64,
    buffer_bps: u64,
    clock: &Clock,
): u64 {
    protocol_registry::assert_vault(registry, vault);
    if (ledger_principal == 0) return 1;
    vault_mod::accrue_interest(vault, clock);
    let debt = vault_mod::debt_with_accrued_interest(vault, ledger_principal);
    debt + protocol_constants::mul_bps(debt, buffer_bps)
}

// === Stranded custody recovery ===

/// Sweep mint surplus locked on a flat binary key into the trading account (wallet-callable).
public fun recover_flat_binary_key_quote<Quote>(
    proxy: &mut UserProxy,
    manager: &PredictManager,
    key: MarketKey,
    ctx: &mut TxContext,
): u64 {
    recover_flat_binary_key_quote_inner<Quote>(proxy, manager, key, ctx)
}

/// Sweep mint surplus locked on a flat range key into the trading account (wallet-callable).
public fun recover_flat_range_key_quote<Quote>(
    proxy: &mut UserProxy,
    manager: &PredictManager,
    key: RangeKey,
    ctx: &mut TxContext,
): u64 {
    recover_flat_range_key_quote_inner<Quote>(proxy, manager, key, ctx)
}

/// Keeper-relayed: withdraw orphaned Predict manager quote into the trading account.
///
/// Call only when every market on the manager is flat (enforced off-chain before relay).
public fun recover_manager_surplus_to_trading_binary<Quote>(
    registry: &LeverxRegistry,
    predict_global: &Predict,
    proxy: &mut UserProxy,
    manager: &mut PredictManager,
    key: MarketKey,
    amount: u64,
    ctx: &mut TxContext,
): u64 {
    assert_registry_predict(registry, predict_global);
    protocol_registry::assert_keeper_managed_manager(registry, manager);
    protocol_registry::assert_keeper(registry, ctx);
    assert!(object::id(manager) == proxy.predict_manager_id(), errors::invalid_manager());
    assert!(
        predict_client::manager_binary_position(manager, key) == 0,
        errors::open_contracts_remain(),
    );
    assert!(amount > 0, errors::zero_amount());

    let balance = predict_client::manager_balance<Quote>(manager);
    assert!(amount <= balance, errors::recovery_amount_exceeds_balance());

    let coin = predict_client::withdraw_quote(manager, amount, ctx);
    proxy.credit_trading_quote(coin, ctx);

    events::emit_stranded_custody_recovered(
        object::id(proxy),
        proxy.owner(),
        object::id(manager),
        key.oracle_id(),
        key.expiry(),
        key.strike(),
        0,
        key.is_up(),
        false,
        0,
        amount,
    );
    amount
}

/// Range variant of [`recover_manager_surplus_to_trading_binary`].
public fun recover_manager_surplus_to_trading_range<Quote>(
    registry: &LeverxRegistry,
    predict_global: &Predict,
    proxy: &mut UserProxy,
    manager: &mut PredictManager,
    key: RangeKey,
    amount: u64,
    ctx: &mut TxContext,
): u64 {
    assert_registry_predict(registry, predict_global);
    protocol_registry::assert_keeper_managed_manager(registry, manager);
    protocol_registry::assert_keeper(registry, ctx);
    assert!(object::id(manager) == proxy.predict_manager_id(), errors::invalid_manager());
    assert!(
        predict_client::manager_range_position(manager, key) == 0,
        errors::open_contracts_remain(),
    );
    assert!(amount > 0, errors::zero_amount());

    let balance = predict_client::manager_balance<Quote>(manager);
    assert!(amount <= balance, errors::recovery_amount_exceeds_balance());

    let coin = predict_client::withdraw_quote(manager, amount, ctx);
    proxy.credit_trading_quote(coin, ctx);

    events::emit_stranded_custody_recovered(
        object::id(proxy),
        proxy.owner(),
        object::id(manager),
        key.oracle_id(),
        key.expiry(),
        key.lower_strike(),
        key.higher_strike(),
        false,
        true,
        0,
        amount,
    );
    amount
}

fun recover_flat_binary_key_quote_inner<Quote>(
    proxy: &mut UserProxy,
    manager: &PredictManager,
    key: MarketKey,
    ctx: &mut TxContext,
): u64 {
    proxy.assert_can_act(ctx);
    assert!(object::id(manager) == proxy.predict_manager_id(), errors::invalid_manager());
    assert!(
        predict_client::manager_binary_position(manager, key) == 0,
        errors::open_contracts_remain(),
    );
    assert!(proxy.binary_borrowed_quote(key) == 0, errors::outstanding_debt());

    let swept = proxy.binary_quote_balance(key);
    if (swept == 0) return 0;

    triggers::maybe_clear_binary_triggers_if_flat(proxy, manager, key);
    finalize_binary_key_after_redeem<Quote>(proxy, key, ctx);

    events::emit_stranded_custody_recovered(
        object::id(proxy),
        proxy.owner(),
        object::id(manager),
        key.oracle_id(),
        key.expiry(),
        key.strike(),
        0,
        key.is_up(),
        false,
        swept,
        0,
    );
    swept
}

fun recover_flat_range_key_quote_inner<Quote>(
    proxy: &mut UserProxy,
    manager: &PredictManager,
    key: RangeKey,
    ctx: &mut TxContext,
): u64 {
    proxy.assert_can_act(ctx);
    assert!(object::id(manager) == proxy.predict_manager_id(), errors::invalid_manager());
    assert!(
        predict_client::manager_range_position(manager, key) == 0,
        errors::open_contracts_remain(),
    );
    assert!(proxy.range_borrowed_quote(key) == 0, errors::outstanding_debt());

    let swept = proxy.range_quote_balance(key);
    if (swept == 0) return 0;

    triggers::maybe_clear_range_triggers_if_flat(proxy, manager, key);
    finalize_range_key_after_redeem<Quote>(proxy, key, ctx);

    events::emit_stranded_custody_recovered(
        object::id(proxy),
        proxy.owner(),
        object::id(manager),
        key.oracle_id(),
        key.expiry(),
        key.lower_strike(),
        key.higher_strike(),
        false,
        true,
        swept,
        0,
    );
    swept
}

/// Permissionless: write off residual binary borrow when contracts are flat and market ended/settled.
public fun write_off_flat_binary_borrow_permissionless<Quote>(
    registry: &LeverxRegistry,
    vault: &mut LeverageVault<Quote>,
    collector: &mut FeeCollector<Quote>,
    proxy: &mut UserProxy,
    predict_global: &Predict,
    manager: &PredictManager,
    oracle: &OracleSVI,
    key: MarketKey,
    clock: &Clock,
    ctx: &mut TxContext,
) {
    assert_registry_predict(registry, predict_global);
    assert_registry_vault_collector(registry, vault, collector);
    protocol_registry::assert_keeper(registry, ctx);
    assert!(object::id(manager) == proxy.predict_manager_id(), errors::invalid_manager());
    assert!(proxy.binary_borrowed_quote(key) > 0, errors::no_leveraged_exposure());
    assert!(predict_client::manager_binary_position(manager, key) == 0, errors::zero_quantity());
    assert!(
        oracle.is_settled() || clock.timestamp_ms() >= key.expiry(),
        errors::market_still_open(),
    );
    write_off_residual_binary_debt(vault, collector, proxy, key, clock, ctx);
}

/// Permissionless range variant of [`write_off_flat_binary_borrow_permissionless`].
public fun write_off_flat_range_borrow_permissionless<Quote>(
    registry: &LeverxRegistry,
    vault: &mut LeverageVault<Quote>,
    collector: &mut FeeCollector<Quote>,
    proxy: &mut UserProxy,
    predict_global: &Predict,
    manager: &PredictManager,
    oracle: &OracleSVI,
    key: RangeKey,
    clock: &Clock,
    ctx: &mut TxContext,
) {
    assert_registry_predict(registry, predict_global);
    assert_registry_vault_collector(registry, vault, collector);
    protocol_registry::assert_keeper(registry, ctx);
    assert!(object::id(manager) == proxy.predict_manager_id(), errors::invalid_manager());
    assert!(proxy.range_borrowed_quote(key) > 0, errors::no_leveraged_exposure());
    assert!(predict_client::manager_range_position(manager, key) == 0, errors::zero_quantity());
    assert!(
        oracle.is_settled() || clock.timestamp_ms() >= key.expiry(),
        errors::market_still_open(),
    );
    write_off_residual_range_debt(vault, collector, proxy, key, clock, ctx);
}

// === Internal ===

fun quote_borrow_for_leverage_binary(
    _registry: &LeverxRegistry,
    _proxy: &UserProxy,
    _key: MarketKey,
    margin_quote: u64,
    leverage_bps: u64,
): u64 {
    assert!(margin_quote > 0, errors::zero_amount());
    ltv::assert_margin_quote(margin_quote);
    ltv::assert_leverage_bps(leverage_bps);
    let position_quote = ltv::position_from_margin(margin_quote, leverage_bps);
    ltv::borrow_for_leverage(position_quote, margin_quote)
}

fun quote_borrow_for_leverage_range(
    _registry: &LeverxRegistry,
    _proxy: &UserProxy,
    _key: RangeKey,
    margin_quote: u64,
    leverage_bps: u64,
): u64 {
    assert!(margin_quote > 0, errors::zero_amount());
    ltv::assert_margin_quote(margin_quote);
    ltv::assert_leverage_bps(leverage_bps);
    let position_quote = ltv::position_from_margin(margin_quote, leverage_bps);
    ltv::borrow_for_leverage(position_quote, margin_quote)
}

/// Fill a resting binary limit mint (uses frozen placement slippage).
fun execute_placed_limit_mint_binary<Quote>(
    registry: &LeverxRegistry,
    vault: &mut LeverageVault<Quote>,
    proxy: &mut UserProxy,
    predict_global: &mut Predict,
    manager: &mut PredictManager,
    oracle: &OracleSVI,
    key: MarketKey,
    limit_premium_per_unit: u64,
    slippage_bps: u64,
    margin_quote: u64,
    leverage_bps: u64,
    quantity: u64,
    remint_after_deleverage: bool,
    clock: &Clock,
    ctx: &mut TxContext,
): (u64, u64) {
    let (market_ask, mint_cost) =
        predict_client::market_ask_binary(predict_global, oracle, key, quantity, clock);
    execute_leveraged_mint_binary<Quote>(
        registry,
        vault,
        proxy,
        predict_global,
        manager,
        oracle,
        key,
        margin_quote,
        leverage_bps,
        quantity,
        protocol_constants::order_type_limit(),
        limit_premium_per_unit,
        0,
        slippage_bps,
        remint_after_deleverage,
        false,
        clock,
        ctx,
    );
    (market_ask, mint_cost)
}

/// Fill a resting range limit mint (uses frozen placement slippage).
fun execute_placed_limit_mint_range<Quote>(
    registry: &LeverxRegistry,
    vault: &mut LeverageVault<Quote>,
    proxy: &mut UserProxy,
    predict_global: &mut Predict,
    manager: &mut PredictManager,
    oracle: &OracleSVI,
    key: RangeKey,
    limit_premium_per_unit: u64,
    slippage_bps: u64,
    margin_quote: u64,
    leverage_bps: u64,
    quantity: u64,
    remint_after_deleverage: bool,
    clock: &Clock,
    ctx: &mut TxContext,
): (u64, u64) {
    let (market_ask, mint_cost) =
        predict_client::market_ask_range(predict_global, oracle, key, quantity, clock);
    execute_leveraged_mint_range<Quote>(
        registry,
        vault,
        proxy,
        predict_global,
        manager,
        oracle,
        key,
        margin_quote,
        leverage_bps,
        quantity,
        protocol_constants::order_type_limit(),
        limit_premium_per_unit,
        0,
        slippage_bps,
        remint_after_deleverage,
        false,
        clock,
        ctx,
    );
    (market_ask, mint_cost)
}

/// Core binary leveraged mint: borrow, fund Predict manager, mint, and emit `LeveragedPositionOpened`.
fun execute_leveraged_mint_binary<Quote>(
    registry: &LeverxRegistry,
    vault: &mut LeverageVault<Quote>,
    proxy: &mut UserProxy,
    predict_global: &mut Predict,
    manager: &mut PredictManager,
    oracle: &OracleSVI,
    key: MarketKey,
    margin_quote: u64,
    leverage_bps: u64,
    quantity: u64,
    order_type: u8,
    limit_premium_per_unit: u64,
    max_mint_cost: u64,
    slippage_bps: u64,
    remint_after_deleverage: bool,
    require_auth: bool,
    clock: &Clock,
    ctx: &mut TxContext,
) {
    assert_registry_predict(registry, predict_global);
    let (_, borrow_quote) = plan_leverage_binary(
        registry,
        proxy,
        manager,
        key,
        margin_quote,
        leverage_bps,
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

    // Lock the trader's margin from the trading account onto the position, then draw the vault
    // borrow onto the same position. Funding the mint from the position leaves any surplus
    // (margin + borrow - mint_cost) locked with the position until it is closed or liquidated.
    proxy.allocate_binary_margin(key, margin_quote, ctx);
    execute_borrow_binary(registry, vault, proxy, key, borrow_quote, clock, ctx);
    let funding = proxy.withdraw_quote_from_binary<Quote>(key, mint_cost, ctx);
    predict_client::deposit_quote(manager, funding, ctx);
    predict_client::mint_binary<Quote>(predict_global, manager, oracle, key, quantity, clock, ctx);

    emit_open_binary(
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
    proxy.set_binary_leverage(key, leverage_bps, ctx);
    if (ltv::is_leveraged(leverage_bps)) {
        proxy.add_binary_margin_debt(key, margin_quote, ctx);
    };
    proxy.set_binary_remint_after_deleverage(key, remint_after_deleverage, ctx);
    assert_leveraged_open_health_binary(
        registry,
        vault,
        proxy,
        predict_global,
        oracle,
        key,
        quantity,
        leverage_bps,
        clock,
    );
}

/// Core range leveraged mint: borrow, fund Predict manager, mint, and emit `LeveragedPositionOpened`.
fun execute_leveraged_mint_range<Quote>(
    registry: &LeverxRegistry,
    vault: &mut LeverageVault<Quote>,
    proxy: &mut UserProxy,
    predict_global: &mut Predict,
    manager: &mut PredictManager,
    oracle: &OracleSVI,
    key: RangeKey,
    margin_quote: u64,
    leverage_bps: u64,
    quantity: u64,
    order_type: u8,
    limit_premium_per_unit: u64,
    max_mint_cost: u64,
    slippage_bps: u64,
    remint_after_deleverage: bool,
    require_auth: bool,
    clock: &Clock,
    ctx: &mut TxContext,
) {
    assert_registry_predict(registry, predict_global);
    let (_, borrow_quote) = plan_leverage_range(
        registry,
        proxy,
        manager,
        key,
        margin_quote,
        leverage_bps,
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

    // Lock the trader's margin from the trading account onto the position, then draw the vault
    // borrow onto the same position. Funding the mint from the position leaves any surplus
    // (margin + borrow - mint_cost) locked with the position until it is closed or liquidated.
    proxy.allocate_range_margin(key, margin_quote, ctx);
    execute_borrow_range(registry, vault, proxy, key, borrow_quote, clock, ctx);
    let funding = proxy.withdraw_quote_from_range<Quote>(key, mint_cost, ctx);
    predict_client::deposit_quote(manager, funding, ctx);
    predict_client::mint_range<Quote>(predict_global, manager, oracle, key, quantity, clock, ctx);

    emit_open_range(
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
    proxy.set_range_leverage(key, leverage_bps, ctx);
    if (ltv::is_leveraged(leverage_bps)) {
        proxy.add_range_margin_debt(key, margin_quote, ctx);
    };
    proxy.set_range_remint_after_deleverage(key, remint_after_deleverage, ctx);
    assert_leveraged_open_health_range(
        registry,
        vault,
        proxy,
        predict_global,
        oracle,
        key,
        quantity,
        leverage_bps,
        clock,
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
    // Maintenance: redeems (close / settle) stay available while `trading_paused` blocks new mints.
    assert_registry_predict(registry, predict_global);
    assert_registry_vault_collector(registry, vault, collector);
    let via_trigger = !proxy.can_act(ctx);
    proxy.assert_can_act_or_has_binary_trigger(key, ctx);
    assert!(object::id(manager) == proxy.predict_manager_id(), errors::invalid_manager());

    let (market_bid, expected_payout) =
        predict_client::market_bid_binary(predict_global, oracle, key, quantity, clock);
    if (via_trigger) {
        proxy.assert_binary_trigger_threshold_met(key, market_bid);
        proxy.assert_binary_trigger_redeem_slippage(key, market_bid, min_payout, expected_payout);
    };
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

    repay_from_payout_binary(vault, collector, proxy, manager, payout, key, quantity, is_settled, false, clock, ctx);
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
    // Maintenance: redeems (close / settle) stay available while `trading_paused` blocks new mints.
    assert_registry_predict(registry, predict_global);
    assert_registry_vault_collector(registry, vault, collector);
    let via_trigger = !proxy.can_act(ctx);
    proxy.assert_can_act_or_has_range_trigger(key, ctx);
    assert!(object::id(manager) == proxy.predict_manager_id(), errors::invalid_manager());

    let (market_bid, expected_payout) =
        predict_client::market_bid_range(predict_global, oracle, key, quantity, clock);
    if (via_trigger) {
        proxy.assert_range_trigger_threshold_met(key, market_bid);
        proxy.assert_range_trigger_redeem_slippage(key, market_bid, min_payout, expected_payout);
    };
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

    repay_from_payout_range(vault, collector, proxy, manager, payout, key, quantity, is_settled, false, clock, ctx);
}

fun principal_repaid_for_payment(
    repay_amt: u64,
    debt: u64,
    ledger_principal: u64,
): u64 {
    if (repay_amt >= debt) {
        ledger_principal
    } else {
        u128::divide_and_round_up(
            (repay_amt as u128) * (ledger_principal as u128),
            debt as u128,
        ) as u64
    }
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

/// Shared final-window gate: `[expiry - window, expiry)`.
fun assert_final_hour_before_expiry(expiry_ms: u64, window_ms: u64, clock: &Clock, outside_window: u64) {
    let now = clock.timestamp_ms();
    assert!(now >= expiry_ms - window_ms, outside_window);
    assert!(now < expiry_ms, outside_window);
}

/// Leverage above 1x is blocked in the final window before market expiry.
fun assert_leveraged_mint_window(
    registry: &LeverxRegistry,
    expiry_ms: u64,
    leverage_bps: u64,
    clock: &Clock,
) {
    if (leverage_bps <= protocol_constants::bps()) return;
    let window = protocol_registry::final_window_ms(registry);
    let now = clock.timestamp_ms();
    assert!(now < expiry_ms - window, errors::leveraged_mint_outside_window());
}

/// Resting leveraged orders must expire before the final window opens.
fun assert_leveraged_resting_order_expiry(
    registry: &LeverxRegistry,
    market_expiry_ms: u64,
    order_expires_ms: u64,
    leverage_bps: u64,
) {
    if (leverage_bps <= protocol_constants::bps()) return;
    let window = protocol_registry::final_window_ms(registry);
    assert!(
        order_expires_ms < market_expiry_ms - window,
        errors::leveraged_mint_outside_window(),
    );
}

/// Force-deleverage may only run in the final window (before expiry).
fun assert_force_deleverage_window(registry: &LeverxRegistry, expiry_ms: u64, clock: &Clock) {
    let window = protocol_registry::final_window_ms(registry);
    assert_final_hour_before_expiry(expiry_ms, window, clock, errors::force_deleverage_outside_window());
}

/// After a leveraged mint, open health must meet the registry liquidation threshold.
fun assert_leveraged_open_health_binary<Quote>(
    registry: &LeverxRegistry,
    vault: &mut LeverageVault<Quote>,
    proxy: &UserProxy,
    predict_global: &Predict,
    oracle: &OracleSVI,
    key: MarketKey,
    quantity: u64,
    leverage_bps: u64,
    clock: &Clock,
) {
    if (!ltv::is_leveraged(leverage_bps)) return;
    let health = evaluate_binary_position_health_with_open_position(
        registry,
        vault,
        proxy,
        predict_global,
        oracle,
        key,
        quantity,
        clock,
    );
    assert!(
        health >= protocol_registry::liquidation_bps(registry),
        errors::open_health_below_liquidation(),
    );
}

fun assert_leveraged_open_health_range<Quote>(
    registry: &LeverxRegistry,
    vault: &mut LeverageVault<Quote>,
    proxy: &UserProxy,
    predict_global: &Predict,
    oracle: &OracleSVI,
    key: RangeKey,
    quantity: u64,
    leverage_bps: u64,
    clock: &Clock,
) {
    if (!ltv::is_leveraged(leverage_bps)) return;
    let health = evaluate_range_position_health_with_open_position(
        registry,
        vault,
        proxy,
        predict_global,
        oracle,
        key,
        quantity,
        clock,
    );
    assert!(
        health >= protocol_registry::liquidation_bps(registry),
        errors::open_health_below_liquidation(),
    );
}

/// Underwater keys must use liquidation, not force-deleverage. Collateral includes live redeem bid.
fun assert_force_deleverage_healthy_binary(
    predict_global: &Predict,
    oracle: &OracleSVI,
    proxy: &UserProxy,
    key: MarketKey,
    quantity: u64,
    vault_debt: u64,
    liquidation_bps: u64,
    clock: &Clock,
) {
    let (_, expected_payout) =
        predict_client::market_bid_binary(predict_global, oracle, key, quantity, clock);
    let collateral = proxy.binary_quote_balance(key) + expected_payout;
    assert!(
        !ltv::is_position_liquidatable(
            collateral,
            vault_debt,
            proxy.binary_margin_debt(key),
            proxy.binary_leverage_bps(key),
            liquidation_bps,
        ),
        errors::must_liquidate(),
    );
}

fun assert_force_deleverage_healthy_range(
    predict_global: &Predict,
    oracle: &OracleSVI,
    proxy: &UserProxy,
    key: RangeKey,
    quantity: u64,
    vault_debt: u64,
    liquidation_bps: u64,
    clock: &Clock,
) {
    let (_, expected_payout) =
        predict_client::market_bid_range(predict_global, oracle, key, quantity, clock);
    let collateral = proxy.range_quote_balance(key) + expected_payout;
    assert!(
        !ltv::is_position_liquidatable(
            collateral,
            vault_debt,
            proxy.range_margin_debt(key),
            proxy.range_leverage_bps(key),
            liquidation_bps,
        ),
        errors::must_liquidate(),
    );
}

fun estimate_max_mint_quantity_binary(
    predict_global: &Predict,
    oracle: &OracleSVI,
    key: MarketKey,
    margin_quote: u64,
    clock: &Clock,
): u64 {
    if (margin_quote == 0) return 0;
    let (_, cost_one) =
        predict_client::market_ask_binary(predict_global, oracle, key, 1, clock);
    if (cost_one == 0) return 0;
    let mut qty = margin_quote / cost_one;
    if (qty == 0) return 0;
    let (_, mut mint_cost) =
        predict_client::market_ask_binary(predict_global, oracle, key, qty, clock);
    while (mint_cost > margin_quote && qty > 0) {
        qty = qty - 1;
        (_, mint_cost) =
            predict_client::market_ask_binary(predict_global, oracle, key, qty, clock);
    };
    qty
}

fun estimate_max_mint_quantity_range(
    predict_global: &Predict,
    oracle: &OracleSVI,
    key: RangeKey,
    margin_quote: u64,
    clock: &Clock,
): u64 {
    if (margin_quote == 0) return 0;
    let (_, cost_one) =
        predict_client::market_ask_range(predict_global, oracle, key, 1, clock);
    if (cost_one == 0) return 0;
    let mut qty = margin_quote / cost_one;
    if (qty == 0) return 0;
    let (_, mut mint_cost) =
        predict_client::market_ask_range(predict_global, oracle, key, qty, clock);
    while (mint_cost > margin_quote && qty > 0) {
        qty = qty - 1;
        (_, mint_cost) =
            predict_client::market_ask_range(predict_global, oracle, key, qty, clock);
    };
    qty
}

/// Remint a 1x position from free quote on the key after force-deleverage.
fun try_remint_unleveraged_binary<Quote>(
    registry: &LeverxRegistry,
    vault: &mut LeverageVault<Quote>,
    proxy: &mut UserProxy,
    predict_global: &mut Predict,
    manager: &mut PredictManager,
    oracle: &OracleSVI,
    key: MarketKey,
    clock: &Clock,
    ctx: &mut TxContext,
): u64 {
    if (proxy.binary_borrowed_quote(key) > 0) return 0;
    let margin = proxy.binary_quote_balance(key);
    if (margin < protocol_constants::min_margin_quote()) return 0;
    let qty = estimate_max_mint_quantity_binary(predict_global, oracle, key, margin, clock);
    if (qty == 0) return 0;
    let (_, mint_cost) =
        predict_client::market_ask_binary(predict_global, oracle, key, qty, clock);
    if (mint_cost == 0 || mint_cost > margin) return 0;
    let remint_after_deleverage = proxy.binary_remint_after_deleverage(key);
    // Move this position's held residual into the trading account; the remint sources margin from the pool.
    let owner = proxy.owner();
    user_proxy::sweep_binary_free_quote_to<Quote>(proxy, key, owner, ctx);
    execute_leveraged_mint_binary<Quote>(
        registry,
        vault,
        proxy,
        predict_global,
        manager,
        oracle,
        key,
        mint_cost,
        protocol_constants::bps(),
        qty,
        protocol_constants::order_type_market(),
        0,
        mint_cost,
        0,
        remint_after_deleverage,
        false,
        clock,
        ctx,
    );
    qty
}

fun try_remint_unleveraged_range<Quote>(
    registry: &LeverxRegistry,
    vault: &mut LeverageVault<Quote>,
    proxy: &mut UserProxy,
    predict_global: &mut Predict,
    manager: &mut PredictManager,
    oracle: &OracleSVI,
    key: RangeKey,
    clock: &Clock,
    ctx: &mut TxContext,
): u64 {
    if (proxy.range_borrowed_quote(key) > 0) return 0;
    let margin = proxy.range_quote_balance(key);
    if (margin < protocol_constants::min_margin_quote()) return 0;
    let qty = estimate_max_mint_quantity_range(predict_global, oracle, key, margin, clock);
    if (qty == 0) return 0;
    let (_, mint_cost) =
        predict_client::market_ask_range(predict_global, oracle, key, qty, clock);
    if (mint_cost == 0 || mint_cost > margin) return 0;
    let remint_after_deleverage = proxy.range_remint_after_deleverage(key);
    // Move this position's held residual into the trading account; the remint sources margin from the pool.
    let owner = proxy.owner();
    user_proxy::sweep_range_free_quote_to<Quote>(proxy, key, owner, ctx);
    execute_leveraged_mint_range<Quote>(
        registry,
        vault,
        proxy,
        predict_global,
        manager,
        oracle,
        key,
        mint_cost,
        protocol_constants::bps(),
        qty,
        protocol_constants::order_type_market(),
        0,
        mint_cost,
        0,
        remint_after_deleverage,
        false,
        clock,
        ctx,
    );
    qty
}

fun plan_leverage_binary(
    registry: &LeverxRegistry,
    proxy: &mut UserProxy,
    manager: &PredictManager,
    key: MarketKey,
    margin_quote: u64,
    leverage_bps: u64,
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
    ltv::assert_margin_quote(margin_quote);
    ltv::assert_leverage_bps(leverage_bps);
    assert_leveraged_mint_window(registry, key.expiry(), leverage_bps, clock);
    assert!(
        proxy.trading_quote_balance() >= margin_quote,
        errors::insufficient_margin(),
    );
    let borrow_quote = quote_borrow_for_leverage_binary(
        registry,
        proxy,
        key,
        margin_quote,
        leverage_bps,
    );
    (margin_quote, borrow_quote)
}

fun plan_leverage_range(
    registry: &LeverxRegistry,
    proxy: &mut UserProxy,
    manager: &PredictManager,
    key: RangeKey,
    margin_quote: u64,
    leverage_bps: u64,
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
    ltv::assert_margin_quote(margin_quote);
    ltv::assert_leverage_bps(leverage_bps);
    assert_leveraged_mint_window(registry, key.expiry(), leverage_bps, clock);
    assert!(
        proxy.trading_quote_balance() >= margin_quote,
        errors::insufficient_margin(),
    );
    let borrow_quote = quote_borrow_for_leverage_range(
        registry,
        proxy,
        key,
        margin_quote,
        leverage_bps,
    );
    (margin_quote, borrow_quote)
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

/// After oracle settlement, clear residual vault borrow via insurance then LP socialization.
fun write_off_residual_binary_debt<Quote>(
    vault: &mut LeverageVault<Quote>,
    collector: &mut FeeCollector<Quote>,
    proxy: &mut UserProxy,
    key: MarketKey,
    clock: &Clock,
    ctx: &mut TxContext,
) {
    let mut ledger_principal = proxy.binary_borrowed_quote(key);
    if (ledger_principal == 0) {
        proxy.clear_binary_margin_debt(key);
        return
    };

    vault_mod::accrue_interest(vault, clock);
    let mut debt = vault_mod::debt_with_accrued_interest(vault, ledger_principal);
    let mut insurance_covered = 0;

    // The position's locked margin (leftover budget held on the key) absorbs the loss before
    // the insurance fund or LP bad-debt write-off is tapped. This returns unused borrowed
    // capital to the vault rather than leaking it back to the trader on a settled-loss close.
    let key_margin = proxy.binary_quote_balance(key);
    if (key_margin > 0 && debt > 0) {
        let cover = if (key_margin >= debt) { debt } else { key_margin };
        let coin = proxy.withdraw_quote_from_binary<Quote>(key, cover, ctx);
        fee_collector::repay_vault_for_ledger_principal(
            vault,
            collector,
            coin,
            ledger_principal,
            protocol_constants::fee_source_interest(),
            clock,
            ctx,
        );
        let principal_repaid = principal_repaid_for_payment(cover, debt, ledger_principal);
        if (principal_repaid > 0) {
            proxy.record_repay_for_binary(key, principal_repaid);
        };
        ledger_principal = proxy.binary_borrowed_quote(key);
        if (ledger_principal == 0) {
            proxy.clear_binary_margin_debt(key);
            return
        };
        debt = vault_mod::debt_with_accrued_interest(vault, ledger_principal);
    };

    let insurance_avail = vault_mod::insurance_fund_balance(vault);
    if (insurance_avail > 0 && debt > 0) {
        let cover = if (insurance_avail >= debt) { debt } else { insurance_avail };
        let coin = vault_mod::take_insurance_fund(vault, cover, ctx);
        fee_collector::repay_vault_for_ledger_principal(
            vault,
            collector,
            coin,
            ledger_principal,
            protocol_constants::fee_source_insurance(),
            clock,
            ctx,
        );
        let principal_repaid = principal_repaid_for_payment(cover, debt, ledger_principal);
        if (principal_repaid > 0) {
            proxy.record_repay_for_binary(key, principal_repaid);
        };
        insurance_covered = cover;
        ledger_principal = proxy.binary_borrowed_quote(key);
        if (ledger_principal == 0) {
            proxy.clear_binary_margin_debt(key);
            return
        };
        debt = vault_mod::debt_with_accrued_interest(vault, ledger_principal);
    };

    vault_mod::write_off_debt_for_ledger(vault, ledger_principal, debt);
    proxy.record_repay_for_binary(key, ledger_principal);
    events::emit_bad_debt_written_off(
        object::id(proxy),
        proxy.owner(),
        key.oracle_id(),
        key.expiry(),
        key.strike(),
        0,
        key.is_up(),
        false,
        insurance_covered,
        debt,
        ctx.sender(),
    );
    proxy.clear_binary_margin_debt(key);
}

fun write_off_residual_range_debt<Quote>(
    vault: &mut LeverageVault<Quote>,
    collector: &mut FeeCollector<Quote>,
    proxy: &mut UserProxy,
    key: RangeKey,
    clock: &Clock,
    ctx: &mut TxContext,
) {
    let mut ledger_principal = proxy.range_borrowed_quote(key);
    if (ledger_principal == 0) {
        proxy.clear_range_margin_debt(key);
        return
    };

    vault_mod::accrue_interest(vault, clock);
    let mut debt = vault_mod::debt_with_accrued_interest(vault, ledger_principal);
    let mut insurance_covered = 0;

    // The position's locked margin (leftover budget held on the key) absorbs the loss before
    // the insurance fund or LP bad-debt write-off is tapped. This returns unused borrowed
    // capital to the vault rather than leaking it back to the trader on a settled-loss close.
    let key_margin = proxy.range_quote_balance(key);
    if (key_margin > 0 && debt > 0) {
        let cover = if (key_margin >= debt) { debt } else { key_margin };
        let coin = proxy.withdraw_quote_from_range<Quote>(key, cover, ctx);
        fee_collector::repay_vault_for_ledger_principal(
            vault,
            collector,
            coin,
            ledger_principal,
            protocol_constants::fee_source_interest(),
            clock,
            ctx,
        );
        let principal_repaid = principal_repaid_for_payment(cover, debt, ledger_principal);
        if (principal_repaid > 0) {
            proxy.record_repay_for_range(key, principal_repaid);
        };
        ledger_principal = proxy.range_borrowed_quote(key);
        if (ledger_principal == 0) {
            proxy.clear_range_margin_debt(key);
            return
        };
        debt = vault_mod::debt_with_accrued_interest(vault, ledger_principal);
    };

    let insurance_avail = vault_mod::insurance_fund_balance(vault);
    if (insurance_avail > 0 && debt > 0) {
        let cover = if (insurance_avail >= debt) { debt } else { insurance_avail };
        let coin = vault_mod::take_insurance_fund(vault, cover, ctx);
        fee_collector::repay_vault_for_ledger_principal(
            vault,
            collector,
            coin,
            ledger_principal,
            protocol_constants::fee_source_insurance(),
            clock,
            ctx,
        );
        let principal_repaid = principal_repaid_for_payment(cover, debt, ledger_principal);
        if (principal_repaid > 0) {
            proxy.record_repay_for_range(key, principal_repaid);
        };
        insurance_covered = cover;
        ledger_principal = proxy.range_borrowed_quote(key);
        if (ledger_principal == 0) {
            proxy.clear_range_margin_debt(key);
            return
        };
        debt = vault_mod::debt_with_accrued_interest(vault, ledger_principal);
    };

    vault_mod::write_off_debt_for_ledger(vault, ledger_principal, debt);
    proxy.record_repay_for_range(key, ledger_principal);
    events::emit_bad_debt_written_off(
        object::id(proxy),
        proxy.owner(),
        key.oracle_id(),
        key.expiry(),
        key.lower_strike(),
        key.higher_strike(),
        false,
        true,
        insurance_covered,
        debt,
        ctx.sender(),
    );
    proxy.clear_range_margin_debt(key);
}

/// Recompute binary key leverage after vault borrow changes; reset to 1× when debt is zero.
fun sync_binary_leverage_after_vault_repay(
    proxy: &mut UserProxy,
    key: MarketKey,
    ctx: &mut TxContext,
) {
    let borrowed = proxy.binary_borrowed_quote(key);
    if (borrowed == 0) {
        proxy.reset_binary_to_unleveraged(key, ctx);
        return
    };
    let margin = proxy.binary_margin_debt(key);
    let leverage = ltv::leverage_bps_from_margin_and_borrow(margin, borrowed);
    proxy.set_binary_leverage(key, leverage, ctx);
}

/// Recompute range key leverage after vault borrow changes; reset to 1× when debt is zero.
fun sync_range_leverage_after_vault_repay(
    proxy: &mut UserProxy,
    key: RangeKey,
    ctx: &mut TxContext,
) {
    let borrowed = proxy.range_borrowed_quote(key);
    if (borrowed == 0) {
        proxy.reset_range_to_unleveraged(key, ctx);
        return
    };
    let margin = proxy.range_margin_debt(key);
    let leverage = ltv::leverage_bps_from_margin_and_borrow(margin, borrowed);
    proxy.set_range_leverage(key, leverage, ctx);
}

fun emit_binary_key_borrow_state(proxy: &UserProxy, key: MarketKey) {
    events::emit_key_borrow_updated(
        object::id(proxy),
        proxy.owner(),
        key.oracle_id(),
        key.expiry(),
        key.strike(),
        0,
        key.is_up(),
        false,
        proxy.binary_borrowed_quote(key),
        proxy.binary_margin_debt(key),
        proxy.binary_leverage_bps(key),
    );
}

fun emit_range_key_borrow_state(proxy: &UserProxy, key: RangeKey) {
    events::emit_key_borrow_updated(
        object::id(proxy),
        proxy.owner(),
        key.oracle_id(),
        key.expiry(),
        key.lower_strike(),
        key.higher_strike(),
        false,
        true,
        proxy.range_borrowed_quote(key),
        proxy.range_margin_debt(key),
        proxy.range_leverage_bps(key),
    );
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
    hold_surplus_for_remint: bool,
    clock: &Clock,
    ctx: &mut TxContext,
) {
    vault_mod::accrue_interest(vault, clock);
    let ledger_principal = proxy.binary_borrowed_quote(key);
    if (payout == 0) {
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
            0,
            0,
            0,
            ledger_principal,
            is_settled,
        );
        if (is_settled) {
            write_off_residual_binary_debt(vault, collector, proxy, key, clock, ctx);
        };
        if (!hold_surplus_for_remint) {
            triggers::maybe_clear_binary_triggers_if_flat(proxy, manager, key);
            finalize_binary_key_after_redeem<Quote>(proxy, key, ctx);
        };
        return
    };

    let ledger_principal = proxy.binary_borrowed_quote(key);
    let debt = vault_mod::debt_with_accrued_interest(vault, ledger_principal);
    let repay_amt = if (payout >= debt) { debt } else { payout };
    let principal_repaid = principal_repaid_for_payment(repay_amt, debt, ledger_principal);
    let surplus = payout - repay_amt;

    let mut payout_coin = predict_client::withdraw_quote(manager, payout, ctx);
    if (repay_amt > 0 && ledger_principal > 0) {
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
            sync_binary_leverage_after_vault_repay(proxy, key, ctx);
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
        if (hold_surplus_for_remint) {
            // Keep the residual on the key so the immediate 1x remint can consume it.
            proxy.credit_quote_for_binary(key, payout_coin, ctx);
        } else {
            // Redeem proceeds (surplus / P&L) stay in the trading account, never sent to the owner.
            proxy.credit_trading_quote(payout_coin, ctx);
        };
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
    if (is_settled) {
        write_off_residual_binary_debt(vault, collector, proxy, key, clock, ctx);
    };
    if (!hold_surplus_for_remint) {
        triggers::maybe_clear_binary_triggers_if_flat(proxy, manager, key);
        finalize_binary_key_after_redeem<Quote>(proxy, key, ctx);
    };
    emit_binary_key_borrow_state(proxy, key);
}

fun finalize_binary_key_after_redeem<Quote>(
    proxy: &mut UserProxy,
    key: MarketKey,
    ctx: &mut TxContext,
) {
    if (proxy.binary_borrowed_quote(key) == 0) {
        let owner = proxy.owner();
        proxy.reset_binary_to_unleveraged(key, ctx);
        proxy.clear_binary_margin_debt(key);
        user_proxy::sweep_binary_free_quote_to<Quote>(proxy, key, owner, ctx);
    };
}

/// After force-deleverage remint: reset leverage and sweep leftover key quote to the trading account.
fun finalize_binary_key_after_force_deleverage_remint<Quote>(
    proxy: &mut UserProxy,
    manager: &PredictManager,
    key: MarketKey,
    ctx: &mut TxContext,
) {
    if (proxy.binary_borrowed_quote(key) == 0) {
        let owner = proxy.owner();
        proxy.reset_binary_to_unleveraged(key, ctx);
        proxy.clear_binary_margin_debt(key);
        user_proxy::sweep_binary_free_quote_to<Quote>(proxy, key, owner, ctx);
    };
    triggers::maybe_clear_binary_triggers_if_flat(proxy, manager, key);
}

fun finalize_range_key_after_redeem<Quote>(
    proxy: &mut UserProxy,
    key: RangeKey,
    ctx: &mut TxContext,
) {
    if (proxy.range_borrowed_quote(key) == 0) {
        let owner = proxy.owner();
        proxy.reset_range_to_unleveraged(key, ctx);
        proxy.clear_range_margin_debt(key);
        user_proxy::sweep_range_free_quote_to<Quote>(proxy, key, owner, ctx);
    };
}

/// After force-deleverage remint: reset leverage and sweep leftover key quote to the trading account.
fun finalize_range_key_after_force_deleverage_remint<Quote>(
    proxy: &mut UserProxy,
    manager: &PredictManager,
    key: RangeKey,
    ctx: &mut TxContext,
) {
    if (proxy.range_borrowed_quote(key) == 0) {
        let owner = proxy.owner();
        proxy.reset_range_to_unleveraged(key, ctx);
        proxy.clear_range_margin_debt(key);
        user_proxy::sweep_range_free_quote_to<Quote>(proxy, key, owner, ctx);
    };
    triggers::maybe_clear_range_triggers_if_flat(proxy, manager, key);
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
    hold_surplus_for_remint: bool,
    clock: &Clock,
    ctx: &mut TxContext,
) {
    vault_mod::accrue_interest(vault, clock);
    let ledger_principal = proxy.range_borrowed_quote(key);
    if (payout == 0) {
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
            0,
            0,
            0,
            ledger_principal,
            is_settled,
        );
        if (is_settled) {
            write_off_residual_range_debt(vault, collector, proxy, key, clock, ctx);
        };
        if (!hold_surplus_for_remint) {
            triggers::maybe_clear_range_triggers_if_flat(proxy, manager, key);
            finalize_range_key_after_redeem<Quote>(proxy, key, ctx);
        };
        return
    };

    let ledger_principal = proxy.range_borrowed_quote(key);
    let debt = vault_mod::debt_with_accrued_interest(vault, ledger_principal);
    let repay_amt = if (payout >= debt) { debt } else { payout };
    let principal_repaid = principal_repaid_for_payment(repay_amt, debt, ledger_principal);
    let surplus = payout - repay_amt;

    let mut payout_coin = predict_client::withdraw_quote(manager, payout, ctx);
    if (repay_amt > 0 && ledger_principal > 0) {
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
            sync_range_leverage_after_vault_repay(proxy, key, ctx);
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
        if (hold_surplus_for_remint) {
            // Keep the residual on the key so the immediate 1x remint can consume it.
            proxy.credit_quote_for_range(key, payout_coin, ctx);
        } else {
            // Redeem proceeds (surplus / P&L) stay in the trading account, never sent to the owner.
            proxy.credit_trading_quote(payout_coin, ctx);
        };
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
    if (is_settled) {
        write_off_residual_range_debt(vault, collector, proxy, key, clock, ctx);
    };
    if (!hold_surplus_for_remint) {
        triggers::maybe_clear_range_triggers_if_flat(proxy, manager, key);
        finalize_range_key_after_redeem<Quote>(proxy, key, ctx);
    };
    emit_range_key_borrow_state(proxy, key);
}

/// Emit `LeveragedPositionOpened` for a binary mint fill.
fun emit_open_binary(
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
fun emit_open_range(
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

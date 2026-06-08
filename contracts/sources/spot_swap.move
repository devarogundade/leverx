// Copyright (c) LeverX contributors
// SPDX-License-Identifier: Apache-2.0

/// Collateral-to-quote spot swap helpers via DeepBook — proxy and liquidation paths.
module leverx::spot_swap;

use deepbook::pool::Pool;
use leverx::{
    user_proxy::UserProxy,
    errors,
    protocol_registry::LeverxRegistry,
};
use std::type_name;
use sui::{clock::Clock, coin::{Self, Coin}};
use token::deep::DEEP;

const SELF_MATCHING_ALLOWED: u8 = 0;

/// Abort when base and quote are the same coin type (no DeepBook pool needed).
public fun assert_distinct_swap_assets<BaseAsset, QuoteAsset>() {
    assert!(
        type_name::with_defining_ids<BaseAsset>() != type_name::with_defining_ids<QuoteAsset>(),
        errors::same_asset_swap(),
    );
}

/// CLOB market-order path: sell base from proxy balance manager.
/// Deposits are already on the proxy; returns quote received after settlement.
public fun swap_to_quote<BaseAsset, QuoteAsset>(
    registry: &LeverxRegistry,
    proxy: &mut UserProxy,
    pool: &mut Pool<BaseAsset, QuoteAsset>,
    base_amount: u64,
    client_order_id: u64,
    clock: &Clock,
    ctx: &mut TxContext,
): u64 {
    proxy.assert_can_act(ctx);
    assert!(base_amount > 0, errors::zero_amount());
    assert_distinct_swap_assets<BaseAsset, QuoteAsset>();
    assert!(pool.id() == leverx::protocol_registry::swap_pool_id<BaseAsset>(registry), errors::invalid_swap_pool());

    let quote_before = proxy.balance<QuoteAsset>();
    let trade_proof = proxy.trade_proof(ctx);
    let balance_manager = proxy.balance_manager_trading_mut(ctx);

    pool.place_market_order(
        balance_manager,
        &trade_proof,
        client_order_id,
        SELF_MATCHING_ALLOWED,
        base_amount,
        false,
        true,
        clock,
        ctx,
    );
    pool.withdraw_settled_amounts(balance_manager, &trade_proof);

    proxy.balance<QuoteAsset>() - quote_before
}

/// Direct swap for liquidation (no proxy balance manager).
/// Caller supplies base and DEEP fee coins; aborts if `min_quote_out` is not met.
public fun swap_collateral_coin<BaseAsset, QuoteAsset>(
    pool: &mut Pool<BaseAsset, QuoteAsset>,
    base_in: Coin<BaseAsset>,
    fee_deep: Coin<DEEP>,
    min_quote_out: u64,
    clock: &Clock,
    ctx: &mut TxContext,
): (Coin<BaseAsset>, Coin<QuoteAsset>, Coin<DEEP>) {
    assert_distinct_swap_assets<BaseAsset, QuoteAsset>();
    pool.swap_exact_base_for_quote(base_in, fee_deep, min_quote_out, clock, ctx)
}


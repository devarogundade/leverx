// Copyright (c) LeverX contributors
// SPDX-License-Identifier: Apache-2.0

/// Thin wrapper around DeepBook Predict for mint/redeem, pricing, and slippage guards.
module leverx::predict_client;

use deepbook_predict::{
    market_key::MarketKey,
    oracle::OracleSVI,
    predict,
    predict::Predict,
    predict_manager::PredictManager,
    range_key::RangeKey,
};
use leverx::{errors, ltv, protocol_constants, user_proxy::UserProxy};
use std::u128;
use sui::{clock::Clock, coin::Coin};

/// Create a new Predict manager and return its object ID.
public fun create_manager(ctx: &mut TxContext): ID {
    predict::create_manager(ctx)
}

/// Transaction entry: create a Predict manager (ID is not returned to caller).
public entry fun create_manager_entry(ctx: &mut TxContext) {
    create_manager(ctx);
}

/// Preview mint cost and redeem payout for a binary market trade at current oracle.
public fun preview_trade(
    predict_obj: &Predict,
    oracle: &OracleSVI,
    key: MarketKey,
    quantity: u64,
    clock: &Clock,
): (u64, u64) {
    predict_obj.get_trade_amounts(oracle, key, quantity, clock)
}

/// Protocol min/max ask for an oracle (1e9-scaled premium per contract).
public fun ask_bounds(predict_obj: &Predict, oracle_id: ID): (u64, u64) {
    predict_obj.ask_bounds(oracle_id)
}

/// Premium per contract from total mint cost: `cost * SCALE / quantity`.
public fun premium_per_unit(mint_cost: u64, quantity: u64): u64 {
    assert!(quantity > 0, errors::zero_quantity());
    (u128::divide_and_round_up(
        (mint_cost as u128) * (protocol_constants::predict_price_scale() as u128),
        quantity as u128,
    )) as u64
}

/// Total cost from a per-contract premium cap.
public fun cost_from_premium_per_unit(premium_per_unit: u64, quantity: u64): u64 {
    assert!(quantity > 0, errors::zero_quantity());
    ((premium_per_unit as u128) * (quantity as u128)
        / (protocol_constants::predict_price_scale() as u128)) as u64
}

/// Current binary market ask: per-contract premium (1e9-scaled) and total mint cost.
public fun market_ask_binary(
    predict_obj: &Predict,
    oracle: &OracleSVI,
    key: MarketKey,
    quantity: u64,
    clock: &Clock,
): (u64, u64) {
    let (mint_cost, _) = preview_trade(predict_obj, oracle, key, quantity, clock);
    (premium_per_unit(mint_cost, quantity), mint_cost)
}

/// Current binary market bid: per-contract premium (1e9-scaled) and total redeem payout.
public fun market_bid_binary(
    predict_obj: &Predict,
    oracle: &OracleSVI,
    key: MarketKey,
    quantity: u64,
    clock: &Clock,
): (u64, u64) {
    let (_, redeem_payout) = preview_trade(predict_obj, oracle, key, quantity, clock);
    (premium_per_unit(redeem_payout, quantity), redeem_payout)
}

/// Current range market ask: per-contract premium (1e9-scaled) and total mint cost.
public fun market_ask_range(
    predict_obj: &Predict,
    oracle: &OracleSVI,
    key: RangeKey,
    quantity: u64,
    clock: &Clock,
): (u64, u64) {
    let (mint_cost, _) = preview_range_trade(predict_obj, oracle, key, quantity, clock);
    (premium_per_unit(mint_cost, quantity), mint_cost)
}

/// Current range market bid: per-contract premium (1e9-scaled) and total redeem payout.
public fun market_bid_range(
    predict_obj: &Predict,
    oracle: &OracleSVI,
    key: RangeKey,
    quantity: u64,
    clock: &Clock,
): (u64, u64) {
    let (_, redeem_payout) = preview_range_trade(predict_obj, oracle, key, quantity, clock);
    (premium_per_unit(redeem_payout, quantity), redeem_payout)
}

/// Slippage tolerance above a limit premium (1e9-scaled per contract).
public fun premium_slippage_tolerance(premium_per_unit: u64, slippage_bps: u64): u64 {
    ltv::mul_bps(premium_per_unit, slippage_bps)
}

/// Max acceptable ask for a resting buy limit: `limit + slippage`.
public fun max_acceptable_buy_ask(limit_premium_per_unit: u64, slippage_bps: u64): u64 {
    limit_premium_per_unit + premium_slippage_tolerance(limit_premium_per_unit, slippage_bps)
}

/// At order placement the live market ask must sit within `placement_slippage_bps` of the limit.
public fun assert_placement_price_aligned(
    market_ask_per_unit: u64,
    limit_premium_per_unit: u64,
    placement_slippage_bps: u64,
) {
    assert!(limit_premium_per_unit > 0, errors::zero_amount());
    assert!(
        placement_slippage_bps <= protocol_constants::max_limit_order_slippage_bps(),
        errors::slippage_too_high(),
    );
    let tolerance = premium_slippage_tolerance(limit_premium_per_unit, placement_slippage_bps);
    let lower = if (limit_premium_per_unit > tolerance) {
        limit_premium_per_unit - tolerance
    } else {
        0
    };
    let upper = limit_premium_per_unit + tolerance;
    assert!(
        market_ask_per_unit >= lower && market_ask_per_unit <= upper,
        errors::placement_price_not_aligned(),
    );
}

/// Limit buy fill: market ask must be at or below limit + stored placement slippage.
public fun assert_limit_buy_fill_met(
    market_ask_per_unit: u64,
    limit_premium_per_unit: u64,
    slippage_bps: u64,
) {
    assert!(limit_premium_per_unit > 0, errors::zero_amount());
    let max_ask = max_acceptable_buy_ask(limit_premium_per_unit, slippage_bps);
    assert!(market_ask_per_unit <= max_ask, errors::limit_price_not_met());
}

/// Limit sell: abort unless current market bid is at or above the user's floor.
public fun assert_limit_sell_bid_met(market_bid_per_unit: u64, min_premium_per_unit: u64) {
    assert!(min_premium_per_unit > 0, errors::zero_amount());
    assert!(market_bid_per_unit >= min_premium_per_unit, errors::limit_price_not_met());
}

/// Market order slippage guard on total mint cost.
public fun assert_market_slippage(max_mint_cost: u64, mint_cost: u64) {
    assert!(max_mint_cost > 0, errors::zero_amount());
    assert!(mint_cost <= max_mint_cost, errors::slippage_exceeded());
}

/// Market order slippage guard on total redeem payout (`min_payout == 0` disables the check).
public fun assert_redeem_slippage(min_payout: u64, payout: u64) {
    if (min_payout > 0) {
        assert!(payout >= min_payout, errors::slippage_exceeded());
    };
}

/// Premium must sit inside Predict's per-oracle ask bounds.
public fun assert_premium_within_bounds(
    predict_obj: &Predict,
    oracle_id: ID,
    premium_per_unit: u64,
) {
    let (min_ask, max_ask) = ask_bounds(predict_obj, oracle_id);
    assert!(
        premium_per_unit >= min_ask && premium_per_unit <= max_ask,
        errors::ask_out_of_bounds(),
    );
}

/// Preview mint cost and redeem payout for a range market trade at current oracle.
public fun preview_range_trade(
    predict_obj: &Predict,
    oracle: &OracleSVI,
    key: RangeKey,
    quantity: u64,
    clock: &Clock,
): (u64, u64) {
    predict_obj.get_range_trade_amounts(oracle, key, quantity, clock)
}

/// Deposit quote into a Predict manager balance for minting positions.
public fun deposit_quote<Quote>(
    manager: &mut PredictManager,
    coin: Coin<Quote>,
    ctx: &TxContext,
) {
    assert!(coin.value() > 0, errors::zero_amount());
    manager.deposit(coin, ctx);
}

/// Mint binary prediction contracts against manager quote balance.
public fun mint_binary<Quote>(
    predict_obj: &mut Predict,
    manager: &mut PredictManager,
    oracle: &OracleSVI,
    key: MarketKey,
    quantity: u64,
    clock: &Clock,
    ctx: &mut TxContext,
) {
    assert!(quantity > 0, errors::zero_quantity());
    predict::mint<Quote>(predict_obj, manager, oracle, key, quantity, clock, ctx);
}

/// Mint range prediction contracts against manager quote balance.
public fun mint_range<Quote>(
    predict_obj: &mut Predict,
    manager: &mut PredictManager,
    oracle: &OracleSVI,
    key: RangeKey,
    quantity: u64,
    clock: &Clock,
    ctx: &mut TxContext,
) {
    assert!(quantity > 0, errors::zero_quantity());
    predict::mint_range<Quote>(predict_obj, manager, oracle, key, quantity, clock, ctx);
}

/// Redeem binary contracts for quote payout into the manager balance.
public fun redeem_binary<Quote>(
    predict_obj: &mut Predict,
    manager: &mut PredictManager,
    oracle: &OracleSVI,
    key: MarketKey,
    quantity: u64,
    clock: &Clock,
    ctx: &mut TxContext,
) {
    assert!(quantity > 0, errors::zero_quantity());
    predict::redeem<Quote>(predict_obj, manager, oracle, key, quantity, clock, ctx);
}

/// Redeem range contracts for quote payout into the manager balance.
public fun redeem_range<Quote>(
    predict_obj: &mut Predict,
    manager: &mut PredictManager,
    oracle: &OracleSVI,
    key: RangeKey,
    quantity: u64,
    clock: &Clock,
    ctx: &mut TxContext,
) {
    assert!(quantity > 0, errors::zero_quantity());
    predict::redeem_range<Quote>(predict_obj, manager, oracle, key, quantity, clock, ctx);
}

/// Permissionless redeem of settled binary contracts (no owner signature required).
public fun redeem_settled_permissionless<Quote>(
    predict_obj: &mut Predict,
    manager: &mut PredictManager,
    oracle: &OracleSVI,
    key: MarketKey,
    quantity: u64,
    clock: &Clock,
    ctx: &mut TxContext,
) {
    assert!(quantity > 0, errors::zero_quantity());
    predict::redeem_permissionless<Quote>(predict_obj, manager, oracle, key, quantity, clock, ctx);
}

/// Withdraw quote from a Predict manager balance to the caller.
public fun withdraw_quote<Quote>(
    manager: &mut PredictManager,
    amount: u64,
    ctx: &mut TxContext,
): Coin<Quote> {
    assert!(amount > 0, errors::zero_amount());
    manager.withdraw(amount, ctx)
}

/// Quote balance held in a Predict manager.
public fun manager_balance<Quote>(manager: &PredictManager): u64 {
    manager.balance<Quote>()
}

/// Open binary contract quantity held in a Predict manager for `key`.
public fun manager_binary_position(manager: &PredictManager, key: MarketKey): u64 {
    manager.position(key)
}

/// Open range contract quantity held in a Predict manager for `key`.
public fun manager_range_position(manager: &PredictManager, key: RangeKey): u64 {
    manager.range_position(key)
}

/// Redeem binary contracts and credit only the incremental payout to a market key ledger.
public fun redeem_binary_and_credit_key<Quote>(
    predict_obj: &mut Predict,
    manager: &mut PredictManager,
    oracle: &OracleSVI,
    key: MarketKey,
    quantity: u64,
    proxy: &mut UserProxy,
    clock: &Clock,
    ctx: &mut TxContext,
): u64 {
    let balance_before = manager_balance<Quote>(manager);
    redeem_binary<Quote>(predict_obj, manager, oracle, key, quantity, clock, ctx);
    credit_manager_delta_to_binary_key<Quote>(manager, key, balance_before, proxy, ctx)
}

/// Redeem range contracts and credit only the incremental payout to a market key ledger.
public fun redeem_range_and_credit_key<Quote>(
    predict_obj: &mut Predict,
    manager: &mut PredictManager,
    oracle: &OracleSVI,
    key: RangeKey,
    quantity: u64,
    proxy: &mut UserProxy,
    clock: &Clock,
    ctx: &mut TxContext,
): u64 {
    let balance_before = manager_balance<Quote>(manager);
    redeem_range<Quote>(predict_obj, manager, oracle, key, quantity, clock, ctx);
    credit_manager_delta_to_range_key<Quote>(manager, key, balance_before, proxy, ctx)
}

fun credit_manager_delta_to_binary_key<Quote>(
    manager: &mut PredictManager,
    key: MarketKey,
    balance_before: u64,
    proxy: &mut UserProxy,
    ctx: &mut TxContext,
): u64 {
    let payout = manager_balance<Quote>(manager) - balance_before;
    if (payout > 0) {
        let coin = withdraw_quote<Quote>(manager, payout, ctx);
        proxy.credit_quote_for_binary(key, coin, ctx);
    };
    payout
}

fun credit_manager_delta_to_range_key<Quote>(
    manager: &mut PredictManager,
    key: RangeKey,
    balance_before: u64,
    proxy: &mut UserProxy,
    ctx: &mut TxContext,
): u64 {
    let payout = manager_balance<Quote>(manager) - balance_before;
    if (payout > 0) {
        let coin = withdraw_quote<Quote>(manager, payout, ctx);
        proxy.credit_quote_for_range(key, coin, ctx);
    };
    payout
}

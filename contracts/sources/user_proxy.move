// Copyright (c) LeverX contributors
// SPDX-License-Identifier: Apache-2.0

/// Per-user account object for LeverX leveraged prediction trading.
///
/// # Proxy-per-user pattern
/// Each trader receives one shared `UserProxy` object at onboarding. The proxy is the
/// single custody surface for that user's assets, authorization state, and per-market
/// accounting. Protocol modules (`trade`, `liquidation`, `ltv`, etc.) mutate the proxy
/// on behalf of the owner or registered executors; end users never hold raw DeepBook caps.
///
/// # Per-market-key ledgers
/// Collateral and quote margin are **not** fungible across markets. For every binary
/// `MarketKey` or range `RangeKey`, the proxy maintains:
/// - A `PositionLedger` (`quote_balance`, `borrowed_quote`)
/// - A nested `Table<TypeName, u64>` of collateral balances by asset type
/// - Optional `TriggerConfig` (take-profit / stop-loss premiums)
/// - At most one resting `PendingLimitMintOrder`
///
/// Deposits land in the shared DeepBook `BalanceManager` first, then credit the
/// appropriate market-key ledger. Withdrawals and liquidations debit the ledger before
/// pulling coins from the balance manager.
///
/// # DeepBook balance manager integration
/// On creation, the proxy mints a DeepBook `BalanceManager` owned by the proxy object
/// address, plus `DepositCap`, `WithdrawCap`, and `TradeCap`. Physical coin storage lives
/// in the balance manager; ledgers track logical allocation. `trade_proof` exposes
/// DeepBook trading for predict-market settlement without transferring cap ownership.
module leverx::user_proxy;

use deepbook::{
    balance_manager::{Self, BalanceManager, DepositCap, TradeCap, WithdrawCap},
    registry::Registry,
};
use deepbook_predict::{market_key::MarketKey, range_key::RangeKey};
use leverx::{errors, events};
use std::type_name::{Self, TypeName};
use sui::{clock::Clock, coin::{Self, Coin}, table::{Self, Table}, vec_set::{Self, VecSet}};

/// Marker type passed to DeepBook when minting a balance manager for LeverX proxies.
public struct LeverxApp has drop {}

/// Take-profit and stop-loss trigger thresholds for a single market key.
///
/// Premiums are expressed in the same units as predict-market ask prices; keepers compare
/// live market premium against these values to fire automated exits.
public struct TriggerConfig has copy, drop, store {
    /// Premium at or above which a take-profit close is eligible.
    take_profit_premium: u64,
    /// Premium at or below which a stop-loss close is eligible.
    stop_loss_premium: u64,
}

/// Per-market-key quote margin and vault debt — collateral is not shared across keys.
public struct PositionLedger has store {
    /// Quote tokens allocated to this market key (margin, proceeds, reserved limit margin).
    quote_balance: u64,
    /// Quote borrowed from the protocol vault for this market key (subset of proxy total).
    borrowed_quote: u64,
}

/// Resting leveraged mint limit order — slippage is frozen at placement for keeper fills.
public struct PendingLimitMintOrder has copy, drop, store {
    /// Maximum premium per unit the user is willing to pay on fill.
    limit_premium_per_unit: u64,
    /// Slippage tolerance in basis points, fixed at order placement.
    slippage_bps: u64,
    /// Market ask premium snapshot when the order was placed (slippage reference).
    market_ask_at_place: u64,
    /// Quote margin locked for this order.
    margin_quote: u64,
    /// Desired leverage in basis points (e.g. 50000 = 5×).
    leverage_bps: u64,
    /// Number of outcome units to mint on fill.
    quantity: u64,
    /// Unix timestamp (ms) after which the order may not be filled.
    expires_ms: u64,
    /// Unix timestamp (ms) when the order was placed.
    placed_at_ms: u64,
    /// Address that placed the order (owner or registered executor).
    placed_by: address,
}

/// Shared on-chain account for one LeverX user.
///
/// Owns a DeepBook balance manager for physical custody and maintains logical ledgers
/// keyed by binary `MarketKey` and range `RangeKey`.
public struct UserProxy has key {
    /// Unique object identifier for this proxy.
    id: UID,
    /// Human owner; required for admin actions and executor registration.
    owner: address,
    /// Linked DeepBook Predict manager object used for market routing.
    predict_manager_id: ID,
    /// Aggregate quote borrowed across all market keys (sum of ledger `borrowed_quote`).
    borrowed_quote: u64,
    /// DeepBook balance manager holding all physical coins for this user.
    balance_manager: BalanceManager,
    /// Capability to deposit coins into `balance_manager`.
    deposit_cap: DepositCap,
    /// Capability to withdraw coins from `balance_manager`.
    withdraw_cap: WithdrawCap,
    /// Capability to generate trade proofs for DeepBook settlement.
    trade_cap: TradeCap,
    /// Session executors (e.g. bot keys) allowed to act alongside the owner.
    executors: VecSet<address>,
    /// Quote/debt ledgers indexed by binary market key.
    binary_ledgers: Table<MarketKey, PositionLedger>,
    /// Quote/debt ledgers indexed by range market key.
    range_ledgers: Table<RangeKey, PositionLedger>,
    /// Per-asset collateral balances for binary markets (market key → asset → amount).
    binary_collateral: Table<MarketKey, Table<TypeName, u64>>,
    /// Per-asset collateral balances for range markets (range key → asset → amount).
    range_collateral: Table<RangeKey, Table<TypeName, u64>>,
    /// Take-profit / stop-loss config for binary markets.
    binary_triggers: Table<MarketKey, TriggerConfig>,
    /// Take-profit / stop-loss config for range markets.
    range_triggers: Table<RangeKey, TriggerConfig>,
    /// At most one resting limit mint order per binary market key.
    binary_limit_mints: Table<MarketKey, PendingLimitMintOrder>,
    /// At most one resting limit mint order per range market key.
    range_limit_mints: Table<RangeKey, PendingLimitMintOrder>,
}

// === Account factory ===

/// Create and share a new `UserProxy` for `ctx.sender()`.
///
/// Mints a DeepBook balance manager owned by the proxy object address and initializes
/// empty ledger tables. Emits `AccountCreated`.
public fun create(
    deepbook_registry: &Registry,
    predict_manager_id: ID,
    ctx: &mut TxContext,
) {
    let id = object::new(ctx);
    let owner = ctx.sender();

    let (
        balance_manager,
        deposit_cap,
        withdraw_cap,
        trade_cap,
    ) = balance_manager::new_with_custom_owner_caps<LeverxApp>(
        deepbook_registry,
        id.to_address(),
        ctx,
    );

    let proxy = UserProxy {
        id,
        owner,
        predict_manager_id,
        borrowed_quote: 0,
        balance_manager,
        deposit_cap,
        withdraw_cap,
        trade_cap,
        executors: vec_set::empty(),
        binary_ledgers: table::new(ctx),
        range_ledgers: table::new(ctx),
        binary_collateral: table::new(ctx),
        range_collateral: table::new(ctx),
        binary_triggers: table::new(ctx),
        range_triggers: table::new(ctx),
        binary_limit_mints: table::new(ctx),
        range_limit_mints: table::new(ctx),
    };

    events::emit_account_created(object::id(&proxy), owner, predict_manager_id);
    transfer::share_object(proxy);
}

/// Update the linked Predict manager ID. Owner-only.
public fun link_predict_manager(proxy: &mut UserProxy, manager_id: ID, ctx: &TxContext) {
    proxy.assert_owner(ctx);
    proxy.predict_manager_id = manager_id;
    events::emit_predict_manager_linked(object::id(proxy), proxy.owner, manager_id);
}

/// Grant an executor address permission to act on this proxy. Owner-only.
public fun register_executor_cap(proxy: &mut UserProxy, executor: address, ctx: &TxContext) {
    proxy.assert_owner(ctx);
    proxy.executors.insert(executor);
    events::emit_executor_registered(object::id(proxy), executor);
}

/// Revoke a previously registered executor. Owner-only.
public fun revoke_executor_cap(proxy: &mut UserProxy, executor: address, ctx: &TxContext) {
    proxy.assert_owner(ctx);
    proxy.executors.remove(&executor);
    events::emit_executor_revoked(object::id(proxy), executor);
}

/// Protocol admin may register a session executor (e.g. Telegram bot key).
public(package) fun register_executor_by_admin(proxy: &mut UserProxy, executor: address) {
    proxy.executors.insert(executor);
    events::emit_executor_registered(object::id(proxy), executor);
}

/// Protocol admin may revoke a session executor without owner signature.
public(package) fun revoke_executor_by_admin(proxy: &mut UserProxy, executor: address) {
    proxy.executors.remove(&executor);
    events::emit_executor_revoked(object::id(proxy), executor);
}

// === Read-only getters ===

/// Return the human owner of this proxy.
public fun owner(proxy: &UserProxy): address {
    proxy.owner
}

/// Return the linked DeepBook Predict manager object ID.
public fun predict_manager_id(proxy: &UserProxy): ID {
    proxy.predict_manager_id
}

/// Return total quote borrowed across all market keys.
public fun borrowed_quote(proxy: &UserProxy): u64 {
    proxy.borrowed_quote
}

/// Return the physical balance of `Asset` in the DeepBook balance manager (all keys combined).
public fun balance<Asset>(proxy: &UserProxy): u64 {
    proxy.balance_manager.balance<Asset>()
}

/// Return quote allocated to a binary market key, or `0` if no ledger exists.
public fun binary_quote_balance(proxy: &UserProxy, key: MarketKey): u64 {
    if (proxy.binary_ledgers.contains(key)) {
        proxy.binary_ledgers.borrow(key).quote_balance
    } else {
        0
    }
}

/// Return quote allocated to a range market key, or `0` if no ledger exists.
public fun range_quote_balance(proxy: &UserProxy, key: RangeKey): u64 {
    if (proxy.range_ledgers.contains(key)) {
        proxy.range_ledgers.borrow(key).quote_balance
    } else {
        0
    }
}

/// Return quote borrowed for a binary market key, or `0` if no ledger exists.
public fun binary_borrowed_quote(proxy: &UserProxy, key: MarketKey): u64 {
    if (proxy.binary_ledgers.contains(key)) {
        proxy.binary_ledgers.borrow(key).borrowed_quote
    } else {
        0
    }
}

/// Return quote borrowed for a range market key, or `0` if no ledger exists.
public fun range_borrowed_quote(proxy: &UserProxy, key: RangeKey): u64 {
    if (proxy.range_ledgers.contains(key)) {
        proxy.range_ledgers.borrow(key).borrowed_quote
    } else {
        0
    }
}

/// Return collateral of type `Collateral` allocated to a binary market key.
public fun binary_collateral_balance<Collateral>(proxy: &UserProxy, key: MarketKey): u64 {
    let asset = type_name::with_defining_ids<Collateral>();
    if (proxy.binary_collateral.contains(key)) {
        let amounts = proxy.binary_collateral.borrow(key);
        if (amounts.contains(asset)) {
            *amounts.borrow(asset)
        } else {
            0
        }
    } else {
        0
    }
}

/// Return collateral of type `Collateral` allocated to a range market key.
public fun range_collateral_balance<Collateral>(proxy: &UserProxy, key: RangeKey): u64 {
    let asset = type_name::with_defining_ids<Collateral>();
    if (proxy.range_collateral.contains(key)) {
        let amounts = proxy.range_collateral.borrow(key);
        if (amounts.contains(asset)) {
            *amounts.borrow(asset)
        } else {
            0
        }
    } else {
        0
    }
}

/// Return `(take_profit_premium, stop_loss_premium)` for a binary key, or `(0, 0)`.
public fun get_binary_triggers(proxy: &UserProxy, key: MarketKey): (u64, u64) {
    if (proxy.binary_triggers.contains(key)) {
        let t = proxy.binary_triggers.borrow(key);
        (t.take_profit_premium, t.stop_loss_premium)
    } else {
        (0, 0)
    }
}

/// Return `(take_profit_premium, stop_loss_premium)` for a range key, or `(0, 0)`.
public fun get_range_triggers(proxy: &UserProxy, key: RangeKey): (u64, u64) {
    if (proxy.range_triggers.contains(key)) {
        let t = proxy.range_triggers.borrow(key);
        (t.take_profit_premium, t.stop_loss_premium)
    } else {
        (0, 0)
    }
}

// === User deposits ===

/// Deposit collateral for a binary market: physical deposit + ledger credit. Owner or executor.
public fun deposit_collateral_for_binary<Collateral>(
    proxy: &mut UserProxy,
    key: MarketKey,
    coin: Coin<Collateral>,
    ctx: &mut TxContext,
) {
    proxy.assert_can_act(ctx);
    let amount = coin.value();
    assert!(amount > 0, errors::zero_amount());
    proxy.balance_manager.deposit_with_cap(&proxy.deposit_cap, coin, ctx);
    credit_binary_collateral_amount(proxy, key, type_name::with_defining_ids<Collateral>(), amount, ctx);
}

/// Deposit collateral for a range market: physical deposit + ledger credit. Owner or executor.
public fun deposit_collateral_for_range<Collateral>(
    proxy: &mut UserProxy,
    key: RangeKey,
    coin: Coin<Collateral>,
    ctx: &mut TxContext,
) {
    proxy.assert_can_act(ctx);
    let amount = coin.value();
    assert!(amount > 0, errors::zero_amount());
    proxy.balance_manager.deposit_with_cap(&proxy.deposit_cap, coin, ctx);
    credit_range_collateral_amount(proxy, key, type_name::with_defining_ids<Collateral>(), amount, ctx);
}

/// Deposit quote for a binary market: physical deposit + ledger credit. Owner or executor.
public fun deposit_quote_for_binary<Quote>(
    proxy: &mut UserProxy,
    key: MarketKey,
    coin: Coin<Quote>,
    ctx: &mut TxContext,
) {
    proxy.assert_can_act(ctx);
    let amount = coin.value();
    assert!(amount > 0, errors::zero_amount());
    proxy.balance_manager.deposit_with_cap(&proxy.deposit_cap, coin, ctx);
    credit_binary_quote(proxy, key, amount, ctx);
}

/// Deposit quote for a range market: physical deposit + ledger credit. Owner or executor.
public fun deposit_quote_for_range<Quote>(
    proxy: &mut UserProxy,
    key: RangeKey,
    coin: Coin<Quote>,
    ctx: &mut TxContext,
) {
    proxy.assert_can_act(ctx);
    let amount = coin.value();
    assert!(amount > 0, errors::zero_amount());
    proxy.balance_manager.deposit_with_cap(&proxy.deposit_cap, coin, ctx);
    credit_range_quote(proxy, key, amount, ctx);
}

// === Physical balance manager ops ===

/// Physical withdraw from the shared balance manager (no market-key allocation).
public(package) fun withdraw_physical<Asset>(
    proxy: &mut UserProxy,
    amount: u64,
    ctx: &mut TxContext,
): Coin<Asset> {
    proxy.balance_manager.withdraw_with_cap(&proxy.withdraw_cap, amount, ctx)
}

/// Physical deposit into the shared balance manager (no market-key allocation).
public(package) fun deposit_physical<Asset>(
    proxy: &mut UserProxy,
    coin: Coin<Asset>,
    ctx: &TxContext,
) {
    proxy.balance_manager.deposit_with_cap(&proxy.deposit_cap, coin, ctx);
}

/// Withdraw the entire physical balance of `Asset` (liquidation / migration helper).
public(package) fun seize_all_collateral<Asset>(
    proxy: &mut UserProxy,
    ctx: &mut TxContext,
): Coin<Asset> {
    let amount = proxy.balance<Asset>();
    if (amount == 0) {
        coin::zero(ctx)
    } else {
        proxy.balance_manager.withdraw_with_cap(&proxy.withdraw_cap, amount, ctx)
    }
}

// === Protocol quote credit ===

/// Credit quote proceeds to a binary market key (protocol — no auth check).
public(package) fun credit_quote_for_binary<Quote>(
    proxy: &mut UserProxy,
    key: MarketKey,
    coin: Coin<Quote>,
    ctx: &mut TxContext,
) {
    let amount = coin.value();
    if (amount > 0) {
        proxy.balance_manager.deposit_with_cap(&proxy.deposit_cap, coin, ctx);
        credit_binary_quote(proxy, key, amount, ctx);
    } else {
        coin::destroy_zero(coin);
    };
}

/// Credit quote proceeds to a range market key (protocol — no auth check).
public(package) fun credit_quote_for_range<Quote>(
    proxy: &mut UserProxy,
    key: RangeKey,
    coin: Coin<Quote>,
    ctx: &mut TxContext,
) {
    let amount = coin.value();
    if (amount > 0) {
        proxy.balance_manager.deposit_with_cap(&proxy.deposit_cap, coin, ctx);
        credit_range_quote(proxy, key, amount, ctx);
    } else {
        coin::destroy_zero(coin);
    };
}

// === Protocol withdrawals ===

/// Debit binary quote ledger and withdraw matching coins from the balance manager.
public(package) fun withdraw_quote_from_binary<Quote>(
    proxy: &mut UserProxy,
    key: MarketKey,
    amount: u64,
    ctx: &mut TxContext,
): Coin<Quote> {
    debit_binary_quote(proxy, key, amount);
    proxy.balance_manager.withdraw_with_cap(&proxy.withdraw_cap, amount, ctx)
}

/// Debit range quote ledger and withdraw matching coins from the balance manager.
public(package) fun withdraw_quote_from_range<Quote>(
    proxy: &mut UserProxy,
    key: RangeKey,
    amount: u64,
    ctx: &mut TxContext,
): Coin<Quote> {
    debit_range_quote(proxy, key, amount);
    proxy.balance_manager.withdraw_with_cap(&proxy.withdraw_cap, amount, ctx)
}

/// Debit binary collateral ledger and withdraw matching coins from the balance manager.
public(package) fun withdraw_collateral_from_binary<Collateral>(
    proxy: &mut UserProxy,
    key: MarketKey,
    amount: u64,
    ctx: &mut TxContext,
): Coin<Collateral> {
    debit_binary_collateral_amount(
        proxy,
        key,
        type_name::with_defining_ids<Collateral>(),
        amount,
    );
    proxy.balance_manager.withdraw_with_cap(&proxy.withdraw_cap, amount, ctx)
}

/// Debit range collateral ledger and withdraw matching coins from the balance manager.
public(package) fun withdraw_collateral_from_range<Collateral>(
    proxy: &mut UserProxy,
    key: RangeKey,
    amount: u64,
    ctx: &mut TxContext,
): Coin<Collateral> {
    debit_range_collateral_amount(
        proxy,
        key,
        type_name::with_defining_ids<Collateral>(),
        amount,
    );
    proxy.balance_manager.withdraw_with_cap(&proxy.withdraw_cap, amount, ctx)
}

// === Quote reserve (limit orders) ===

/// Lock quote margin for a resting limit order on this binary market key.
public(package) fun reserve_binary_quote(
    proxy: &mut UserProxy,
    key: MarketKey,
    amount: u64,
    ctx: &mut TxContext,
) {
    debit_binary_quote(proxy, key, amount);
    ensure_binary_ledger(proxy, key, ctx);
}

/// Lock quote margin for a resting limit order on this range market key.
public(package) fun reserve_range_quote(
    proxy: &mut UserProxy,
    key: RangeKey,
    amount: u64,
    ctx: &mut TxContext,
) {
    debit_range_quote(proxy, key, amount);
    ensure_range_ledger(proxy, key, ctx);
}

/// Return reserved quote to the binary ledger (cancel / expire path).
public(package) fun release_binary_quote_reserve(
    proxy: &mut UserProxy,
    key: MarketKey,
    amount: u64,
    ctx: &mut TxContext,
) {
    credit_binary_quote(proxy, key, amount, ctx);
}

/// Return reserved quote to the range ledger (cancel / expire path).
public(package) fun release_range_quote_reserve(
    proxy: &mut UserProxy,
    key: RangeKey,
    amount: u64,
    ctx: &mut TxContext,
) {
    credit_range_quote(proxy, key, amount, ctx);
}

// === Borrow / repay accounting ===

/// Record a vault borrow: credit quote balance and increment per-key and aggregate debt.
public(package) fun record_borrow_for_binary(
    proxy: &mut UserProxy,
    key: MarketKey,
    amount: u64,
    ctx: &mut TxContext,
) {
    let ledger = ensure_binary_ledger(proxy, key, ctx);
    ledger.quote_balance = ledger.quote_balance + amount;
    ledger.borrowed_quote = ledger.borrowed_quote + amount;
    proxy.borrowed_quote = proxy.borrowed_quote + amount;
}

/// Record a vault borrow for a range market key.
public(package) fun record_borrow_for_range(
    proxy: &mut UserProxy,
    key: RangeKey,
    amount: u64,
    ctx: &mut TxContext,
) {
    let ledger = ensure_range_ledger(proxy, key, ctx);
    ledger.quote_balance = ledger.quote_balance + amount;
    ledger.borrowed_quote = ledger.borrowed_quote + amount;
    proxy.borrowed_quote = proxy.borrowed_quote + amount;
}

/// Record partial or full repayment of binary-market vault debt.
public(package) fun record_repay_for_binary(proxy: &mut UserProxy, key: MarketKey, amount: u64) {
    assert!(proxy.binary_ledgers.contains(key), errors::outstanding_debt());
    let ledger = proxy.binary_ledgers.borrow_mut(key);
    assert!(amount <= ledger.borrowed_quote, errors::outstanding_debt());
    ledger.borrowed_quote = ledger.borrowed_quote - amount;
    proxy.borrowed_quote = proxy.borrowed_quote - amount;
}

/// Record partial or full repayment of range-market vault debt.
public(package) fun record_repay_for_range(proxy: &mut UserProxy, key: RangeKey, amount: u64) {
    assert!(proxy.range_ledgers.contains(key), errors::outstanding_debt());
    let ledger = proxy.range_ledgers.borrow_mut(key);
    assert!(amount <= ledger.borrowed_quote, errors::outstanding_debt());
    ledger.borrowed_quote = ledger.borrowed_quote - amount;
    proxy.borrowed_quote = proxy.borrowed_quote - amount;
}

// === Liquidation seizure ===

/// Seize all collateral of `Collateral` allocated to a binary key (liquidation).
public(package) fun seize_binary_collateral<Collateral>(
    proxy: &mut UserProxy,
    key: MarketKey,
    ctx: &mut TxContext,
): Coin<Collateral> {
    let asset = type_name::with_defining_ids<Collateral>();
    let amount = proxy.binary_collateral_balance<Collateral>(key);
    if (amount == 0) {
        coin::zero(ctx)
    } else {
        debit_binary_collateral_amount(proxy, key, asset, amount);
        proxy.balance_manager.withdraw_with_cap(&proxy.withdraw_cap, amount, ctx)
    }
}

/// Seize all collateral of `Collateral` allocated to a range key (liquidation).
public(package) fun seize_range_collateral<Collateral>(
    proxy: &mut UserProxy,
    key: RangeKey,
    ctx: &mut TxContext,
): Coin<Collateral> {
    let asset = type_name::with_defining_ids<Collateral>();
    let amount = proxy.range_collateral_balance<Collateral>(key);
    if (amount == 0) {
        coin::zero(ctx)
    } else {
        debit_range_collateral_amount(proxy, key, asset, amount);
        proxy.balance_manager.withdraw_with_cap(&proxy.withdraw_cap, amount, ctx)
    }
}

// === Ledger ops (internal) ===

/// Increase binary quote ledger balance; creates the ledger if missing.
fun credit_binary_quote(proxy: &mut UserProxy, key: MarketKey, amount: u64, ctx: &mut TxContext) {
    let ledger = ensure_binary_ledger(proxy, key, ctx);
    ledger.quote_balance = ledger.quote_balance + amount;
}

/// Increase range quote ledger balance; creates the ledger if missing.
fun credit_range_quote(proxy: &mut UserProxy, key: RangeKey, amount: u64, ctx: &mut TxContext) {
    let ledger = ensure_range_ledger(proxy, key, ctx);
    ledger.quote_balance = ledger.quote_balance + amount;
}

/// Decrease binary quote ledger balance; aborts if insufficient or ledger missing.
fun debit_binary_quote(proxy: &mut UserProxy, key: MarketKey, amount: u64) {
    assert!(proxy.binary_ledgers.contains(key), errors::insufficient_collateral());
    let ledger = proxy.binary_ledgers.borrow_mut(key);
    assert!(ledger.quote_balance >= amount, errors::insufficient_collateral());
    ledger.quote_balance = ledger.quote_balance - amount;
}

/// Decrease range quote ledger balance; aborts if insufficient or ledger missing.
fun debit_range_quote(proxy: &mut UserProxy, key: RangeKey, amount: u64) {
    assert!(proxy.range_ledgers.contains(key), errors::insufficient_collateral());
    let ledger = proxy.range_ledgers.borrow_mut(key);
    assert!(ledger.quote_balance >= amount, errors::insufficient_collateral());
    ledger.quote_balance = ledger.quote_balance - amount;
}

/// Increase binary collateral balance for `asset`; ensures ledger and collateral table exist.
fun credit_binary_collateral_amount(
    proxy: &mut UserProxy,
    key: MarketKey,
    asset: TypeName,
    amount: u64,
    ctx: &mut TxContext,
) {
    let amounts = ensure_binary_collateral_table(proxy, key, ctx);
    if (amounts.contains(asset)) {
        let bal = amounts.borrow_mut(asset);
        *bal = *bal + amount;
    } else {
        amounts.add(asset, amount);
    };
    ensure_binary_ledger(proxy, key, ctx);
}

/// Increase range collateral balance for `asset`; ensures ledger and collateral table exist.
fun credit_range_collateral_amount(
    proxy: &mut UserProxy,
    key: RangeKey,
    asset: TypeName,
    amount: u64,
    ctx: &mut TxContext,
) {
    let amounts = ensure_range_collateral_table(proxy, key, ctx);
    if (amounts.contains(asset)) {
        let bal = amounts.borrow_mut(asset);
        *bal = *bal + amount;
    } else {
        amounts.add(asset, amount);
    };
    ensure_range_ledger(proxy, key, ctx);
}

/// Decrease binary collateral balance for `asset`; aborts if insufficient.
fun debit_binary_collateral_amount(
    proxy: &mut UserProxy,
    key: MarketKey,
    asset: TypeName,
    amount: u64,
) {
    assert!(proxy.binary_collateral.contains(key), errors::insufficient_collateral());
    let amounts = proxy.binary_collateral.borrow_mut(key);
    assert!(amounts.contains(asset), errors::insufficient_collateral());
    let bal = amounts.borrow_mut(asset);
    assert!(*bal >= amount, errors::insufficient_collateral());
    *bal = *bal - amount;
}

/// Decrease range collateral balance for `asset`; aborts if insufficient.
fun debit_range_collateral_amount(
    proxy: &mut UserProxy,
    key: RangeKey,
    asset: TypeName,
    amount: u64,
) {
    assert!(proxy.range_collateral.contains(key), errors::insufficient_collateral());
    let amounts = proxy.range_collateral.borrow_mut(key);
    assert!(amounts.contains(asset), errors::insufficient_collateral());
    let bal = amounts.borrow_mut(asset);
    assert!(*bal >= amount, errors::insufficient_collateral());
    *bal = *bal - amount;
}

/// Return a mutable binary `PositionLedger`, inserting a zero ledger if absent.
fun ensure_binary_ledger(
    proxy: &mut UserProxy,
    key: MarketKey,
    ctx: &mut TxContext,
): &mut PositionLedger {
    if (!proxy.binary_ledgers.contains(key)) {
        proxy.binary_ledgers.add(key, PositionLedger {
            quote_balance: 0,
            borrowed_quote: 0,
        });
    };
    proxy.binary_ledgers.borrow_mut(key)
}

/// Return a mutable range `PositionLedger`, inserting a zero ledger if absent.
fun ensure_range_ledger(
    proxy: &mut UserProxy,
    key: RangeKey,
    ctx: &mut TxContext,
): &mut PositionLedger {
    if (!proxy.range_ledgers.contains(key)) {
        proxy.range_ledgers.add(key, PositionLedger {
            quote_balance: 0,
            borrowed_quote: 0,
        });
    };
    proxy.range_ledgers.borrow_mut(key)
}

/// Return a mutable collateral table for a binary key, creating it if absent.
fun ensure_binary_collateral_table(
    proxy: &mut UserProxy,
    key: MarketKey,
    ctx: &mut TxContext,
): &mut Table<TypeName, u64> {
    if (!proxy.binary_collateral.contains(key)) {
        proxy.binary_collateral.add(key, table::new(ctx));
    };
    proxy.binary_collateral.borrow_mut(key)
}

/// Return a mutable collateral table for a range key, creating it if absent.
fun ensure_range_collateral_table(
    proxy: &mut UserProxy,
    key: RangeKey,
    ctx: &mut TxContext,
): &mut Table<TypeName, u64> {
    if (!proxy.range_collateral.contains(key)) {
        proxy.range_collateral.add(key, table::new(ctx));
    };
    proxy.range_collateral.borrow_mut(key)
}

// === DeepBook integration ===

/// Generate a DeepBook trade proof for predict-market settlement via this proxy's trade cap.
public(package) fun trade_proof(proxy: &mut UserProxy, ctx: &TxContext): balance_manager::TradeProof {
    proxy.balance_manager.generate_proof_as_trader(&proxy.trade_cap, ctx)
}

/// Mutable access to the balance manager for authorized trading flows.
public(package) fun balance_manager_trading_mut(
    proxy: &mut UserProxy,
    ctx: &TxContext,
): &mut BalanceManager {
    proxy.assert_can_act(ctx);
    &mut proxy.balance_manager
}

// === Triggers ===

/// Set or update take-profit / stop-loss premiums for a binary market key.
public(package) fun set_binary_triggers(
    proxy: &mut UserProxy,
    key: MarketKey,
    take_profit_premium: u64,
    stop_loss_premium: u64,
) {
    if (proxy.binary_triggers.contains(key)) {
        let t = proxy.binary_triggers.borrow_mut(key);
        t.take_profit_premium = take_profit_premium;
        t.stop_loss_premium = stop_loss_premium;
    } else {
        proxy.binary_triggers.add(key, TriggerConfig {
            take_profit_premium,
            stop_loss_premium,
        });
    };
}

/// Remove trigger config for a binary market key.
public(package) fun clear_binary_triggers(proxy: &mut UserProxy, key: MarketKey) {
    assert!(proxy.binary_triggers.contains(key), errors::trigger_not_found());
    proxy.binary_triggers.remove(key);
}

/// Set or update take-profit / stop-loss premiums for a range market key.
public(package) fun set_range_triggers(
    proxy: &mut UserProxy,
    key: RangeKey,
    take_profit_premium: u64,
    stop_loss_premium: u64,
) {
    if (proxy.range_triggers.contains(key)) {
        let t = proxy.range_triggers.borrow_mut(key);
        t.take_profit_premium = take_profit_premium;
        t.stop_loss_premium = stop_loss_premium;
    } else {
        proxy.range_triggers.add(key, TriggerConfig {
            take_profit_premium,
            stop_loss_premium,
        });
    };
}

/// Remove trigger config for a range market key.
public(package) fun clear_range_triggers(proxy: &mut UserProxy, key: RangeKey) {
    assert!(proxy.range_triggers.contains(key), errors::trigger_not_found());
    proxy.range_triggers.remove(key);
}

// === Limit mint orders ===

/// Return the resting limit mint order for a binary key, if any.
public fun get_binary_limit_mint(proxy: &UserProxy, key: MarketKey): Option<PendingLimitMintOrder> {
    if (proxy.binary_limit_mints.contains(key)) {
        option::some(*proxy.binary_limit_mints.borrow(key))
    } else {
        option::none()
    }
}

/// Return the resting limit mint order for a range key, if any.
public fun get_range_limit_mint(proxy: &UserProxy, key: RangeKey): Option<PendingLimitMintOrder> {
    if (proxy.range_limit_mints.contains(key)) {
        option::some(*proxy.range_limit_mints.borrow(key))
    } else {
        option::none()
    }
}

/// Store a new resting limit mint order for a binary key (one per key).
public(package) fun place_binary_limit_mint(
    proxy: &mut UserProxy,
    key: MarketKey,
    order: PendingLimitMintOrder,
) {
    assert!(!proxy.binary_limit_mints.contains(key), errors::limit_order_exists());
    proxy.binary_limit_mints.add(key, order);
}

/// Store a new resting limit mint order for a range key (one per key).
public(package) fun place_range_limit_mint(
    proxy: &mut UserProxy,
    key: RangeKey,
    order: PendingLimitMintOrder,
) {
    assert!(!proxy.range_limit_mints.contains(key), errors::limit_order_exists());
    proxy.range_limit_mints.add(key, order);
}

/// Remove and return a binary limit mint order (keeper fill path).
public(package) fun take_binary_limit_mint(
    proxy: &mut UserProxy,
    key: MarketKey,
): PendingLimitMintOrder {
    assert!(proxy.binary_limit_mints.contains(key), errors::limit_order_not_found());
    proxy.binary_limit_mints.remove(key)
}

/// Remove and return a range limit mint order (keeper fill path).
public(package) fun take_range_limit_mint(
    proxy: &mut UserProxy,
    key: RangeKey,
): PendingLimitMintOrder {
    assert!(proxy.range_limit_mints.contains(key), errors::limit_order_not_found());
    proxy.range_limit_mints.remove(key)
}

/// Remove and return a binary limit mint order (user cancel path).
public(package) fun cancel_binary_limit_mint(
    proxy: &mut UserProxy,
    key: MarketKey,
): PendingLimitMintOrder {
    assert!(proxy.binary_limit_mints.contains(key), errors::limit_order_not_found());
    proxy.binary_limit_mints.remove(key)
}

/// Remove and return a range limit mint order (user cancel path).
public(package) fun cancel_range_limit_mint(
    proxy: &mut UserProxy,
    key: RangeKey,
): PendingLimitMintOrder {
    assert!(proxy.range_limit_mints.contains(key), errors::limit_order_not_found());
    proxy.range_limit_mints.remove(key)
}

/// Cancel a resting binary limit order and release reserved margin (liquidation prep).
public(package) fun cancel_binary_limit_mint_for_liquidation(
    proxy: &mut UserProxy,
    key: MarketKey,
    ctx: &mut TxContext,
) {
    if (proxy.binary_limit_mints.contains(key)) {
        let order = proxy.cancel_binary_limit_mint(key);
        release_binary_quote_reserve(
            proxy,
            key,
            margin_quote(&order),
            ctx,
        );
    };
}

/// Cancel a resting range limit order and release reserved margin (liquidation prep).
public(package) fun cancel_range_limit_mint_for_liquidation(
    proxy: &mut UserProxy,
    key: RangeKey,
    ctx: &mut TxContext,
) {
    if (proxy.range_limit_mints.contains(key)) {
        let order = proxy.cancel_range_limit_mint(key);
        release_range_quote_reserve(
            proxy,
            key,
            margin_quote(&order),
            ctx,
        );
    };
}

// === PendingLimitMintOrder getters ===

/// Return the limit premium per unit stored on the order.
public fun limit_premium_per_unit(order: &PendingLimitMintOrder): u64 {
    order.limit_premium_per_unit
}

/// Return slippage tolerance in basis points.
public fun slippage_bps(order: &PendingLimitMintOrder): u64 {
    order.slippage_bps
}

/// Return the market ask premium at order placement.
public fun market_ask_at_place(order: &PendingLimitMintOrder): u64 {
    order.market_ask_at_place
}

/// Return locked quote margin for the order.
public fun margin_quote(order: &PendingLimitMintOrder): u64 {
    order.margin_quote
}

/// Return desired leverage in basis points.
public fun leverage_bps(order: &PendingLimitMintOrder): u64 {
    order.leverage_bps
}

/// Return outcome units to mint on fill.
public fun quantity(order: &PendingLimitMintOrder): u64 {
    order.quantity
}

/// Return expiry timestamp in milliseconds.
public fun expires_ms(order: &PendingLimitMintOrder): u64 {
    order.expires_ms
}

/// Abort if the binary limit mint order is past its expiry.
public(package) fun assert_binary_limit_mint_not_expired(
    proxy: &UserProxy,
    key: MarketKey,
    clock: &Clock,
) {
    assert!(proxy.binary_limit_mints.contains(key), errors::limit_order_not_found());
    let order = proxy.binary_limit_mints.borrow(key);
    assert!(clock.timestamp_ms() <= order.expires_ms, errors::limit_order_expired());
}

/// Abort if the range limit mint order is past its expiry.
public(package) fun assert_range_limit_mint_not_expired(
    proxy: &UserProxy,
    key: RangeKey,
    clock: &Clock,
) {
    assert!(proxy.range_limit_mints.contains(key), errors::limit_order_not_found());
    let order = proxy.range_limit_mints.borrow(key);
    assert!(clock.timestamp_ms() <= order.expires_ms, errors::limit_order_expired());
}

/// Construct a `PendingLimitMintOrder` value (protocol placement helper).
public(package) fun new_pending_limit_mint_order(
    limit_premium_per_unit: u64,
    slippage_bps: u64,
    market_ask_at_place: u64,
    margin_quote: u64,
    leverage_bps: u64,
    quantity: u64,
    expires_ms: u64,
    placed_at_ms: u64,
    placed_by: address,
): PendingLimitMintOrder {
    PendingLimitMintOrder {
        limit_premium_per_unit,
        slippage_bps,
        market_ask_at_place,
        margin_quote,
        leverage_bps,
        quantity,
        expires_ms,
        placed_at_ms,
        placed_by,
    }
}

// === Access control ===

/// Abort unless `ctx.sender()` is the proxy owner.
public(package) fun assert_owner(proxy: &UserProxy, ctx: &TxContext) {
    assert!(ctx.sender() == proxy.owner, errors::not_owner());
}

/// Abort unless sender is the owner or a registered executor.
public(package) fun assert_can_act(proxy: &UserProxy, ctx: &TxContext) {
    assert!(
        ctx.sender() == proxy.owner || proxy.executors.contains(&ctx.sender()),
        errors::not_authorized(),
    );
}

// === Test helpers ===

/// Build an in-memory proxy without DeepBook registry wiring (unit tests only).
#[test_only]
public fun create_for_testing(
    owner: address,
    predict_manager_id: ID,
    ctx: &mut TxContext,
): UserProxy {
    let id = object::new(ctx);
    let mut balance_manager = balance_manager::new(ctx);
    let deposit_cap = balance_manager.mint_deposit_cap(ctx);
    let withdraw_cap = balance_manager.mint_withdraw_cap(ctx);
    let trade_cap = balance_manager.mint_trade_cap(ctx);

    UserProxy {
        id,
        owner,
        predict_manager_id,
        borrowed_quote: 0,
        balance_manager,
        deposit_cap,
        withdraw_cap,
        trade_cap,
        executors: vec_set::empty(),
        binary_ledgers: table::new(ctx),
        range_ledgers: table::new(ctx),
        binary_collateral: table::new(ctx),
        range_collateral: table::new(ctx),
        binary_triggers: table::new(ctx),
        range_triggers: table::new(ctx),
        binary_limit_mints: table::new(ctx),
        range_limit_mints: table::new(ctx),
    }
}

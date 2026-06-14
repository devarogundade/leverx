// Copyright (c) LeverX contributors
// SPDX-License-Identifier: Apache-2.0

/// On-chain event surface for indexers, analytics, and the LeverX frontend.
module leverx::events;

use sui::event;

// === Protocol / governance ===

/// Emitted once when the LeverX protocol package is deployed.
public struct ProtocolDeployed has copy, drop {
    /// `LeverxRegistry` object ID.
    registry_id: ID,
    /// Shared `LeverageVault` object ID.
    vault_id: ID,
    /// DeepBook Predict global object ID.
    predict_id: ID,
    /// Shared `FeeCollector` object ID.
    fee_collector_id: ID,
    /// Deployer address.
    deployer: address,
}

/// Emitted when registry wiring to vault and Predict is finalized.
public struct RegistryInitialized has copy, drop {
    /// `LeverxRegistry` object ID.
    registry_id: ID,
    /// Shared `LeverageVault` object ID.
    vault_id: ID,
    /// Shared `FeeCollector` object ID.
    fee_collector_id: ID,
    /// DeepBook Predict global object ID.
    predict_id: ID,
    /// Initial liquidation health threshold in basis points.
    liquidation_bps: u64,
}

/// Emitted when admin updates the liquidation health threshold.
public struct LiquidationBpsUpdated has copy, drop {
    /// `LeverxRegistry` object ID.
    registry_id: ID,
    /// New liquidation threshold in basis points.
    liquidation_bps: u64,
}

/// Emitted when global trading pause state changes.
public struct TradingPausedChanged has copy, drop {
    /// `LeverxRegistry` object ID.
    registry_id: ID,
    /// `true` when new trades are blocked.
    paused: bool,
}

/// Emitted when vault borrow-rate curve parameters change.
public struct BorrowRateParamsUpdated has copy, drop {
    /// `LeverageVault` object ID.
    vault_id: ID,
    /// Base borrow rate at zero utilization, in basis points.
    base_rate_bps: u64,
    /// Utilization kink point in basis points.
    kink_utilization_bps: u64,
    /// Rate slope below kink, in basis points.
    slope1_bps: u64,
    /// Rate slope above kink, in basis points.
    slope2_bps: u64,
    /// Flash-loan fee in basis points.
    flash_fee_bps: u64,
}

// === Vault / LP ===

/// Emitted when an LP supplies quote liquidity to the vault.
public struct VaultSupplied has copy, drop {
    /// `LeverageVault` object ID.
    vault_id: ID,
    /// LP supplier address.
    supplier: address,
    /// Quote atoms deposited.
    amount: u64,
    /// LP shares minted.
    shares_minted: u64,
    /// Vault net asset value in quote atoms after supply.
    nav: u64,
    /// Vault utilization in basis points after supply.
    utilization_bps: u64,
    /// Total outstanding borrows in quote atoms after supply.
    total_borrowed: u64,
    /// Current borrow APR in basis points (kinked utilization curve).
    borrow_rate_bps: u64,
    /// Current LP supply APR in basis points (`borrow_rate ├ù utilization ├ù vault share`).
    lp_apr_bps: u64,
}

/// Emitted when an LP withdraws quote liquidity from the vault.
public struct VaultWithdrawn has copy, drop {
    /// `LeverageVault` object ID.
    vault_id: ID,
    /// LP withdrawer address.
    withdrawer: address,
    /// Quote atoms withdrawn.
    amount: u64,
    /// LP shares burned.
    shares_burned: u64,
    /// Vault net asset value in quote atoms after withdrawal.
    nav: u64,
    /// Vault utilization in basis points after withdrawal.
    utilization_bps: u64,
    /// Total outstanding borrows in quote atoms after withdrawal.
    total_borrowed: u64,
    /// Current borrow APR in basis points (kinked utilization curve).
    borrow_rate_bps: u64,
    /// Current LP supply APR in basis points.
    lp_apr_bps: u64,
}

/// Emitted when quote is borrowed from the vault (e.g. leveraged mint).
public struct VaultBorrowed has copy, drop {
    /// `LeverageVault` object ID.
    vault_id: ID,
    /// Borrowing `UserProxy` object ID.
    account_id: ID,
    /// Proxy owner address.
    owner: address,
    /// Quote atoms borrowed in this transaction.
    amount: u64,
    /// Total outstanding borrows in quote atoms after borrow.
    total_borrowed: u64,
    /// Vault utilization in basis points after borrow.
    utilization_bps: u64,
    /// Current borrow APR in basis points (kinked utilization curve).
    borrow_rate_bps: u64,
    /// Current LP supply APR in basis points.
    lp_apr_bps: u64,
}

/// Emitted when quote debt is repaid to the vault.
public struct VaultRepaid has copy, drop {
    /// `LeverageVault` object ID.
    vault_id: ID,
    /// Repaying `UserProxy` object ID.
    account_id: ID,
    /// Proxy owner address.
    owner: address,
    /// Quote atoms repaid in this transaction.
    amount: u64,
    /// Total outstanding borrows in quote atoms after repay.
    total_borrowed: u64,
    /// Vault utilization in basis points after repay.
    utilization_bps: u64,
    /// Current borrow APR in basis points (kinked utilization curve).
    borrow_rate_bps: u64,
    /// Current LP supply APR in basis points.
    lp_apr_bps: u64,
}

/// Emitted when vault interest is accrued to total borrows.
public struct InterestAccrued has copy, drop {
    /// `LeverageVault` object ID.
    vault_id: ID,
    /// Interest added to borrows in quote atoms.
    interest_added: u64,
    /// Total outstanding borrows in quote atoms after accrual.
    total_borrowed: u64,
    /// Current borrow APR in basis points (kinked utilization curve).
    borrow_rate_bps: u64,
    /// Current LP supply APR in basis points.
    lp_apr_bps: u64,
    /// Vault net asset value in quote atoms after accrual.
    nav: u64,
    /// Vault utilization in basis points after accrual.
    utilization_bps: u64,
}

/// Emitted when a flash loan is drawn from the vault.
public struct FlashLoanBorrowed has copy, drop {
    /// `LeverageVault` object ID.
    vault_id: ID,
    /// Flash borrower address (often a keeper).
    borrower: address,
    /// Principal borrowed in quote atoms.
    amount: u64,
    /// Flash fee charged in quote atoms.
    fee: u64,
}

/// Emitted when a flash loan principal and fee are returned.
public struct FlashLoanRepaid has copy, drop {
    /// `LeverageVault` object ID.
    vault_id: ID,
    /// Principal repaid in quote atoms.
    amount: u64,
    /// Flash fee paid in quote atoms.
    fee: u64,
}

/// Emitted when protocol fee revenue is split 80% vault / 10% collector / 10% keeper.
public struct ProtocolFeeDistributed has copy, drop {
    /// `LeverageVault` object ID.
    vault_id: ID,
    /// `FeeCollector` object ID.
    fee_collector_id: ID,
    /// Total fee amount split in quote atoms.
    total_amount: u64,
    /// Vault (LP) share in quote atoms.
    vault_amount: u64,
    /// Protocol treasury share in quote atoms.
    collector_amount: u64,
    /// Keeper / caller share in quote atoms.
    keeper_amount: u64,
    /// Address that received the keeper share (`ctx.sender()`).
    keeper: address,
    /// Fee source tag (`protocol_constants::fee_source_*`).
    fee_source: u8,
}

/// Emitted when admin withdraws accumulated fees from `FeeCollector`.
public struct FeeCollectorWithdrawn has copy, drop {
    /// `FeeCollector` object ID.
    fee_collector_id: ID,
    /// Admin recipient address.
    recipient: address,
    /// Amount withdrawn in quote atoms.
    amount: u64,
    /// Collector balance after withdrawal.
    balance_after: u64,
}

/// Emitted when surplus quote is skimmed to the vault insurance fund.
public struct InsuranceFundSkimmed has copy, drop {
    /// `LeverageVault` object ID.
    vault_id: ID,
    /// Source `UserProxy` object ID.
    account_id: ID,
    /// Skimmed amount in quote atoms.
    amount: u64,
    /// Skim source code (e.g. liquidation).
    source: u8,
}

// === User proxy ===

/// Emitted when a new `UserProxy` is created.
public struct AccountCreated has copy, drop {
    /// `UserProxy` object ID.
    account_id: ID,
    /// Proxy owner address.
    owner: address,
    /// Linked DeepBook Predict `PredictManager` object ID.
    predict_manager_id: ID,
}

/// Emitted when a proxy is linked to a different Predict manager.
public struct PredictManagerLinked has copy, drop {
    /// `UserProxy` object ID.
    account_id: ID,
    /// Proxy owner address.
    owner: address,
    /// New `PredictManager` object ID.
    predict_manager_id: ID,
}

/// Emitted when vault debt is recorded on the proxy (proxy-wide aggregate).
public struct DebtBorrowed has copy, drop {
    /// `UserProxy` object ID.
    account_id: ID,
    /// Proxy owner address.
    owner: address,
    /// Quote atoms borrowed in this transaction.
    amount: u64,
    /// Total proxy-wide borrowed quote after borrow, in quote atoms.
    borrowed_quote_after: u64,
}

/// Emitted when vault debt is reduced on the proxy (proxy-wide aggregate).
public struct DebtRepaid has copy, drop {
    /// `UserProxy` object ID.
    account_id: ID,
    /// Proxy owner address.
    owner: address,
    /// Quote atoms repaid in this transaction.
    amount: u64,
    /// Remaining proxy-wide borrowed quote, in quote atoms.
    remaining_debt: u64,
}

/// Emitted when proxy-wide borrowed quote is snapshotted for indexers.
public struct ProxyAccountingSynced has copy, drop {
    /// `UserProxy` object ID.
    account_id: ID,
    /// Total proxy-wide borrowed quote, in quote atoms.
    borrowed_quote: u64,
}

/// Emitted when per-market-key vault debt changes (deleverage / partial repay).
public struct KeyBorrowUpdated has copy, drop {
    /// `UserProxy` object ID.
    account_id: ID,
    /// Proxy owner address.
    owner: address,
    /// DeepBook Predict oracle object ID.
    oracle_id: ID,
    /// Contract expiry timestamp in milliseconds.
    expiry_ms: u64,
    /// Lower/or sole strike in 1e9 USD scale.
    strike: u64,
    /// Upper strike in 1e9 USD scale (`0` for binary positions).
    higher_strike: u64,
    /// `true` for up/out binary; ignored for range.
    is_up: bool,
    /// `true` for range positions; `false` for binary.
    is_range: bool,
    /// Remaining key borrowed quote in quote atoms.
    key_borrowed_quote: u64,
    /// Posted margin for health checks on this key (quote atoms).
    key_margin_debt: u64,
    /// Current leverage in basis points (`10_000` = 1×).
    leverage_bps: u64,
}

// === Leveraged positions ===

/// Emitted when a leveraged Predict position is opened (mint fill).
public struct LeveragedPositionOpened has copy, drop {
    /// `UserProxy` object ID.
    account_id: ID,
    /// Proxy owner address.
    owner: address,
    /// Linked `PredictManager` object ID.
    predict_manager_id: ID,
    /// DeepBook Predict oracle object ID.
    oracle_id: ID,
    /// Contract expiry timestamp in milliseconds.
    expiry_ms: u64,
    /// Lower/or sole strike in 1e9 USD scale (`0` for range lower bound field reuse).
    strike: u64,
    /// Upper strike in 1e9 USD scale (`0` for binary positions).
    higher_strike: u64,
    /// `true` for up/out binary; ignored for range.
    is_up: bool,
    /// `true` for range positions; `false` for binary.
    is_range: bool,
    /// Contracts minted.
    quantity: u64,
    /// User margin contributed in quote atoms.
    margin_quote: u64,
    /// Quote borrowed from vault in quote atoms.
    borrow_quote: u64,
    /// Target leverage in basis points (10_000 = 1x).
    leverage_bps: u64,
    /// Total mint cost paid in quote atoms.
    mint_cost: u64,
    /// Proxy-wide borrowed quote after mint, in quote atoms.
    borrowed_quote_after: u64,
    /// `protocol_constants::order_type_market()` or `order_type_limit()`.
    order_type: u8,
    /// 1e9-scaled premium per contract (limit orders only).
    limit_premium_per_unit: u64,
    /// 1e9-scaled oracle ask per unit at fill time.
    market_ask_at_fill: u64,
    /// Max total mint cost allowed by user in quote atoms (market orders only).
    max_mint_cost: u64,
}

/// Emitted when a leveraged Predict position is closed (redeem or settlement).
public struct LeveragedPositionClosed has copy, drop {
    /// `UserProxy` object ID.
    account_id: ID,
    /// Proxy owner address.
    owner: address,
    /// Linked `PredictManager` object ID.
    predict_manager_id: ID,
    /// DeepBook Predict oracle object ID.
    oracle_id: ID,
    /// Contract expiry timestamp in milliseconds.
    expiry_ms: u64,
    /// Lower/or sole strike in 1e9 USD scale.
    strike: u64,
    /// Upper strike in 1e9 USD scale (`0` for binary positions).
    higher_strike: u64,
    /// `true` for up/out binary; ignored for range.
    is_up: bool,
    /// `true` for range positions; `false` for binary.
    is_range: bool,
    /// Contracts redeemed.
    quantity: u64,
    /// Gross payout from Predict in quote atoms.
    payout: u64,
    /// Key debt repaid to vault in quote atoms.
    debt_repaid: u64,
    /// Surplus quote credited to market key after debt repay, in quote atoms.
    surplus_quote: u64,
    /// Remaining key debt in quote atoms after close.
    remaining_debt: u64,
    /// `true` when closed via post-expiry oracle settlement.
    is_settled: bool,
}

// === Liquidation ===

/// Emitted when a keeper force-deleverages a leveraged key in the final hour before expiry.
public struct PositionForceDeleveraged has copy, drop {
    account_id: ID,
    owner: address,
    predict_manager_id: ID,
    oracle_id: ID,
    expiry_ms: u64,
    strike: u64,
    higher_strike: u64,
    is_up: bool,
    is_range: bool,
    /// Contracts redeemed from the leveraged position.
    redeemed_quantity: u64,
    /// Gross payout from the redeem leg.
    payout: u64,
    /// Contracts reminted at 1x (0 if surplus was too small).
    reminted_quantity: u64,
    /// Keeper that submitted the transaction.
    keeper: address,
}

/// Emitted when residual vault debt is written off after oracle settlement.
public struct BadDebtWrittenOff has copy, drop {
    account_id: ID,
    owner: address,
    oracle_id: ID,
    expiry_ms: u64,
    strike: u64,
    higher_strike: u64,
    is_up: bool,
    is_range: bool,
    /// Quote covered from the insurance fund before socialization.
    insurance_covered: u64,
    /// Remaining debt socialized to LPs (vault `total_borrowed` reduced).
    socialized: u64,
    keeper: address,
}

/// Emitted when a keeper liquidates an undercollateralized market key.
public struct PositionLiquidated has copy, drop {
    /// `UserProxy` object ID.
    account_id: ID,
    /// Proxy owner address.
    owner: address,
    /// Liquidating keeper address.
    keeper: address,
    /// DeepBook Predict oracle object ID.
    oracle_id: ID,
    /// Contract expiry timestamp in milliseconds.
    expiry_ms: u64,
    /// Lower/or sole strike in 1e9 USD scale.
    strike: u64,
    /// Upper strike in 1e9 USD scale (`0` for binary positions).
    higher_strike: u64,
    /// `true` for up/out binary; ignored for range.
    is_up: bool,
    /// `true` for range positions; `false` for binary.
    is_range: bool,
    /// Key debt repaid to vault in quote atoms.
    debt_repaid: u64,
    /// Surplus quote after debt repay, in quote atoms.
    surplus_quote: u64,
    /// Account health (LTV) in basis points at liquidation.
    health_bps: u64,
    /// `true` when liquidation also redeemed an open Predict position.
    had_position_redeem: bool,
}

// === Triggers / executors ===

/// Emitted when take-profit / stop-loss triggers are set on a market key.
public struct TriggersUpdated has copy, drop {
    /// `UserProxy` object ID.
    account_id: ID,
    /// DeepBook Predict oracle object ID.
    oracle_id: ID,
    /// `true` for range triggers; `false` for binary.
    is_range: bool,
    /// Take-profit premium in 1e9 scale (`0` to disable).
    take_profit_premium: u64,
    /// Stop-loss premium in 1e9 scale (`0` to disable).
    stop_loss_premium: u64,
    /// Redeem slippage bps when take-profit fires.
    take_profit_slippage_bps: u64,
    /// Redeem slippage bps when stop-loss fires.
    stop_loss_slippage_bps: u64,
}

/// Emitted when take-profit / stop-loss triggers are cleared.
public struct TriggersCleared has copy, drop {
    /// `UserProxy` object ID.
    account_id: ID,
    /// DeepBook Predict oracle object ID.
    oracle_id: ID,
    /// `true` for range triggers; `false` for binary.
    is_range: bool,
}

/// Emitted when a session executor is registered on a proxy.
public struct ExecutorRegistered has copy, drop {
    /// `UserProxy` object ID.
    account_id: ID,
    /// Granted executor address.
    executor: address,
}

/// Emitted when a session executor is revoked from a proxy.
public struct ExecutorRevoked has copy, drop {
    /// `UserProxy` object ID.
    account_id: ID,
    /// Revoked executor address.
    executor: address,
}

// === Resting limit mint orders ===

/// Emitted when a resting leveraged mint limit order is placed.
public struct LimitMintOrderPlaced has copy, drop {
    /// `UserProxy` object ID.
    account_id: ID,
    /// Proxy owner address.
    owner: address,
    /// DeepBook Predict oracle object ID.
    oracle_id: ID,
    /// Contract expiry timestamp in milliseconds.
    expiry_ms: u64,
    /// Lower/or sole strike in 1e9 USD scale.
    strike: u64,
    /// Upper strike in 1e9 USD scale (`0` for binary positions).
    higher_strike: u64,
    /// `true` for range orders; `false` for binary.
    is_range: bool,
    /// `true` for up/out binary; ignored for range.
    is_up: bool,
    /// Limit premium per unit in 1e9 scale.
    limit_premium_per_unit: u64,
    /// Placement slippage tolerance in basis points (frozen at fill).
    slippage_bps: u64,
    /// 1e9-scaled oracle ask per unit at placement time.
    market_ask_at_place: u64,
    /// Reserved margin in quote atoms.
    margin_quote: u64,
    /// Target leverage in basis points.
    leverage_bps: u64,
    /// Contracts to mint on fill.
    quantity: u64,
    /// Resting order expiry timestamp in milliseconds.
    order_expires_ms: u64,
    /// Address that placed the order (owner or executor).
    placed_by: address,
}

/// Emitted when a resting leveraged mint limit order is filled.
public struct LimitMintOrderExecuted has copy, drop {
    /// `UserProxy` object ID.
    account_id: ID,
    /// Proxy owner address.
    owner: address,
    /// Filling executor/keeper address.
    executor: address,
    /// DeepBook Predict oracle object ID.
    oracle_id: ID,
    /// Contract expiry timestamp in milliseconds.
    expiry_ms: u64,
    /// Lower/or sole strike in 1e9 USD scale.
    strike: u64,
    /// Upper strike in 1e9 USD scale (`0` for binary positions).
    higher_strike: u64,
    /// `true` for range orders; `false` for binary.
    is_range: bool,
    /// `true` for up/out binary; ignored for range.
    is_up: bool,
    /// Limit premium per unit in 1e9 scale.
    limit_premium_per_unit: u64,
    /// Placement slippage tolerance in basis points.
    slippage_bps: u64,
    /// 1e9-scaled oracle ask per unit at fill time.
    market_ask_at_fill: u64,
    /// Total mint cost paid in quote atoms.
    mint_cost: u64,
    /// Contracts minted.
    quantity: u64,
    /// Original resting order expiry timestamp in milliseconds.
    order_expires_ms: u64,
}

/// Emitted when a resting leveraged mint limit order is cancelled.
public struct LimitMintOrderCancelled has copy, drop {
    /// `UserProxy` object ID.
    account_id: ID,
    /// Proxy owner address.
    owner: address,
    /// DeepBook Predict oracle object ID.
    oracle_id: ID,
    /// Contract expiry timestamp in milliseconds.
    expiry_ms: u64,
    /// Lower/or sole strike in 1e9 USD scale.
    strike: u64,
    /// Upper strike in 1e9 USD scale (`0` for binary positions).
    higher_strike: u64,
    /// `true` for range orders; `false` for binary.
    is_range: bool,
    /// `true` for up/out binary; ignored for range.
    is_up: bool,
    /// Cancelled order expiry timestamp in milliseconds.
    order_expires_ms: u64,
    /// Address that cancelled the order (owner or executor).
    cancelled_by: address,
}

// === Emitters ===

const LIQUIDATION_SKIM_SOURCE: u8 = 1;

/// Insurance-fund skim source code for liquidation surplus.
public(package) fun liquidation_skim_source(): u8 {
    LIQUIDATION_SKIM_SOURCE
}

/// Emit `ProtocolDeployed`.
public(package) fun emit_protocol_deployed(
    registry_id: ID,
    vault_id: ID,
    fee_collector_id: ID,
    predict_id: ID,
    deployer: address,
) {
    event::emit(ProtocolDeployed {
        registry_id,
        vault_id,
        fee_collector_id,
        predict_id,
        deployer,
    });
}

/// Emit `RegistryInitialized`.
public(package) fun emit_registry_initialized(
    registry_id: ID,
    vault_id: ID,
    fee_collector_id: ID,
    predict_id: ID,
    liquidation_bps: u64,
) {
    event::emit(RegistryInitialized {
        registry_id,
        vault_id,
        fee_collector_id,
        predict_id,
        liquidation_bps,
    });
}

/// Emit `LiquidationBpsUpdated`.
public(package) fun emit_liquidation_bps_updated(registry_id: ID, liquidation_bps: u64) {
    event::emit(LiquidationBpsUpdated {
        registry_id,
        liquidation_bps,
    });
}

/// Emit `TradingPausedChanged`.
public(package) fun emit_trading_paused_changed(registry_id: ID, paused: bool) {
    event::emit(TradingPausedChanged { registry_id, paused });
}

/// Emit `BorrowRateParamsUpdated`.
public(package) fun emit_borrow_rate_params_updated(
    vault_id: ID,
    base_rate_bps: u64,
    kink_utilization_bps: u64,
    slope1_bps: u64,
    slope2_bps: u64,
    flash_fee_bps: u64,
) {
    event::emit(BorrowRateParamsUpdated {
        vault_id,
        base_rate_bps,
        kink_utilization_bps,
        slope1_bps,
        slope2_bps,
        flash_fee_bps,
    });
}

/// Emit `VaultSupplied`.
public(package) fun emit_vault_supplied(
    vault_id: ID,
    supplier: address,
    amount: u64,
    shares_minted: u64,
    nav: u64,
    utilization_bps: u64,
    total_borrowed: u64,
    borrow_rate_bps: u64,
    lp_apr_bps: u64,
) {
    event::emit(VaultSupplied {
        vault_id,
        supplier,
        amount,
        shares_minted,
        nav,
        utilization_bps,
        total_borrowed,
        borrow_rate_bps,
        lp_apr_bps,
    });
}

/// Emit `VaultWithdrawn`.
public(package) fun emit_vault_withdrawn(
    vault_id: ID,
    withdrawer: address,
    amount: u64,
    shares_burned: u64,
    nav: u64,
    utilization_bps: u64,
    total_borrowed: u64,
    borrow_rate_bps: u64,
    lp_apr_bps: u64,
) {
    event::emit(VaultWithdrawn {
        vault_id,
        withdrawer,
        amount,
        shares_burned,
        nav,
        utilization_bps,
        total_borrowed,
        borrow_rate_bps,
        lp_apr_bps,
    });
}

/// Emit `VaultBorrowed`.
public(package) fun emit_vault_borrowed(
    vault_id: ID,
    account_id: ID,
    owner: address,
    amount: u64,
    total_borrowed: u64,
    utilization_bps: u64,
    borrow_rate_bps: u64,
    lp_apr_bps: u64,
) {
    event::emit(VaultBorrowed {
        vault_id,
        account_id,
        owner,
        amount,
        total_borrowed,
        utilization_bps,
        borrow_rate_bps,
        lp_apr_bps,
    });
}

/// Emit `VaultRepaid`.
public(package) fun emit_vault_repaid(
    vault_id: ID,
    account_id: ID,
    owner: address,
    amount: u64,
    total_borrowed: u64,
    utilization_bps: u64,
    borrow_rate_bps: u64,
    lp_apr_bps: u64,
) {
    event::emit(VaultRepaid {
        vault_id,
        account_id,
        owner,
        amount,
        total_borrowed,
        utilization_bps,
        borrow_rate_bps,
        lp_apr_bps,
    });
}

/// Emit `AccountCreated`.
public(package) fun emit_account_created(account_id: ID, owner: address, predict_manager_id: ID) {
    event::emit(AccountCreated { account_id, owner, predict_manager_id });
}

/// Emit `PredictManagerLinked`.
public(package) fun emit_predict_manager_linked(
    account_id: ID,
    owner: address,
    predict_manager_id: ID,
) {
    event::emit(PredictManagerLinked { account_id, owner, predict_manager_id });
}

/// Emit `DebtBorrowed`.
public(package) fun emit_debt_borrowed(
    account_id: ID,
    owner: address,
    amount: u64,
    borrowed_quote_after: u64,
) {
    event::emit(DebtBorrowed { account_id, owner, amount, borrowed_quote_after });
}

/// Emit `DebtRepaid`.
public(package) fun emit_debt_repaid(account_id: ID, owner: address, amount: u64, remaining_debt: u64) {
    event::emit(DebtRepaid { account_id, owner, amount, remaining_debt });
}

/// Emit `ProxyAccountingSynced`.
public(package) fun emit_proxy_accounting_synced(account_id: ID, borrowed_quote: u64) {
    event::emit(ProxyAccountingSynced { account_id, borrowed_quote });
}

/// Emit `KeyBorrowUpdated`.
public(package) fun emit_key_borrow_updated(
    account_id: ID,
    owner: address,
    oracle_id: ID,
    expiry_ms: u64,
    strike: u64,
    higher_strike: u64,
    is_up: bool,
    is_range: bool,
    key_borrowed_quote: u64,
    key_margin_debt: u64,
    leverage_bps: u64,
) {
    event::emit(KeyBorrowUpdated {
        account_id,
        owner,
        oracle_id,
        expiry_ms,
        strike,
        higher_strike,
        is_up,
        is_range,
        key_borrowed_quote,
        key_margin_debt,
        leverage_bps,
    });
}

/// Emit `LeveragedPositionOpened`.
public(package) fun emit_leveraged_position_opened(
    account_id: ID,
    owner: address,
    predict_manager_id: ID,
    oracle_id: ID,
    expiry_ms: u64,
    strike: u64,
    higher_strike: u64,
    is_up: bool,
    is_range: bool,
    quantity: u64,
    margin_quote: u64,
    borrow_quote: u64,
    leverage_bps: u64,
    mint_cost: u64,
    borrowed_quote_after: u64,
    order_type: u8,
    limit_premium_per_unit: u64,
    market_ask_at_fill: u64,
    max_mint_cost: u64,
) {
    event::emit(LeveragedPositionOpened {
        account_id,
        owner,
        predict_manager_id,
        oracle_id,
        expiry_ms,
        strike,
        higher_strike,
        is_up,
        is_range,
        quantity,
        margin_quote,
        borrow_quote,
        leverage_bps,
        mint_cost,
        borrowed_quote_after,
        order_type,
        limit_premium_per_unit,
        market_ask_at_fill,
        max_mint_cost,
    });
}

/// Emit `LeveragedPositionClosed`.
public(package) fun emit_leveraged_position_closed(
    account_id: ID,
    owner: address,
    predict_manager_id: ID,
    oracle_id: ID,
    expiry_ms: u64,
    strike: u64,
    higher_strike: u64,
    is_up: bool,
    is_range: bool,
    quantity: u64,
    payout: u64,
    debt_repaid: u64,
    surplus_quote: u64,
    remaining_debt: u64,
    is_settled: bool,
) {
    event::emit(LeveragedPositionClosed {
        account_id,
        owner,
        predict_manager_id,
        oracle_id,
        expiry_ms,
        strike,
        higher_strike,
        is_up,
        is_range,
        quantity,
        payout,
        debt_repaid,
        surplus_quote,
        remaining_debt,
        is_settled,
    });
}

/// Emit `BadDebtWrittenOff`.
public(package) fun emit_bad_debt_written_off(
    account_id: ID,
    owner: address,
    oracle_id: ID,
    expiry_ms: u64,
    strike: u64,
    higher_strike: u64,
    is_up: bool,
    is_range: bool,
    insurance_covered: u64,
    socialized: u64,
    keeper: address,
) {
    event::emit(BadDebtWrittenOff {
        account_id,
        owner,
        oracle_id,
        expiry_ms,
        strike,
        higher_strike,
        is_up,
        is_range,
        insurance_covered,
        socialized,
        keeper,
    });
}

/// Emit `PositionForceDeleveraged`.
public(package) fun emit_position_force_deleveraged(
    account_id: ID,
    owner: address,
    predict_manager_id: ID,
    oracle_id: ID,
    expiry_ms: u64,
    strike: u64,
    higher_strike: u64,
    is_up: bool,
    is_range: bool,
    redeemed_quantity: u64,
    payout: u64,
    reminted_quantity: u64,
    keeper: address,
) {
    event::emit(PositionForceDeleveraged {
        account_id,
        owner,
        predict_manager_id,
        oracle_id,
        expiry_ms,
        strike,
        higher_strike,
        is_up,
        is_range,
        redeemed_quantity,
        payout,
        reminted_quantity,
        keeper,
    });
}

/// Emit `InterestAccrued`.
public(package) fun emit_interest_accrued(
    vault_id: ID,
    interest_added: u64,
    total_borrowed: u64,
    borrow_rate_bps: u64,
    lp_apr_bps: u64,
    nav: u64,
    utilization_bps: u64,
) {
    event::emit(InterestAccrued {
        vault_id,
        interest_added,
        total_borrowed,
        borrow_rate_bps,
        lp_apr_bps,
        nav,
        utilization_bps,
    });
}

/// Emit `FlashLoanBorrowed`.
public(package) fun emit_flash_loan_borrowed(vault_id: ID, borrower: address, amount: u64, fee: u64) {
    event::emit(FlashLoanBorrowed { vault_id, borrower, amount, fee });
}

/// Emit `FlashLoanRepaid`.
public(package) fun emit_flash_loan_repaid(vault_id: ID, amount: u64, fee: u64) {
    event::emit(FlashLoanRepaid { vault_id, amount, fee });
}

/// Emit `ProtocolFeeDistributed`.
public(package) fun emit_protocol_fee_distributed(
    vault_id: ID,
    fee_collector_id: ID,
    total_amount: u64,
    vault_amount: u64,
    collector_amount: u64,
    keeper_amount: u64,
    keeper: address,
    fee_source: u8,
) {
    event::emit(ProtocolFeeDistributed {
        vault_id,
        fee_collector_id,
        total_amount,
        vault_amount,
        collector_amount,
        keeper_amount,
        keeper,
        fee_source,
    });
}

/// Emit `FeeCollectorWithdrawn`.
public(package) fun emit_fee_collector_withdrawn(
    fee_collector_id: ID,
    recipient: address,
    amount: u64,
    balance_after: u64,
) {
    event::emit(FeeCollectorWithdrawn {
        fee_collector_id,
        recipient,
        amount,
        balance_after,
    });
}

/// Emit `InsuranceFundSkimmed`.
public(package) fun emit_insurance_fund_skimmed(
    vault_id: ID,
    account_id: ID,
    amount: u64,
    source: u8,
) {
    event::emit(InsuranceFundSkimmed { vault_id, account_id, amount, source });
}

/// Emit `PositionLiquidated`.
public(package) fun emit_position_liquidated(
    account_id: ID,
    owner: address,
    keeper: address,
    oracle_id: ID,
    expiry_ms: u64,
    strike: u64,
    higher_strike: u64,
    is_up: bool,
    is_range: bool,
    debt_repaid: u64,
    surplus_quote: u64,
    health_bps: u64,
    had_position_redeem: bool,
) {
    event::emit(PositionLiquidated {
        account_id,
        owner,
        keeper,
        oracle_id,
        expiry_ms,
        strike,
        higher_strike,
        is_up,
        is_range,
        debt_repaid,
        surplus_quote,
        health_bps,
        had_position_redeem,
    });
}

/// Emit `TriggersUpdated`.
public(package) fun emit_triggers_updated(
    account_id: ID,
    oracle_id: ID,
    is_range: bool,
    take_profit_premium: u64,
    stop_loss_premium: u64,
    take_profit_slippage_bps: u64,
    stop_loss_slippage_bps: u64,
) {
    event::emit(TriggersUpdated {
        account_id,
        oracle_id,
        is_range,
        take_profit_premium,
        stop_loss_premium,
        take_profit_slippage_bps,
        stop_loss_slippage_bps,
    });
}

/// Emit `TriggersCleared`.
public(package) fun emit_triggers_cleared(account_id: ID, oracle_id: ID, is_range: bool) {
    event::emit(TriggersCleared { account_id, oracle_id, is_range });
}

/// Emit `ExecutorRegistered`.
public(package) fun emit_executor_registered(account_id: ID, executor: address) {
    event::emit(ExecutorRegistered { account_id, executor });
}

/// Emit `ExecutorRevoked`.
public(package) fun emit_executor_revoked(account_id: ID, executor: address) {
    event::emit(ExecutorRevoked { account_id, executor });
}

/// Emit `LimitMintOrderPlaced`.
public(package) fun emit_limit_mint_order_placed(
    account_id: ID,
    owner: address,
    oracle_id: ID,
    expiry_ms: u64,
    strike: u64,
    higher_strike: u64,
    is_range: bool,
    is_up: bool,
    limit_premium_per_unit: u64,
    slippage_bps: u64,
    market_ask_at_place: u64,
    margin_quote: u64,
    leverage_bps: u64,
    quantity: u64,
    order_expires_ms: u64,
    placed_by: address,
) {
    event::emit(LimitMintOrderPlaced {
        account_id,
        owner,
        oracle_id,
        expiry_ms,
        strike,
        higher_strike,
        is_range,
        is_up,
        limit_premium_per_unit,
        slippage_bps,
        market_ask_at_place,
        margin_quote,
        leverage_bps,
        quantity,
        order_expires_ms,
        placed_by,
    });
}

/// Emit `LimitMintOrderExecuted`.
public(package) fun emit_limit_mint_order_executed(
    account_id: ID,
    owner: address,
    executor: address,
    oracle_id: ID,
    expiry_ms: u64,
    strike: u64,
    higher_strike: u64,
    is_range: bool,
    is_up: bool,
    limit_premium_per_unit: u64,
    slippage_bps: u64,
    market_ask_at_fill: u64,
    mint_cost: u64,
    quantity: u64,
    order_expires_ms: u64,
) {
    event::emit(LimitMintOrderExecuted {
        account_id,
        owner,
        executor,
        oracle_id,
        expiry_ms,
        strike,
        higher_strike,
        is_range,
        is_up,
        limit_premium_per_unit,
        slippage_bps,
        market_ask_at_fill,
        mint_cost,
        quantity,
        order_expires_ms,
    });
}

/// Emit `LimitMintOrderCancelled`.
public(package) fun emit_limit_mint_order_cancelled(
    account_id: ID,
    owner: address,
    oracle_id: ID,
    expiry_ms: u64,
    strike: u64,
    higher_strike: u64,
    is_range: bool,
    is_up: bool,
    order_expires_ms: u64,
    cancelled_by: address,
) {
    event::emit(LimitMintOrderCancelled {
        account_id,
        owner,
        oracle_id,
        expiry_ms,
        strike,
        higher_strike,
        is_range,
        is_up,
        order_expires_ms,
        cancelled_by,
    });
}

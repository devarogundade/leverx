// Copyright (c) LeverX contributors
// SPDX-License-Identifier: Apache-2.0

/// LeverageVault — dUSDC credit pool with utilization-based kinked borrow/LP APR and flash loans.
///
/// Borrow APR rises with pool utilization (two-slope kink curve). LP supply APR is
/// `borrow_rate × utilization × vault_fee_share` and updates as utilization changes.
module leverx::leverage_vault;

use leverx::{protocol_constants, errors, events, lxplp::LXPLP};
use std::u128;
use sui::{
    balance::{Self, Balance},
    clock::Clock,
    coin::{Self, Coin, TreasuryCap},
};

/// Kinked utilization borrow curve parameters (annualized bps).
public struct BorrowRateConfig has copy, drop, store {
    /// Borrow rate at zero utilization.
    base_rate_bps: u64,
    /// Utilization (bps) where the curve switches from slope1 to slope2.
    kink_utilization_bps: u64,
    /// Rate increase per utilization bps below the kink.
    slope1_bps: u64,
    /// Rate increase per utilization bps above the kink.
    slope2_bps: u64,
    /// Flash-loan fee charged as bps of principal.
    flash_fee_bps: u64,
}

/// Hot-potato flash loan receipt — must be repaid in the same PTB.
public struct FlashReceipt {
    /// Principal borrowed from vault liquidity.
    amount: u64,
    /// Fee due on repayment (bps of principal from rate config).
    fee: u64,
}

/// Shared quote liquidity pool backing leveraged borrows and LP shares.
public struct LeverageVault<phantom Quote> has key {
    id: UID,
    /// Idle quote balance available for borrow, withdraw, and flash loans.
    balance: Balance<Quote>,
    /// Outstanding borrower debt including accrued interest.
    total_borrowed: u64,
    /// Outstanding borrow principal excluding accrued interest (for fee split on repay).
    total_principal_borrowed: u64,
    /// Total LXPLP shares outstanding (pro-rata claim on NAV).
    total_shares: u64,
    /// Treasury cap for minting/burning LXPLP on deposit and withdraw.
    treasury_cap: TreasuryCap<LXPLP>,
    /// Kinked borrow curve and flash-loan fee parameters.
    rate_config: BorrowRateConfig,
    /// Last timestamp (ms) interest was accrued to `total_borrowed`.
    last_accrue_ms: u64,
    /// Quote skimmed from liquidations to backstop protocol losses.
    insurance_fund: Balance<Quote>,
}

/// Create an empty vault; caller must `share` it as a shared object.
public fun new<Quote>(
    treasury_cap: TreasuryCap<LXPLP>,
    ctx: &mut TxContext,
): LeverageVault<Quote> {
    LeverageVault {
        id: object::new(ctx),
        balance: balance::zero(),
        total_borrowed: 0,
        total_principal_borrowed: 0,
        total_shares: 0,
        treasury_cap,
        rate_config: default_rate_config(),
        last_accrue_ms: 0,
        insurance_fund: balance::zero(),
    }
}

/// Publish the vault as a shared object for LP supply and protocol borrows.
public fun share<Quote>(vault: LeverageVault<Quote>) {
    transfer::share_object(vault);
}

/// Update kinked borrow curve and flash-loan fee on an existing vault.
public fun set_borrow_rate_params<Quote>(
    vault: &mut LeverageVault<Quote>,
    base_rate_bps: u64,
    kink_utilization_bps: u64,
    slope1_bps: u64,
    slope2_bps: u64,
    flash_fee_bps: u64,
) {
    vault.rate_config = BorrowRateConfig {
        base_rate_bps,
        kink_utilization_bps,
        slope1_bps,
        slope2_bps,
        flash_fee_bps,
    };
}

// === LP ===

/// Accrue interest then deposit quote; mint LXPLP shares pro-rata to NAV.
public fun deposit_liquidity<Quote>(
    vault: &mut LeverageVault<Quote>,
    funds: Coin<Quote>,
    clock: &Clock,
    ctx: &mut TxContext,
): Coin<LXPLP> {
    accrue_interest(vault, clock);
    supply(vault, funds, ctx)
}

/// Accrue interest then burn LXPLP shares for a pro-rata quote withdrawal.
public fun withdraw_liquidity<Quote>(
    vault: &mut LeverageVault<Quote>,
    lp_shares: Coin<LXPLP>,
    clock: &Clock,
    ctx: &mut TxContext,
): Coin<Quote> {
    accrue_interest(vault, clock);
    withdraw(vault, lp_shares, ctx)
}

/// Deposit quote into the vault and mint LXPLP shares at current NAV.
public fun supply<Quote>(
    vault: &mut LeverageVault<Quote>,
    coin: Coin<Quote>,
    ctx: &mut TxContext,
): Coin<LXPLP> {
    let amount = coin.value();
    assert!(amount > 0, errors::zero_amount());

    let shares = if (vault.total_shares == 0) {
        amount
    } else {
        let nav = nav(vault);
        assert!(nav > 0, errors::zero_amount());
        ((amount as u128) * (vault.total_shares as u128) / (nav as u128)) as u64
    };
    assert!(shares > 0, errors::zero_amount());

    vault.balance.join(coin.into_balance());
    vault.total_shares = vault.total_shares + shares;
    let lp = coin::mint(&mut vault.treasury_cap, shares, ctx);
    let (borrow_rate_bps, lp_apr_bps) = rate_snapshot(vault);
    events::emit_vault_supplied(
        object::id(vault),
        ctx.sender(),
        amount,
        shares,
        nav(vault),
        utilization_bps(vault),
        vault.total_borrowed,
        borrow_rate_bps,
        lp_apr_bps,
    );
    lp
}

/// Burn LXPLP shares and withdraw the caller's pro-rata quote from NAV.
public fun withdraw<Quote>(
    vault: &mut LeverageVault<Quote>,
    shares: Coin<LXPLP>,
    ctx: &mut TxContext,
): Coin<Quote> {
    let shares_burned = shares.value();
    assert!(shares_burned > 0, errors::zero_amount());
    assert!(shares_burned <= vault.total_shares, errors::insufficient_vault_liquidity());

    let nav_val = nav(vault);
    let amount = ((shares_burned as u128) * (nav_val as u128) / (vault.total_shares as u128)) as u64;
    assert!(amount <= vault.balance.value(), errors::insufficient_vault_liquidity());

    vault.total_shares = vault.total_shares - shares_burned;
    coin::burn(&mut vault.treasury_cap, shares);
    let withdrawn = coin::take(&mut vault.balance, amount, ctx);
    let (borrow_rate_bps, lp_apr_bps) = rate_snapshot(vault);
    events::emit_vault_withdrawn(
        object::id(vault),
        ctx.sender(),
        amount,
        shares_burned,
        nav_val,
        utilization_bps(vault),
        vault.total_borrowed,
        borrow_rate_bps,
        lp_apr_bps,
    );
    withdrawn
}

// === Interest ===

/// Compound borrow interest into `total_borrowed` since the last accrual timestamp.
public fun accrue_interest<Quote>(vault: &mut LeverageVault<Quote>, clock: &Clock) {
    let now = clock.timestamp_ms();
    if (vault.last_accrue_ms == 0) {
        vault.last_accrue_ms = now;
        return
    };
    let elapsed = now - vault.last_accrue_ms;
    if (elapsed == 0 || vault.total_borrowed == 0) {
        vault.last_accrue_ms = now;
        return
    };

    let rate = current_borrow_rate(vault);
    let interest = (
        (vault.total_borrowed as u128)
            * (rate as u128)
            * (elapsed as u128)
            / ((protocol_constants::bps() as u128) * (protocol_constants::year_ms() as u128))
    ) as u64;

    if (interest > 0) {
        vault.total_borrowed = vault.total_borrowed + interest;
        let (borrow_rate_bps, lp_apr_bps) = rate_snapshot(vault);
        events::emit_interest_accrued(
            object::id(vault),
            interest,
            vault.total_borrowed,
            borrow_rate_bps,
            lp_apr_bps,
            nav(vault),
            utilization_bps(vault),
        );
    };
    vault.last_accrue_ms = now;
}

/// Current annualized borrow rate (bps) from the kinked utilization curve.
public fun current_borrow_rate<Quote>(vault: &LeverageVault<Quote>): u64 {
    borrow_rate_at_utilization(vault, utilization_bps(vault))
}

/// Kinked borrow APR at a hypothetical utilization (bps of NAV).
public fun borrow_rate_at_utilization<Quote>(vault: &LeverageVault<Quote>, util_bps: u64): u64 {
    let cfg = &vault.rate_config;
    if (util_bps <= cfg.kink_utilization_bps) {
        cfg.base_rate_bps + (cfg.slope1_bps * util_bps / protocol_constants::bps())
    } else {
        let excess = util_bps - cfg.kink_utilization_bps;
        let kink_rate = cfg.base_rate_bps
            + (cfg.slope1_bps * cfg.kink_utilization_bps / protocol_constants::bps());
        kink_rate + (cfg.slope2_bps * excess / protocol_constants::bps())
    }
}

/// Current LP supply APR (bps): `borrow_rate × utilization × vault_fee_share`.
///
/// LPs earn the borrower interest that flows to vault liquidity (80% of interest/fees),
/// scaled by how much of NAV is actively borrowed.
public fun current_lp_apr_bps<Quote>(vault: &LeverageVault<Quote>): u64 {
    lp_apr_at_utilization(
        vault,
        utilization_bps(vault),
        current_borrow_rate(vault),
    )
}

/// LP supply APR (bps) at a hypothetical utilization and borrow rate.
public fun lp_apr_at_utilization<Quote>(
    _vault: &LeverageVault<Quote>,
    util_bps: u64,
    borrow_rate_bps: u64,
): u64 {
    let gross = protocol_constants::mul_bps(borrow_rate_bps, util_bps);
    protocol_constants::mul_bps(gross, protocol_constants::vault_fee_share_bps())
}

/// Pool utilization as bps: `total_borrowed / NAV`.
public fun utilization_bps<Quote>(vault: &LeverageVault<Quote>): u64 {
    let nav_val = nav(vault);
    if (nav_val == 0) return 0;
    (vault.total_borrowed * protocol_constants::bps() / nav_val)
}

// === Borrow / repay ===

/// Borrow quote from vault liquidity; increases `total_borrowed` (package-only).
public(package) fun borrow<Quote>(
    vault: &mut LeverageVault<Quote>,
    amount: u64,
    clock: &Clock,
    ctx: &mut TxContext,
): Coin<Quote> {
    accrue_interest(vault, clock);
    assert!(amount > 0, errors::zero_amount());
    assert!(amount <= vault.balance.value(), errors::insufficient_vault_liquidity());
    vault.total_borrowed = vault.total_borrowed + amount;
    vault.total_principal_borrowed = vault.total_principal_borrowed + amount;
    coin::take(&mut vault.balance, amount, ctx)
}

/// Accrued interest not yet realized as coin (difference between debt and principal).
public(package) fun outstanding_accrued_interest<Quote>(vault: &LeverageVault<Quote>): u64 {
    if (vault.total_borrowed > vault.total_principal_borrowed) {
        vault.total_borrowed - vault.total_principal_borrowed
    } else {
        0
    }
}

/// Ledger principal plus pro-rata share of vault-wide accrued interest (round up).
public(package) fun debt_with_accrued_interest<Quote>(
    vault: &LeverageVault<Quote>,
    ledger_principal: u64,
): u64 {
    if (ledger_principal == 0) return 0;
    let total_principal = vault.total_principal_borrowed;
    if (total_principal == 0) return ledger_principal;
    let total_debt = vault.total_borrowed;
    u128::divide_and_round_up(
        (ledger_principal as u128) * (total_debt as u128),
        total_principal as u128,
    ) as u64
}

/// Split a repayment against `ledger_principal` into interest vs principal portions.
public(package) fun repayment_split_for_ledger_principal<Quote>(
    vault: &LeverageVault<Quote>,
    ledger_principal: u64,
    repay_amt: u64,
): (u64, u64) {
    if (repay_amt == 0 || ledger_principal == 0) return (0, 0);
    let effective = debt_with_accrued_interest(vault, ledger_principal);
    if (effective == 0) return (0, 0);
    let principal_in_payment = if (repay_amt >= effective) {
        ledger_principal
    } else {
        ((repay_amt as u128) * (ledger_principal as u128) / (effective as u128)) as u64
    };
    (repay_amt - principal_in_payment, principal_in_payment)
}

/// Apply a repayment to debt accounting after splitting interest vs principal.
public(package) fun apply_repayment<Quote>(
    vault: &mut LeverageVault<Quote>,
    repay_amt: u64,
    principal_in_payment: u64,
) {
    vault.total_borrowed = vault.total_borrowed - repay_amt;
    vault.total_principal_borrowed = vault.total_principal_borrowed - principal_in_payment;
}

/// Credit quote revenue to LP liquidity (idle balance / NAV) without changing borrow debt.
public(package) fun credit_lp_revenue<Quote>(
    vault: &mut LeverageVault<Quote>,
    revenue: Coin<Quote>,
) {
    vault.balance.join(revenue.into_balance());
}

// === Vault flash loans ===

/// Flash-borrow quote; returns coin and a hot-potato receipt due principal + fee.
public(package) fun borrow_flash_liquidity<Quote>(
    vault: &mut LeverageVault<Quote>,
    amount: u64,
    clock: &Clock,
    ctx: &mut TxContext,
): (Coin<Quote>, FlashReceipt) {
    accrue_interest(vault, clock);
    assert!(amount > 0, errors::zero_amount());
    assert!(amount <= vault.balance.value(), errors::insufficient_vault_liquidity());

    let fee = amount * vault.rate_config.flash_fee_bps / protocol_constants::bps();
    let coin = coin::take(&mut vault.balance, amount, ctx);
    events::emit_flash_loan_borrowed(object::id(vault), ctx.sender(), amount, fee);
    (coin, FlashReceipt { amount, fee })
}

/// Unpack flash loan receipt fields (package-only; receipt is defined here).
public(package) fun flash_receipt_amounts(receipt: FlashReceipt): (u64, u64) {
    let FlashReceipt { amount, fee } = receipt;
    (amount, fee)
}

#[test_only]
public fun flash_receipt_for_testing(amount: u64, fee: u64): FlashReceipt {
    FlashReceipt { amount, fee }
}

// === Read API ===

/// Total outstanding borrow principal plus accrued interest.
public fun total_borrowed<Quote>(vault: &LeverageVault<Quote>): u64 {
    vault.total_borrowed
}

/// Idle quote balance available for new borrows, withdrawals, and flash loans.
public fun available_liquidity<Quote>(vault: &LeverageVault<Quote>): u64 {
    vault.balance.value()
}

/// Total LXPLP shares minted to liquidity providers.
public fun total_shares<Quote>(vault: &LeverageVault<Quote>): u64 {
    vault.total_shares
}

/// Net asset value: idle liquidity, outstanding borrower debt, and insurance fund.
public fun nav<Quote>(vault: &LeverageVault<Quote>): u64 {
    vault.balance.value() + vault.total_borrowed + vault.insurance_fund.value()
}

/// Quote held in the liquidation insurance / backstop bucket.
public fun insurance_fund_balance<Quote>(vault: &LeverageVault<Quote>): u64 {
    vault.insurance_fund.value()
}

/// Snapshot borrow and LP APR after a state change (for event emission).
fun rate_snapshot<Quote>(vault: &LeverageVault<Quote>): (u64, u64) {
    let borrow_rate_bps = current_borrow_rate(vault);
    let lp_apr_bps = current_lp_apr_bps(vault);
    (borrow_rate_bps, lp_apr_bps)
}

/// Protocol-default kinked borrow curve used at vault creation.
fun default_rate_config(): BorrowRateConfig {
    BorrowRateConfig {
        base_rate_bps: protocol_constants::default_base_rate_bps(),
        kink_utilization_bps: protocol_constants::default_kink_util_bps(),
        slope1_bps: protocol_constants::default_slope1_bps(),
        slope2_bps: protocol_constants::default_slope2_bps(),
        flash_fee_bps: protocol_constants::default_flash_fee_bps(),
    }
}

#[test_only]
public fun create_for_testing<Quote>(
    treasury_cap: TreasuryCap<LXPLP>,
    ctx: &mut TxContext,
): LeverageVault<Quote> {
    new(treasury_cap, ctx)
}

#[test_only]
public fun credit_balance_for_testing<Quote>(
    vault: &mut LeverageVault<Quote>,
    coin: Coin<Quote>,
) {
    vault.balance.join(coin.into_balance());
}

#[test_only]
public fun set_debt_for_testing<Quote>(
    vault: &mut LeverageVault<Quote>,
    total_borrowed: u64,
    total_principal_borrowed: u64,
) {
    vault.total_borrowed = total_borrowed;
    vault.total_principal_borrowed = total_principal_borrowed;
}

#[test_only]
public fun set_last_accrue_ms_for_testing<Quote>(
    vault: &mut LeverageVault<Quote>,
    last_ms: u64,
) {
    vault.last_accrue_ms = last_ms;
}

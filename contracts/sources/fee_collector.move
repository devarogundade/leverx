// Copyright (c) LeverX contributors
// SPDX-License-Identifier: Apache-2.0

/// Protocol fee treasury and 80/10/10 revenue router.
///
/// When the protocol earns quote revenue (borrow interest, flash fees, liquidation skims),
/// it is split:
/// - 80% → vault LP liquidity (`LeverageVault` balance / NAV)
/// - 10% → `FeeCollector` balance (protocol treasury)
/// - 10% → transaction sender (keeper / permissionless caller)
module leverx::fee_collector;

use leverx::{
    errors,
    events,
    leverage_vault::{Self as vault_mod, LeverageVault, FlashReceipt},
    protocol_constants,
};
use sui::{balance::{Self, Balance}, clock::Clock, coin::{Self, Coin}};

/// Shared treasury object accumulating the protocol's 10% fee share.
public struct FeeCollector<phantom Quote> has key {
    id: UID,
    /// Linked vault object ID (for indexer correlation).
    vault_id: ID,
    /// Accumulated quote fees awaiting admin withdrawal.
    balance: Balance<Quote>,
    /// Lifetime quote atoms credited to this collector.
    total_collected: u64,
}

/// Create an unshared fee collector linked to a vault.
public fun new<Quote>(vault_id: ID, ctx: &mut TxContext): FeeCollector<Quote> {
    FeeCollector {
        id: object::new(ctx),
        vault_id,
        balance: balance::zero(),
        total_collected: 0,
    }
}

/// Publish the fee collector as a shared object.
public fun share<Quote>(collector: FeeCollector<Quote>) {
    transfer::share_object(collector);
}

/// Admin withdraws accumulated protocol fees (caller must verify `AdminCap` upstream).
public(package) fun withdraw<Quote>(
    collector: &mut FeeCollector<Quote>,
    amount: u64,
    ctx: &mut TxContext,
): Coin<Quote> {
    assert!(amount > 0, errors::zero_amount());
    assert!(amount <= collector.balance.value(), errors::insufficient_collector_balance());
    let coin = coin::take(&mut collector.balance, amount, ctx);
    events::emit_fee_collector_withdrawn(
        object::id(collector),
        ctx.sender(),
        amount,
        collector.balance.value(),
    );
    coin
}

/// Split a fee coin: 80% vault / 10% collector / 10% keeper (`ctx.sender()`).
public(package) fun distribute_protocol_fee<Quote>(
    vault: &mut LeverageVault<Quote>,
    collector: &mut FeeCollector<Quote>,
    fee: Coin<Quote>,
    fee_source: u8,
    ctx: &mut TxContext,
) {
    let total = fee.value();
    if (total == 0) {
        coin::destroy_zero(fee);
        return
    };

    let vault_amt = protocol_constants::mul_bps(total, protocol_constants::vault_fee_share_bps());
    let collector_amt = protocol_constants::mul_bps(total, protocol_constants::fee_collector_share_bps());
    let keeper_amt = total - vault_amt - collector_amt;

    let mut remaining = fee;
    if (vault_amt > 0) {
        let share = remaining.split(vault_amt, ctx);
        vault_mod::credit_lp_revenue(vault, share);
    };
    if (collector_amt > 0) {
        let share = remaining.split(collector_amt, ctx);
        collector.balance.join(share.into_balance());
        collector.total_collected = collector.total_collected + collector_amt;
    };
    if (keeper_amt > 0) {
        let share = remaining.split(keeper_amt, ctx);
        transfer::public_transfer(share, ctx.sender());
    };
    coin::destroy_zero(remaining);

    events::emit_protocol_fee_distributed(
        object::id(vault),
        object::id(collector),
        total,
        vault_amt,
        collector_amt,
        keeper_amt,
        ctx.sender(),
        fee_source,
    );
}

/// Repay vault debt; interest portion of the payment is split 80/10/10, principal restores liquidity.
public(package) fun repay_vault_with_fee_split<Quote>(
    vault: &mut LeverageVault<Quote>,
    collector: &mut FeeCollector<Quote>,
    payment: Coin<Quote>,
    fee_source: u8,
    clock: &Clock,
    ctx: &mut TxContext,
) {
    repay_vault_for_ledger_principal(vault, collector, payment, 0, fee_source, clock, ctx);
}

/// Repay vault debt attributed to a proxy ledger principal (includes pro-rata accrued interest).
public(package) fun repay_vault_for_ledger_principal<Quote>(
    vault: &mut LeverageVault<Quote>,
    collector: &mut FeeCollector<Quote>,
    payment: Coin<Quote>,
    ledger_principal: u64,
    fee_source: u8,
    clock: &Clock,
    ctx: &mut TxContext,
) {
    vault_mod::accrue_interest(vault, clock);
    let amount = payment.value();
    assert!(amount > 0, errors::zero_amount());

    let outstanding = if (ledger_principal > 0) {
        vault_mod::debt_with_accrued_interest(vault, ledger_principal)
    } else {
        vault_mod::total_borrowed(vault)
    };
    let repay_amt = if (amount >= outstanding) { outstanding } else { amount };
    let (interest_in_payment, principal_in_payment) = if (ledger_principal > 0) {
        vault_mod::repayment_split_for_ledger_principal(vault, ledger_principal, repay_amt)
    } else {
        let accrued_interest = vault_mod::outstanding_accrued_interest(vault);
        let interest = if (repay_amt < accrued_interest) {
            repay_amt
        } else {
            accrued_interest
        };
        (interest, repay_amt - interest)
    };

    vault_mod::apply_repayment(vault, repay_amt, principal_in_payment);

    let mut pay = payment;
    if (interest_in_payment > 0) {
        let interest_coin = pay.split(interest_in_payment, ctx);
        distribute_protocol_fee(vault, collector, interest_coin, fee_source, ctx);
    };
    if (principal_in_payment > 0) {
        let principal_coin = pay.split(principal_in_payment, ctx);
        vault_mod::credit_lp_revenue(vault, principal_coin);
    };
    if (pay.value() > 0) {
        vault_mod::credit_lp_revenue(vault, pay);
    } else {
        coin::destroy_zero(pay);
    };
}

/// Repay a vault flash loan: principal returns to liquidity; fee is split 80/10/10.
public(package) fun repay_flash_liquidity<Quote>(
    vault: &mut LeverageVault<Quote>,
    collector: &mut FeeCollector<Quote>,
    payment: Coin<Quote>,
    receipt: FlashReceipt,
    clock: &Clock,
    ctx: &mut TxContext,
) {
    vault_mod::accrue_interest(vault, clock);
    let (amount, fee) = vault_mod::flash_receipt_amounts(receipt);
    let required = amount + fee;
    assert!(payment.value() >= required, errors::invalid_flash_repayment());

    let mut pay = payment;
    let principal = pay.split(amount, ctx);
    vault_mod::credit_lp_revenue(vault, principal);
    if (fee > 0) {
        let fee_coin = pay.split(fee, ctx);
        distribute_protocol_fee(
            vault,
            collector,
            fee_coin,
            protocol_constants::fee_source_flash_loan(),
            ctx,
        );
    };
    if (pay.value() > 0) {
        transfer::public_transfer(pay, ctx.sender());
    } else {
        coin::destroy_zero(pay);
    };
    events::emit_flash_loan_repaid(object::id(vault), amount, fee);
}

/// Route a liquidation / protocol skim through the 80/10/10 splitter.
public(package) fun collect_protocol_skim<Quote>(
    vault: &mut LeverageVault<Quote>,
    collector: &mut FeeCollector<Quote>,
    skim: Coin<Quote>,
    fee_source: u8,
    ctx: &mut TxContext,
) {
    distribute_protocol_fee(vault, collector, skim, fee_source, ctx);
}

// === Read API ===

public fun vault_id<Quote>(collector: &FeeCollector<Quote>): ID {
    collector.vault_id
}

public fun balance<Quote>(collector: &FeeCollector<Quote>): u64 {
    collector.balance.value()
}

public fun total_collected<Quote>(collector: &FeeCollector<Quote>): u64 {
    collector.total_collected
}

#[test_only]
public fun new_for_testing<Quote>(vault_id: ID, ctx: &mut TxContext): FeeCollector<Quote> {
    new(vault_id, ctx)
}

//! Maps deserialized `leverx::events` into Postgres row batches.

use leverx_schema::models::{
    NewAccountTimeline, NewLeverxEvent, NewLimitMintOrder, NewLeveragedPosition, NewLiquidation,
    NewMarketTrade, NewPositionTrigger, NewProtocolSettings, NewProxyExecutor, NewUserProxy,
    NewVaultSnapshot,
};
use serde_json::Value as JsonValue;
use sui_types::event::Event;

use crate::handlers::{
    BorrowRatePatch, DebtRepaidPatch, KeyBorrowPatch, LeverxBatch, LimitCancelPatch,
    LimitExecutePatch, LiquidationBpsPatch, LiquidationPositionPatch, PositionClosePatch,
    TradingPausedPatch,
};
use crate::keys::{limit_order_key, position_key};
use crate::points::record_volume;
use crate::relation_upserts::{ensure_market, ensure_predict_manager};
use crate::move_events::{
    parse_event_json, try_parse, fee_source_label, FEE_SOURCE_LIQUIDATION,
    AccountCreated, DebtBorrowed, DebtRepaid, ExecutorRegistered,
    ExecutorRevoked, BorrowRateParamsUpdated, FeeCollectorWithdrawn, FlashLoanBorrowed,
    FlashLoanRepaid, InsuranceFundSkimmed, InterestAccrued, ProtocolFeeDistributed,
    BadDebtWrittenOff, KeyBorrowUpdated, LeveragedPositionClosed, LeveragedPositionOpened,
    LimitMintOrderCancelled, LimitMintOrderExecuted, LimitMintOrderPlaced, LiquidationBpsUpdated,
    PositionForceDeleveraged,
    PositionLiquidated,
    PredictManagerLinked,
    ProtocolDeployed, ProxyAccountingSynced, RegistryInitialized,
    TradingPausedChanged, TriggersCleared, TriggersUpdated, VaultBorrowed, VaultRepaid,
    VaultSupplied, VaultWithdrawn,
};

pub struct EventContext<'a> {
    pub event_name: &'a str,
    pub event_digest: &'a str,
    pub tx_digest: &'a str,
    pub checkpoint: i64,
    pub timestamp_ms: i64,
    pub event: &'a Event,
    pub parsed_json: JsonValue,
}

pub fn apply_event(batch: &mut LeverxBatch, ctx: EventContext<'_>) {
    batch.events.push(NewLeverxEvent {
        event_digest: ctx.event_digest.to_string(),
        event_type: ctx.event_name.to_string(),
        module: ctx.event.type_.module.to_string(),
        package_id: ctx.event.package_id.to_string(),
        transaction_digest: ctx.tx_digest.to_string(),
        checkpoint: ctx.checkpoint,
        timestamp_ms: ctx.timestamp_ms,
        parsed_json: ctx.parsed_json.clone(),
    });

    match ctx.event_name {
        "AccountCreated" => {
            if let Some(ev) = try_parse::<AccountCreated>(ctx.event.contents.as_slice()) {
                upsert_proxy(
                    batch,
                    &ev.account_id.to_string(),
                    &ev.owner.to_string(),
                    Some(ev.predict_manager_id.to_string()),
                    ctx.timestamp_ms,
                );
                timeline(batch, ctx, ev.account_id.to_string(), Some(ev.owner.to_string()));
            }
        }
        "PredictManagerLinked" => {
            if let Some(ev) = try_parse::<PredictManagerLinked>(ctx.event.contents.as_slice()) {
                upsert_proxy(
                    batch,
                    &ev.account_id.to_string(),
                    &ev.owner.to_string(),
                    Some(ev.predict_manager_id.to_string()),
                    ctx.timestamp_ms,
                );
                timeline(batch, ctx, ev.account_id.to_string(), Some(ev.owner.to_string()));
            }
        }
        "LimitMintOrderPlaced" => {
            if let Some(ev) = try_parse::<LimitMintOrderPlaced>(ctx.event.contents.as_slice()) {
                ensure_market(
                    batch,
                    &ev.oracle_id.to_string(),
                    ev.expiry_ms as i64,
                    ev.strike as i64,
                    ev.higher_strike as i64,
                    ev.is_up,
                    ev.is_range,
                    ctx.timestamp_ms,
                );
                let pk = limit_order_key(
                    &ev.oracle_id.to_string(),
                    ev.expiry_ms as i64,
                    ev.strike as i64,
                    ev.higher_strike as i64,
                    ev.is_up,
                    ev.is_range,
                );
                batch.limit_placed.push(NewLimitMintOrder {
                    placed_event_digest: ctx.event_digest.to_string(),
                    position_key: pk,
                    account_id: ev.account_id.to_string(),
                    owner: ev.owner.to_string(),
                    oracle_id: ev.oracle_id.to_string(),
                    expiry_ms: ev.expiry_ms as i64,
                    strike: ev.strike as i64,
                    higher_strike: ev.higher_strike as i64,
                    is_range: ev.is_range,
                    is_up: ev.is_up,
                    limit_premium_per_unit: ev.limit_premium_per_unit as i64,
                    slippage_bps: ev.slippage_bps as i64,
                    market_ask_at_place: Some(ev.market_ask_at_place as i64),
                    margin_quote: ev.margin_quote as i64,
                    leverage_bps: ev.leverage_bps as i64,
                    quantity: ev.quantity as i64,
                    order_expires_ms: ev.order_expires_ms as i64,
                    status: "open".into(),
                    placed_at_ms: ctx.timestamp_ms,
                    placed_by: Some(ev.placed_by.to_string()),
                    executed_event_digest: None,
                    filled_at_ms: None,
                    market_ask_at_fill: None,
                    mint_cost: None,
                    executor: None,
                    cancelled_event_digest: None,
                    cancelled_at_ms: None,
                    cancelled_by: None,
                });
                timeline(batch, ctx, ev.account_id.to_string(), Some(ev.owner.to_string()));
            }
        }
        "LimitMintOrderExecuted" => {
            if let Some(ev) = try_parse::<LimitMintOrderExecuted>(ctx.event.contents.as_slice()) {
                ensure_market(
                    batch,
                    &ev.oracle_id.to_string(),
                    ev.expiry_ms as i64,
                    ev.strike as i64,
                    ev.higher_strike as i64,
                    ev.is_up,
                    ev.is_range,
                    ctx.timestamp_ms,
                );
                let pk = limit_order_key(
                    &ev.oracle_id.to_string(),
                    ev.expiry_ms as i64,
                    ev.strike as i64,
                    ev.higher_strike as i64,
                    ev.is_up,
                    ev.is_range,
                );
                batch.limit_executed.push(LimitExecutePatch {
                    account_id: ev.account_id.to_string(),
                    position_key: pk.clone(),
                    order_expires_ms: ev.order_expires_ms as i64,
                    executed_event_digest: ctx.event_digest.to_string(),
                    filled_at_ms: ctx.timestamp_ms,
                    market_ask_at_fill: ev.market_ask_at_fill as i64,
                    mint_cost: ev.mint_cost as i64,
                    executor: ev.executor.to_string(),
                });
                // Volume is recorded via LeveragedPositionOpened in the same tx (avoids double count).
                timeline(batch, ctx, ev.account_id.to_string(), Some(ev.owner.to_string()));
            }
        }
        "LimitMintOrderCancelled" => {
            if let Some(ev) = try_parse::<LimitMintOrderCancelled>(ctx.event.contents.as_slice()) {
                batch.limit_cancelled.push(LimitCancelPatch {
                    account_id: ev.account_id.to_string(),
                    position_key: limit_order_key(
                        &ev.oracle_id.to_string(),
                        ev.expiry_ms as i64,
                        ev.strike as i64,
                        ev.higher_strike as i64,
                        ev.is_up,
                        ev.is_range,
                    ),
                    order_expires_ms: ev.order_expires_ms as i64,
                    cancelled_event_digest: ctx.event_digest.to_string(),
                    cancelled_at_ms: ctx.timestamp_ms,
                    cancelled_by: ev.cancelled_by.to_string(),
                });
                timeline(batch, ctx, ev.account_id.to_string(), Some(ev.owner.to_string()));
            }
        }
        "LeveragedPositionOpened" => {
            if let Some(ev) = try_parse::<LeveragedPositionOpened>(ctx.event.contents.as_slice()) {
                ensure_market(
                    batch,
                    &ev.oracle_id.to_string(),
                    ev.expiry_ms as i64,
                    ev.strike as i64,
                    ev.higher_strike as i64,
                    ev.is_up,
                    ev.is_range,
                    ctx.timestamp_ms,
                );
                let pk = position_key(
                    &ev.oracle_id.to_string(),
                    ev.expiry_ms as i64,
                    ev.strike as i64,
                    ev.higher_strike as i64,
                    ev.is_up,
                    ev.is_range,
                );
                let premium = if ev.order_type == 1 {
                    ev.limit_premium_per_unit
                } else {
                    ev.market_ask_at_fill
                };
                batch.positions_open.push(NewLeveragedPosition {
                    position_key: pk.clone(),
                    account_id: ev.account_id.to_string(),
                    owner: ev.owner.to_string(),
                    predict_manager_id: Some(ev.predict_manager_id.to_string()),
                    oracle_id: ev.oracle_id.to_string(),
                    expiry_ms: ev.expiry_ms as i64,
                    strike: ev.strike as i64,
                    higher_strike: ev.higher_strike as i64,
                    is_up: ev.is_up,
                    is_range: ev.is_range,
                    open_quantity: ev.quantity as i64,
                    margin_quote: ev.margin_quote as i64,
                    borrow_quote: ev.borrow_quote as i64,
                    leverage_bps: ev.leverage_bps as i64,
                    mint_cost: ev.mint_cost as i64,
                    last_order_type: Some(ev.order_type as i16),
                    status: "open".into(),
                    opened_at_ms: Some(ctx.timestamp_ms),
                    closed_at_ms: None,
                    realized_payout: 0,
                });
                batch.trades.push(NewMarketTrade {
                    event_digest: ctx.event_digest.to_string(),
                    position_key: pk,
                    oracle_id: ev.oracle_id.to_string(),
                    trade_kind: "open".into(),
                    side: "buy".into(),
                    quantity: ev.quantity as i64,
                    premium_per_unit: Some(premium as i64),
                    notional_quote: Some(ev.mint_cost as i64),
                    account_id: Some(ev.account_id.to_string()),
                    owner: Some(ev.owner.to_string()),
                    order_type: Some(ev.order_type as i16),
                    timestamp_ms: ctx.timestamp_ms,
                });
                record_volume(
                    batch,
                    &ev.owner.to_string(),
                    Some(&ev.account_id.to_string()),
                    ev.mint_cost as i64,
                    ctx.timestamp_ms,
                );
                batch.debt_repaid.push(DebtRepaidPatch {
                    account_id: ev.account_id.to_string(),
                    remaining_debt: ev.borrowed_quote_after as i64,
                    updated_at_ms: ctx.timestamp_ms,
                });
                timeline(batch, ctx, ev.account_id.to_string(), Some(ev.owner.to_string()));
            }
        }
        "LeveragedPositionClosed" => {
            if let Some(ev) = try_parse::<LeveragedPositionClosed>(ctx.event.contents.as_slice()) {
                ensure_market(
                    batch,
                    &ev.oracle_id.to_string(),
                    ev.expiry_ms as i64,
                    ev.strike as i64,
                    ev.higher_strike as i64,
                    ev.is_up,
                    ev.is_range,
                    ctx.timestamp_ms,
                );
                let pk = position_key(
                    &ev.oracle_id.to_string(),
                    ev.expiry_ms as i64,
                    ev.strike as i64,
                    ev.higher_strike as i64,
                    ev.is_up,
                    ev.is_range,
                );
                batch.position_closes.push(PositionClosePatch {
                    position_key: pk.clone(),
                    account_id: ev.account_id.to_string(),
                    quantity: ev.quantity as i64,
                    payout: ev.payout as i64,
                    settled: ev.is_settled,
                    closed_at_ms: ctx.timestamp_ms,
                    remaining_borrow_quote: ev.remaining_debt as i64,
                });
                batch.trades.push(NewMarketTrade {
                    event_digest: ctx.event_digest.to_string(),
                    position_key: pk,
                    oracle_id: ev.oracle_id.to_string(),
                    trade_kind: "close".into(),
                    side: "sell".into(),
                    quantity: ev.quantity as i64,
                    premium_per_unit: None,
                    notional_quote: Some(ev.payout as i64),
                    account_id: Some(ev.account_id.to_string()),
                    owner: Some(ev.owner.to_string()),
                    order_type: None,
                    timestamp_ms: ctx.timestamp_ms,
                });
                record_volume(
                    batch,
                    &ev.owner.to_string(),
                    Some(&ev.account_id.to_string()),
                    ev.payout as i64,
                    ctx.timestamp_ms,
                );
                batch.debt_repaid.push(DebtRepaidPatch {
                    account_id: ev.account_id.to_string(),
                    remaining_debt: ev.remaining_debt as i64,
                    updated_at_ms: ctx.timestamp_ms,
                });
                timeline(batch, ctx, ev.account_id.to_string(), Some(ev.owner.to_string()));
            }
        }
        "ProtocolDeployed" => {
            if let Some(ev) = try_parse::<ProtocolDeployed>(ctx.event.contents.as_slice()) {
                batch.protocol_settings.push(NewProtocolSettings {
                    registry_id: ev.registry_id.to_string(),
                    vault_id: Some(ev.vault_id.to_string()),
                    predict_id: Some(ev.predict_id.to_string()),
                    fee_collector_id: Some(ev.fee_collector_id.to_string()),
                    trading_paused: false,
                    base_rate_bps: None,
                    kink_utilization_bps: None,
                    slope1_bps: None,
                    slope2_bps: None,
                    flash_fee_bps: None,
                    liquidation_bps: None,
                    updated_at_ms: ctx.timestamp_ms,
                });
                batch.vaults.push(NewVaultSnapshot {
                    event_digest: ctx.event_digest.to_string(),
                    vault_id: ev.vault_id.to_string(),
                    event_type: ctx.event_name.to_string(),
                    timestamp_ms: ctx.timestamp_ms,
                    nav: None,
                    utilization_bps: None,
                    total_borrowed: None,
                    borrow_rate_bps: None,
                    lp_apr_bps: None,
                    amount: None,
                    account_id: None,
                    owner: Some(ev.deployer.to_string()),
                    payload: ctx.parsed_json.clone(),
                    insurance_fund_delta: None,
                });
            }
        }
        "RegistryInitialized" => {
            if let Some(ev) = try_parse::<RegistryInitialized>(ctx.event.contents.as_slice()) {
                batch.protocol_settings.push(NewProtocolSettings {
                    registry_id: ev.registry_id.to_string(),
                    vault_id: Some(ev.vault_id.to_string()),
                    predict_id: Some(ev.predict_id.to_string()),
                    fee_collector_id: Some(ev.fee_collector_id.to_string()),
                    trading_paused: false,
                    base_rate_bps: None,
                    kink_utilization_bps: None,
                    slope1_bps: None,
                    slope2_bps: None,
                    flash_fee_bps: None,
                    liquidation_bps: Some(ev.liquidation_bps as i64),
                    updated_at_ms: ctx.timestamp_ms,
                });
                batch.vaults.push(NewVaultSnapshot {
                    event_digest: ctx.event_digest.to_string(),
                    vault_id: ev.vault_id.to_string(),
                    event_type: ctx.event_name.to_string(),
                    timestamp_ms: ctx.timestamp_ms,
                    nav: None,
                    utilization_bps: None,
                    total_borrowed: None,
                    borrow_rate_bps: None,
                    lp_apr_bps: None,
                    amount: None,
                    account_id: None,
                    owner: None,
                    payload: ctx.parsed_json.clone(),
                    insurance_fund_delta: None,
                });
            }
        }
        "TradingPausedChanged" => {
            if let Some(ev) = try_parse::<TradingPausedChanged>(ctx.event.contents.as_slice()) {
                batch.trading_paused_patches.push(TradingPausedPatch {
                    registry_id: ev.registry_id.to_string(),
                    paused: ev.paused,
                    updated_at_ms: ctx.timestamp_ms,
                });
            }
        }
        "LiquidationBpsUpdated" => {
            if let Some(ev) = try_parse::<LiquidationBpsUpdated>(ctx.event.contents.as_slice()) {
                batch.liquidation_bps_patches.push(LiquidationBpsPatch {
                    registry_id: ev.registry_id.to_string(),
                    liquidation_bps: ev.liquidation_bps as i64,
                    updated_at_ms: ctx.timestamp_ms,
                });
            }
        }
        "BorrowRateParamsUpdated" => {
            if let Some(ev) = try_parse::<BorrowRateParamsUpdated>(ctx.event.contents.as_slice()) {
                batch.borrow_rate_patches.push(BorrowRatePatch {
                    vault_id: ev.vault_id.to_string(),
                    base_rate_bps: ev.base_rate_bps as i64,
                    kink_utilization_bps: ev.kink_utilization_bps as i64,
                    slope1_bps: ev.slope1_bps as i64,
                    slope2_bps: ev.slope2_bps as i64,
                    flash_fee_bps: ev.flash_fee_bps as i64,
                    updated_at_ms: ctx.timestamp_ms,
                });
            }
        }
        "VaultSupplied" => vault_from(ctx, batch, |_, ev: VaultSupplied| {
            (
                ev.vault_id.to_string(),
                None,
                Some(ev.supplier.to_string()),
                Some(ev.amount),
                Some(ev.nav),
                Some(ev.utilization_bps),
                Some(ev.total_borrowed),
                Some(ev.borrow_rate_bps),
                Some(ev.lp_apr_bps),
                None,
            )
        }),
        "VaultWithdrawn" => vault_from(ctx, batch, |_, ev: VaultWithdrawn| {
            (
                ev.vault_id.to_string(),
                None,
                Some(ev.withdrawer.to_string()),
                Some(ev.amount),
                // On-chain emits pre-withdraw NAV; pool TVL after withdraw is nav - amount.
                Some(ev.nav.saturating_sub(ev.amount)),
                Some(ev.utilization_bps),
                Some(ev.total_borrowed),
                Some(ev.borrow_rate_bps),
                Some(ev.lp_apr_bps),
                None,
            )
        }),
        "VaultBorrowed" => vault_from(ctx, batch, |_, ev: VaultBorrowed| {
            (
                ev.vault_id.to_string(),
                Some(ev.account_id.to_string()),
                Some(ev.owner.to_string()),
                Some(ev.amount),
                None,
                Some(ev.utilization_bps),
                Some(ev.total_borrowed),
                Some(ev.borrow_rate_bps),
                Some(ev.lp_apr_bps),
                None,
            )
        }),
        "VaultRepaid" => vault_from(ctx, batch, |_, ev: VaultRepaid| {
            (
                ev.vault_id.to_string(),
                Some(ev.account_id.to_string()),
                Some(ev.owner.to_string()),
                Some(ev.amount),
                None,
                Some(ev.utilization_bps),
                Some(ev.total_borrowed),
                Some(ev.borrow_rate_bps),
                Some(ev.lp_apr_bps),
                None,
            )
        }),
        "InterestAccrued" => vault_from(ctx, batch, |_, ev: InterestAccrued| {
            (
                ev.vault_id.to_string(),
                None,
                None,
                Some(ev.interest_added),
                Some(ev.nav),
                Some(ev.utilization_bps),
                Some(ev.total_borrowed),
                Some(ev.borrow_rate_bps),
                Some(ev.lp_apr_bps),
                None,
            )
        }),
        "FlashLoanBorrowed" => vault_from(ctx, batch, |_, ev: FlashLoanBorrowed| {
            (
                ev.vault_id.to_string(),
                None,
                Some(ev.borrower.to_string()),
                Some(ev.amount),
                None,
                None,
                None,
                None,
                None,
                None,
            )
        }),
        "FlashLoanRepaid" => vault_from(ctx, batch, |_, ev: FlashLoanRepaid| {
            (
                ev.vault_id.to_string(),
                None,
                None,
                Some(ev.amount),
                None,
                None,
                None,
                None,
                None,
                None,
            )
        }),
        "InsuranceFundSkimmed" => vault_from(ctx, batch, |_, ev: InsuranceFundSkimmed| {
            let vault_share = ev.amount * 8_000 / 10_000;
            (
                ev.vault_id.to_string(),
                Some(ev.account_id.to_string()),
                None,
                Some(ev.amount),
                None,
                None,
                None,
                None,
                None,
                Some(vault_share),
            )
        }),
        "ProtocolFeeDistributed" => vault_from(ctx, batch, |_, ev: ProtocolFeeDistributed| {
            let insurance_delta = if ev.fee_source == FEE_SOURCE_LIQUIDATION {
                Some(ev.vault_amount)
            } else {
                None
            };
            (
                ev.vault_id.to_string(),
                None,
                Some(ev.keeper.to_string()),
                Some(ev.total_amount),
                None,
                None,
                None,
                None,
                None,
                insurance_delta,
            )
        }),
        "FeeCollectorWithdrawn" => {
            if let Some(ev) = try_parse::<FeeCollectorWithdrawn>(ctx.event.contents.as_slice()) {
                // vault_id indexes the fee collector object for collector balance history.
                batch.vaults.push(NewVaultSnapshot {
                    event_digest: ctx.event_digest.to_string(),
                    vault_id: ev.fee_collector_id.to_string(),
                    event_type: ctx.event_name.to_string(),
                    timestamp_ms: ctx.timestamp_ms,
                    nav: Some(ev.balance_after as i64),
                    utilization_bps: None,
                    total_borrowed: None,
                    borrow_rate_bps: None,
                    lp_apr_bps: None,
                    amount: Some(ev.amount as i64),
                    account_id: Some(ev.fee_collector_id.to_string()),
                    owner: Some(ev.recipient.to_string()),
                    payload: ctx.parsed_json.clone(),
                    insurance_fund_delta: None,
                });
            }
        }
        "DebtBorrowed" => {
            if let Some(ev) = try_parse::<DebtBorrowed>(ctx.event.contents.as_slice()) {
                batch.debt_repaid.push(DebtRepaidPatch {
                    account_id: ev.account_id.to_string(),
                    remaining_debt: ev.borrowed_quote_after as i64,
                    updated_at_ms: ctx.timestamp_ms,
                });
                timeline(batch, ctx, ev.account_id.to_string(), Some(ev.owner.to_string()));
            }
        }
        "DebtRepaid" => {
            if let Some(ev) = try_parse::<DebtRepaid>(ctx.event.contents.as_slice()) {
                batch.debt_repaid.push(DebtRepaidPatch {
                    account_id: ev.account_id.to_string(),
                    remaining_debt: ev.remaining_debt as i64,
                    updated_at_ms: ctx.timestamp_ms,
                });
                timeline(batch, ctx, ev.account_id.to_string(), Some(ev.owner.to_string()));
            }
        }
        "ProxyAccountingSynced" => {
            if let Some(ev) = try_parse::<ProxyAccountingSynced>(ctx.event.contents.as_slice()) {
                batch.debt_repaid.push(DebtRepaidPatch {
                    account_id: ev.account_id.to_string(),
                    remaining_debt: ev.borrowed_quote as i64,
                    updated_at_ms: ctx.timestamp_ms,
                });
                timeline(batch, ctx, ev.account_id.to_string(), None);
            }
        }
        "KeyBorrowUpdated" => {
            if let Some(ev) = try_parse::<KeyBorrowUpdated>(ctx.event.contents.as_slice()) {
                let pk = position_key(
                    &ev.oracle_id.to_string(),
                    ev.expiry_ms as i64,
                    ev.strike as i64,
                    ev.higher_strike as i64,
                    ev.is_up,
                    ev.is_range,
                );
                batch.key_borrow_patches.push(KeyBorrowPatch {
                    position_key: pk,
                    account_id: ev.account_id.to_string(),
                    key_borrowed_quote: ev.key_borrowed_quote as i64,
                });
                timeline(batch, ctx, ev.account_id.to_string(), Some(ev.owner.to_string()));
            }
        }
        "BadDebtWrittenOff" => {
            if let Some(ev) = try_parse::<BadDebtWrittenOff>(ctx.event.contents.as_slice()) {
                ensure_market(
                    batch,
                    &ev.oracle_id.to_string(),
                    ev.expiry_ms as i64,
                    ev.strike as i64,
                    ev.higher_strike as i64,
                    ev.is_up,
                    ev.is_range,
                    ctx.timestamp_ms,
                );
                let pk = position_key(
                    &ev.oracle_id.to_string(),
                    ev.expiry_ms as i64,
                    ev.strike as i64,
                    ev.higher_strike as i64,
                    ev.is_up,
                    ev.is_range,
                );
                batch.key_borrow_patches.push(KeyBorrowPatch {
                    position_key: pk.clone(),
                    account_id: ev.account_id.to_string(),
                    key_borrowed_quote: 0,
                });
                batch.debt_repaid.push(DebtRepaidPatch {
                    account_id: ev.account_id.to_string(),
                    remaining_debt: 0,
                    updated_at_ms: ctx.timestamp_ms,
                });
                if ev.socialized > 0 {
                    batch.position_closes.push(PositionClosePatch {
                        position_key: pk.clone(),
                        account_id: ev.account_id.to_string(),
                        quantity: 0,
                        payout: 0,
                        settled: true,
                        closed_at_ms: ctx.timestamp_ms,
                        remaining_borrow_quote: 0,
                    });
                    batch.liquidation_positions.push(LiquidationPositionPatch {
                        position_key: pk.clone(),
                        account_id: ev.account_id.to_string(),
                        closed_at_ms: ctx.timestamp_ms,
                        had_position_redeem: true,
                        event_digest: ctx.event_digest.to_string(),
                        keeper: ev.keeper.to_string(),
                    });
                    batch.liquidations.push(NewLiquidation {
                        event_digest: ctx.event_digest.to_string(),
                        position_key: pk,
                        account_id: ev.account_id.to_string(),
                        owner: ev.owner.to_string(),
                        keeper: ev.keeper.to_string(),
                        debt_repaid: ev.insurance_covered as i64 + ev.socialized as i64,
                        surplus_quote: 0,
                        health_bps: 0,
                        had_position_redeem: true,
                        timestamp_ms: ctx.timestamp_ms,
                        event_kind: "bad_debt".into(),
                    });
                }
                timeline(batch, ctx, ev.account_id.to_string(), Some(ev.owner.to_string()));
            }
        }
        "PositionForceDeleveraged" => {
            if let Some(ev) = try_parse::<PositionForceDeleveraged>(ctx.event.contents.as_slice()) {
                ensure_market(
                    batch,
                    &ev.oracle_id.to_string(),
                    ev.expiry_ms as i64,
                    ev.strike as i64,
                    ev.higher_strike as i64,
                    ev.is_up,
                    ev.is_range,
                    ctx.timestamp_ms,
                );
                let pk = position_key(
                    &ev.oracle_id.to_string(),
                    ev.expiry_ms as i64,
                    ev.strike as i64,
                    ev.higher_strike as i64,
                    ev.is_up,
                    ev.is_range,
                );
                batch.liquidations.push(NewLiquidation {
                    event_digest: ctx.event_digest.to_string(),
                    position_key: pk.clone(),
                    account_id: ev.account_id.to_string(),
                    owner: ev.owner.to_string(),
                    keeper: ev.keeper.to_string(),
                    debt_repaid: 0,
                    surplus_quote: ev.payout as i64,
                    health_bps: 0,
                    had_position_redeem: ev.redeemed_quantity > 0,
                    timestamp_ms: ctx.timestamp_ms,
                    event_kind: "force_deleverage".into(),
                });
                timeline(batch, ctx, ev.account_id.to_string(), Some(ev.owner.to_string()));
            }
        }
        "PositionLiquidated" => {
            if let Some(ev) = try_parse::<PositionLiquidated>(ctx.event.contents.as_slice()) {
                ensure_market(
                    batch,
                    &ev.oracle_id.to_string(),
                    ev.expiry_ms as i64,
                    ev.strike as i64,
                    ev.higher_strike as i64,
                    ev.is_up,
                    ev.is_range,
                    ctx.timestamp_ms,
                );
                let pk = position_key(
                    &ev.oracle_id.to_string(),
                    ev.expiry_ms as i64,
                    ev.strike as i64,
                    ev.higher_strike as i64,
                    ev.is_up,
                    ev.is_range,
                );
                batch.liquidations.push(NewLiquidation {
                    event_digest: ctx.event_digest.to_string(),
                    position_key: pk.clone(),
                    account_id: ev.account_id.to_string(),
                    owner: ev.owner.to_string(),
                    keeper: ev.keeper.to_string(),
                    debt_repaid: ev.debt_repaid as i64,
                    surplus_quote: ev.surplus_quote as i64,
                    health_bps: ev.health_bps as i64,
                    had_position_redeem: ev.had_position_redeem,
                    timestamp_ms: ctx.timestamp_ms,
                    event_kind: "liquidation".into(),
                });
                batch.liquidation_positions.push(LiquidationPositionPatch {
                    position_key: pk,
                    account_id: ev.account_id.to_string(),
                    closed_at_ms: ctx.timestamp_ms,
                    had_position_redeem: ev.had_position_redeem,
                    event_digest: ctx.event_digest.to_string(),
                    keeper: ev.keeper.to_string(),
                });
                timeline(batch, ctx, ev.account_id.to_string(), Some(ev.owner.to_string()));
            }
        }
        "TriggersUpdated" => {
            if let Some(ev) = try_parse::<TriggersUpdated>(ctx.event.contents.as_slice()) {
                batch.triggers.push(NewPositionTrigger {
                    account_id: ev.account_id.to_string(),
                    oracle_id: ev.oracle_id.to_string(),
                    is_range: ev.is_range,
                    take_profit_premium: ev.take_profit_premium as i64,
                    stop_loss_premium: ev.stop_loss_premium as i64,
                    active: true,
                    updated_at_ms: ctx.timestamp_ms,
                });
                timeline(batch, ctx, ev.account_id.to_string(), None);
            }
        }
        "TriggersCleared" => {
            if let Some(ev) = try_parse::<TriggersCleared>(ctx.event.contents.as_slice()) {
                batch.triggers.push(NewPositionTrigger {
                    account_id: ev.account_id.to_string(),
                    oracle_id: ev.oracle_id.to_string(),
                    is_range: ev.is_range,
                    take_profit_premium: 0,
                    stop_loss_premium: 0,
                    active: false,
                    updated_at_ms: ctx.timestamp_ms,
                });
                timeline(batch, ctx, ev.account_id.to_string(), None);
            }
        }
        "ExecutorRegistered" => {
            if let Some(ev) = try_parse::<ExecutorRegistered>(ctx.event.contents.as_slice()) {
                batch.executors.push(NewProxyExecutor {
                    account_id: ev.account_id.to_string(),
                    executor: ev.executor.to_string(),
                    active: true,
                    registered_at_ms: ctx.timestamp_ms,
                    revoked_at_ms: None,
                });
                timeline(batch, ctx, ev.account_id.to_string(), None);
            }
        }
        "ExecutorRevoked" => {
            if let Some(ev) = try_parse::<ExecutorRevoked>(ctx.event.contents.as_slice()) {
                batch.executors.push(NewProxyExecutor {
                    account_id: ev.account_id.to_string(),
                    executor: ev.executor.to_string(),
                    active: false,
                    registered_at_ms: 0,
                    revoked_at_ms: Some(ctx.timestamp_ms),
                });
                timeline(batch, ctx, ev.account_id.to_string(), None);
            }
        }
        _ => {}
    }
}

fn upsert_proxy(
    batch: &mut LeverxBatch,
    account_id: &str,
    owner: &str,
    predict_manager_id: Option<String>,
    ts: i64,
) {
    if let Some(manager_id) = predict_manager_id.as_deref() {
        ensure_predict_manager(batch, manager_id, Some(owner), Some(account_id), ts);
    }
    batch.proxies.push(NewUserProxy {
        account_id: account_id.to_string(),
        owner: owner.to_string(),
        predict_manager_id,
        borrowed_quote: 0,
        created_at_ms: ts,
        updated_at_ms: ts,
    });
}

fn timeline(batch: &mut LeverxBatch, ctx: EventContext<'_>, account_id: String, owner: Option<String>) {
    batch.timeline.push(NewAccountTimeline {
        event_digest: ctx.event_digest.to_string(),
        account_id,
        owner,
        event_type: ctx.event_name.to_string(),
        timestamp_ms: ctx.timestamp_ms,
        payload: ctx.parsed_json.clone(),
    });
}

fn vault_from<T: serde::de::DeserializeOwned>(
    ctx: EventContext<'_>,
    batch: &mut LeverxBatch,
    map: impl FnOnce(
        &EventContext<'_>,
        T,
    ) -> (
        String,
        Option<String>,
        Option<String>,
        Option<u64>,
        Option<u64>,
        Option<u64>,
        Option<u64>,
        Option<u64>,
        Option<u64>,
        Option<u64>,
    ),
) {
    if let Some(ev) = try_parse::<T>(ctx.event.contents.as_slice()) {
        let (
            vault_id,
            account_id,
            owner,
            amount,
            nav,
            util,
            borrowed,
            borrow_rate,
            lp_apr,
            insurance_fund_delta,
        ) = map(&ctx, ev);
        let mut payload = ctx.parsed_json.clone();
        if let Some(source) = payload.get("fee_source").and_then(|v| v.as_u64()) {
            if let Some(obj) = payload.as_object_mut() {
                obj.insert(
                    "fee_source_label".into(),
                    serde_json::Value::String(fee_source_label(source as u8).into()),
                );
            }
        }
        batch.vaults.push(NewVaultSnapshot {
            event_digest: ctx.event_digest.to_string(),
            vault_id,
            event_type: ctx.event_name.to_string(),
            timestamp_ms: ctx.timestamp_ms,
            nav: nav.map(|v| v as i64),
            utilization_bps: util.map(|v| v as i64),
            total_borrowed: borrowed.map(|v| v as i64),
            borrow_rate_bps: borrow_rate.map(|v| v as i64),
            lp_apr_bps: lp_apr.map(|v| v as i64),
            amount: amount.map(|v| v as i64),
            account_id,
            owner,
            payload,
            insurance_fund_delta: insurance_fund_delta.map(|v| v as i64),
        });
    }
}

pub fn build_event_context<'a>(
    event_name: &'a str,
    event_digest: &'a str,
    tx_digest: &'a str,
    checkpoint: i64,
    timestamp_ms: i64,
    event: &'a Event,
) -> EventContext<'a> {
    let parsed_json = parse_event_json(event_name, event.contents.as_slice());
    EventContext {
        event_name,
        event_digest,
        tx_digest,
        checkpoint,
        timestamp_ms,
        event,
        parsed_json,
    }
}

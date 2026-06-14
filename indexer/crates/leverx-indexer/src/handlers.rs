use std::collections::{HashMap, HashSet};
use std::sync::Arc;

use anyhow::Result;
use diesel::dsl::sql;
use diesel::sql_types::{BigInt, Nullable};
use diesel::upsert::excluded;
use diesel::ExpressionMethods;
use diesel::QueryDsl;
use diesel_async::RunQueryDsl;
use leverx_schema::models::{
    NewAccountTimeline, NewGlobalMarketTrade, NewLeverxEvent, NewLimitMintOrder,
    NewLeveragedPosition, NewLiquidation, NewMarket, NewMarketTrade, NewPositionTrigger,
    NewPredictManager, NewProtocolSettings, NewProxyExecutor, NewUserPoints, NewUserProxy,
    NewVaultSnapshot,
};
use leverx_schema::schema::{
    account_timeline, global_market_trades, leverx_events, limit_mint_orders, leveraged_positions,
    liquidations, market_trades, markets, position_triggers, predict_managers, protocol_settings,
    proxy_executors, user_points, user_proxies, vault_snapshots,
};
use sui_indexer_alt_framework::pipeline::Processor;
use sui_indexer_alt_framework::pipeline::sequential::Handler;
use sui_indexer_alt_framework::postgres::{Connection, Db};
use sui_indexer_alt_framework::types::full_checkpoint_content::Checkpoint;
use sui_types::event::Event;
use sui_types::effects::TransactionEffectsAPI;

use crate::config::LeverxConfig;
use crate::predict_events::{is_predict_manager_event, is_predict_trade_event};
use crate::predict_projections::{apply_predict_event, build_predict_event_context};
use crate::projections::{apply_event, build_event_context};

#[derive(Default)]
pub struct LeverxBatch {
    pub events: Vec<NewLeverxEvent>,
    pub markets: Vec<NewMarket>,
    pub predict_managers: Vec<NewPredictManager>,
    pub timeline: Vec<NewAccountTimeline>,
    pub proxies: Vec<NewUserProxy>,
    pub limit_placed: Vec<NewLimitMintOrder>,
    pub limit_executed: Vec<LimitExecutePatch>,
    pub limit_cancelled: Vec<LimitCancelPatch>,
    pub positions_open: Vec<PositionOpenPatch>,
    pub position_closes: Vec<PositionClosePatch>,
    pub trades: Vec<NewMarketTrade>,
    pub global_trades: Vec<NewGlobalMarketTrade>,
    pub vaults: Vec<NewVaultSnapshot>,
    pub debt_repaid: Vec<DebtRepaidPatch>,
    pub protocol_settings: Vec<NewProtocolSettings>,
    pub triggers: Vec<NewPositionTrigger>,
    pub executors: Vec<NewProxyExecutor>,
    pub liquidations: Vec<NewLiquidation>,
    pub liquidation_positions: Vec<LiquidationPositionPatch>,
    pub key_borrow_patches: Vec<KeyBorrowPatch>,
    pub borrow_rate_patches: Vec<BorrowRatePatch>,
    pub trading_paused_patches: Vec<TradingPausedPatch>,
    pub liquidation_bps_patches: Vec<LiquidationBpsPatch>,
    pub points_patches: Vec<UserPointsPatch>,
}

#[derive(Clone)]
pub struct UserPointsPatch {
    pub owner: String,
    pub account_id: Option<String>,
    pub volume_delta: i64,
    pub trade_delta: i64,
    pub timestamp_ms: i64,
}

pub struct LimitExecutePatch {
    pub account_id: String,
    pub position_key: String,
    pub order_expires_ms: i64,
    pub executed_event_digest: String,
    pub filled_at_ms: i64,
    pub market_ask_at_fill: i64,
    pub mint_cost: i64,
    pub executor: String,
}

pub struct LimitCancelPatch {
    pub account_id: String,
    pub position_key: String,
    pub order_expires_ms: i64,
    pub cancelled_event_digest: String,
    pub cancelled_at_ms: i64,
    pub cancelled_by: String,
}

pub struct PositionOpenPatch {
    pub event_digest: String,
    pub row: NewLeveragedPosition,
}

pub struct PositionClosePatch {
    pub event_digest: String,
    pub position_key: String,
    pub account_id: String,
    pub quantity: i64,
    pub payout: i64,
    pub debt_repaid: i64,
    pub surplus_quote: i64,
    pub closing_mark: Option<i64>,
    pub settled: bool,
    pub closed_at_ms: i64,
    pub remaining_borrow_quote: i64,
}

#[derive(Clone)]
pub struct DebtRepaidPatch {
    pub event_digest: String,
    pub account_id: String,
    pub remaining_debt: i64,
    pub updated_at_ms: i64,
}

pub struct LiquidationPositionPatch {
    pub position_key: String,
    pub account_id: String,
    pub closed_at_ms: i64,
    pub had_position_redeem: bool,
    pub event_digest: String,
    pub keeper: String,
}

pub struct KeyBorrowPatch {
    pub event_digest: String,
    pub position_key: String,
    pub account_id: String,
    pub key_borrowed_quote: i64,
    /// When `None`, leave `leverage_bps` unchanged (legacy events).
    pub leverage_bps: Option<i64>,
}

pub struct BorrowRatePatch {
    pub vault_id: String,
    pub base_rate_bps: i64,
    pub kink_utilization_bps: i64,
    pub slope1_bps: i64,
    pub slope2_bps: i64,
    pub flash_fee_bps: i64,
    pub updated_at_ms: i64,
}

pub struct TradingPausedPatch {
    pub registry_id: String,
    pub paused: bool,
    pub updated_at_ms: i64,
}

pub struct LiquidationBpsPatch {
    pub registry_id: String,
    pub liquidation_bps: i64,
    pub updated_at_ms: i64,
}

pub struct LeverxEventsHandler {
    pub config: Arc<LeverxConfig>,
}

impl LeverxEventsHandler {
    fn is_leverx_event(&self, event: &Event) -> bool {
        event.package_id == self.config.package_id
            && event.type_.module.as_str() == "events"
    }

    fn is_predict_trade_event(&self, event: &Event) -> bool {
        event.package_id == self.config.predict_package_id
            && event.type_.module.as_str() == "predict"
            && is_predict_trade_event(event.type_.name.as_str())
    }

    fn is_predict_manager_event(&self, event: &Event) -> bool {
        event.package_id == self.config.predict_package_id
            && event.type_.module.as_str() == "predict_manager"
            && is_predict_manager_event(event.type_.name.as_str())
    }
}

fn dedupe_markets(rows: &[NewMarket]) -> Vec<NewMarket> {
    let mut by_key: HashMap<String, NewMarket> = HashMap::new();
    for row in rows {
        by_key
            .entry(row.market_key.clone())
            .and_modify(|existing| {
                if row.updated_at_ms > existing.updated_at_ms {
                    *existing = row.clone();
                }
            })
            .or_insert_with(|| row.clone());
    }
    by_key.into_values().collect()
}

fn dedupe_predict_managers(rows: &[NewPredictManager]) -> Vec<NewPredictManager> {
    let mut by_id: HashMap<String, NewPredictManager> = HashMap::new();
    for row in rows {
        by_id
            .entry(row.manager_id.clone())
            .and_modify(|existing| {
                if row.updated_at_ms >= existing.updated_at_ms {
                    if row.owner.is_some() {
                        existing.owner = row.owner.clone();
                    }
                    if row.account_id.is_some() {
                        existing.account_id = row.account_id.clone();
                    }
                    existing.updated_at_ms = row.updated_at_ms;
                }
            })
            .or_insert_with(|| row.clone());
    }
    by_id.into_values().collect()
}

fn dedupe_debt_patches(rows: &[DebtRepaidPatch]) -> Vec<DebtRepaidPatch> {
    let mut by_account: HashMap<String, DebtRepaidPatch> = HashMap::new();
    for row in rows {
        by_account
            .entry(row.account_id.clone())
            .and_modify(|existing| {
                if row.updated_at_ms >= existing.updated_at_ms {
                    *existing = row.clone();
                }
            })
            .or_insert_with(|| row.clone());
    }
    by_account.into_values().collect()
}

fn dedupe_points_patches(rows: &[UserPointsPatch]) -> Vec<UserPointsPatch> {
    let mut by_owner: HashMap<String, UserPointsPatch> = HashMap::new();
    for row in rows {
        by_owner
            .entry(row.owner.clone())
            .and_modify(|existing| {
                existing.volume_delta += row.volume_delta;
                existing.trade_delta += row.trade_delta;
                if row.timestamp_ms > existing.timestamp_ms {
                    existing.timestamp_ms = row.timestamp_ms;
                }
                if row.account_id.is_some() {
                    existing.account_id = row.account_id.clone();
                }
            })
            .or_insert_with(|| row.clone());
    }
    by_owner.into_values().collect()
}

#[async_trait::async_trait]
impl Processor for LeverxEventsHandler {
    const NAME: &'static str = "leverx_events";

    type Value = LeverxBatch;

    async fn process(&self, checkpoint: &Arc<Checkpoint>) -> Result<Vec<Self::Value>> {
        let checkpoint_seq = checkpoint.summary.sequence_number as i64;
        let timestamp_ms = checkpoint.summary.timestamp_ms as i64;
        let mut batch = LeverxBatch::default();

        for tx in &checkpoint.transactions {
            let tx_digest = tx.effects.transaction_digest().to_string();
            let Some(events) = tx.events.as_ref() else {
                continue;
            };

            for (event_seq, event) in events.data.iter().enumerate() {
                let event_name = event.type_.name.as_str();
                let event_digest = format!("{tx_digest}:{event_seq}");

                if self.is_leverx_event(event) {
                    let ctx = build_event_context(
                        event_name,
                        &event_digest,
                        &tx_digest,
                        checkpoint_seq,
                        timestamp_ms,
                        event,
                    );
                    apply_event(&mut batch, ctx);
                } else if self.is_predict_trade_event(event) || self.is_predict_manager_event(event)
                {
                    let ctx = build_predict_event_context(
                        event_name,
                        &event_digest,
                        &tx_digest,
                        checkpoint_seq,
                        timestamp_ms,
                        event,
                    );
                    apply_predict_event(&mut batch, ctx);
                }
            }
        }

        Ok(vec![batch])
    }
}

#[async_trait::async_trait]
impl Handler for LeverxEventsHandler {
    type Store = Db;
    type Batch = LeverxBatch;

    fn batch(&self, batch: &mut Self::Batch, values: std::vec::IntoIter<Self::Value>) {
        for v in values {
            batch.events.extend(v.events);
            batch.markets.extend(v.markets);
            batch.predict_managers.extend(v.predict_managers);
            batch.timeline.extend(v.timeline);
            batch.proxies.extend(v.proxies);
            batch.limit_placed.extend(v.limit_placed);
            batch.limit_executed.extend(v.limit_executed);
            batch.limit_cancelled.extend(v.limit_cancelled);
            batch.positions_open.extend(v.positions_open);
            batch.position_closes.extend(v.position_closes);
            batch.trades.extend(v.trades);
            batch.global_trades.extend(v.global_trades);
            batch.vaults.extend(v.vaults);
            batch.debt_repaid.extend(v.debt_repaid);
            batch.protocol_settings.extend(v.protocol_settings);
            batch.triggers.extend(v.triggers);
            batch.executors.extend(v.executors);
            batch.liquidations.extend(v.liquidations);
            batch.liquidation_positions.extend(v.liquidation_positions);
            batch.key_borrow_patches.extend(v.key_borrow_patches);
            batch.borrow_rate_patches.extend(v.borrow_rate_patches);
            batch.trading_paused_patches.extend(v.trading_paused_patches);
            batch.liquidation_bps_patches.extend(v.liquidation_bps_patches);
            batch.points_patches.extend(v.points_patches);
        }
    }

    async fn commit<'a>(&self, batch: &Self::Batch, conn: &mut Connection<'a>) -> Result<usize> {
        let mut rows = 0usize;

        diesel::sql_query("SET CONSTRAINTS ALL DEFERRED")
            .execute(conn)
            .await?;

        let fresh_event_digests: HashSet<String> = if batch.events.is_empty() {
            HashSet::new()
        } else {
            diesel::insert_into(leverx_events::table)
                .values(&batch.events)
                .on_conflict(leverx_events::event_digest)
                .do_nothing()
                .returning(leverx_events::event_digest)
                .get_results::<String>(conn)
                .await?
                .into_iter()
                .collect()
        };
        rows += fresh_event_digests.len();

        let market_rows = dedupe_markets(&batch.markets);
        if !market_rows.is_empty() {
            rows += diesel::insert_into(markets::table)
                .values(&market_rows)
                .on_conflict(markets::market_key)
                .do_update()
                .set(markets::updated_at_ms.eq(excluded(markets::updated_at_ms)))
                .execute(conn)
                .await?;
        }

        if !batch.proxies.is_empty() {
            rows += diesel::insert_into(user_proxies::table)
                .values(&batch.proxies)
                .on_conflict(user_proxies::account_id)
                .do_update()
                .set((
                    user_proxies::owner.eq(excluded(user_proxies::owner)),
                    user_proxies::predict_manager_id
                        .eq(excluded(user_proxies::predict_manager_id)),
                    user_proxies::updated_at_ms.eq(excluded(user_proxies::updated_at_ms)),
                ))
                .execute(conn)
                .await?;
        }

        let manager_rows = dedupe_predict_managers(&batch.predict_managers);
        if !manager_rows.is_empty() {
            rows += diesel::insert_into(predict_managers::table)
                .values(&manager_rows)
                .on_conflict(predict_managers::manager_id)
                .do_update()
                .set((
                    predict_managers::owner.eq(excluded(predict_managers::owner)),
                    predict_managers::account_id.eq(excluded(predict_managers::account_id)),
                    predict_managers::updated_at_ms.eq(excluded(predict_managers::updated_at_ms)),
                ))
                .execute(conn)
                .await?;
        }

        for proxy in &batch.proxies {
            if let Some(manager_id) = &proxy.predict_manager_id {
                rows += diesel::update(
                    predict_managers::table.filter(predict_managers::manager_id.eq(manager_id)),
                )
                .set((
                    predict_managers::account_id.eq(&proxy.account_id),
                    predict_managers::owner.eq(&proxy.owner),
                    predict_managers::updated_at_ms.eq(proxy.updated_at_ms),
                ))
                .execute(conn)
                .await?;
            }
        }

        if !batch.timeline.is_empty() {
            rows += diesel::insert_into(account_timeline::table)
                .values(&batch.timeline)
                .on_conflict(account_timeline::event_digest)
                .do_nothing()
                .execute(conn)
                .await?;
        }

        if !batch.limit_placed.is_empty() {
            rows += diesel::insert_into(limit_mint_orders::table)
                .values(&batch.limit_placed)
                .on_conflict(limit_mint_orders::placed_event_digest)
                .do_nothing()
                .execute(conn)
                .await?;
        }

        for patch in &batch.limit_executed {
            rows += diesel::update(
                limit_mint_orders::table
                    .filter(limit_mint_orders::account_id.eq(&patch.account_id))
                    .filter(limit_mint_orders::position_key.eq(&patch.position_key))
                    .filter(limit_mint_orders::order_expires_ms.eq(patch.order_expires_ms))
                    .filter(limit_mint_orders::status.eq("open")),
            )
            .set((
                limit_mint_orders::status.eq("executed"),
                limit_mint_orders::executed_event_digest.eq(&patch.executed_event_digest),
                limit_mint_orders::filled_at_ms.eq(patch.filled_at_ms),
                limit_mint_orders::market_ask_at_fill.eq(patch.market_ask_at_fill),
                limit_mint_orders::mint_cost.eq(patch.mint_cost),
                limit_mint_orders::executor.eq(&patch.executor),
            ))
            .execute(conn)
            .await?;
        }

        for patch in &batch.limit_cancelled {
            rows += diesel::update(
                limit_mint_orders::table
                    .filter(limit_mint_orders::account_id.eq(&patch.account_id))
                    .filter(limit_mint_orders::position_key.eq(&patch.position_key))
                    .filter(limit_mint_orders::order_expires_ms.eq(patch.order_expires_ms))
                    .filter(limit_mint_orders::status.eq("open")),
            )
            .set((
                limit_mint_orders::status.eq("cancelled"),
                limit_mint_orders::cancelled_event_digest.eq(&patch.cancelled_event_digest),
                limit_mint_orders::cancelled_at_ms.eq(patch.cancelled_at_ms),
                limit_mint_orders::cancelled_by.eq(&patch.cancelled_by),
            ))
            .execute(conn)
            .await?;
        }

        for close in &batch.position_closes {
            if !fresh_event_digests.contains(&close.event_digest) {
                continue;
            }
            rows += diesel::sql_query(
                "UPDATE leveraged_positions SET \
                 open_quantity = CASE \
                   WHEN GREATEST(open_quantity - $1, 0) <= 0 THEN open_quantity \
                   ELSE GREATEST(open_quantity - $1, 0) \
                 END, \
                 realized_payout = realized_payout + $2, \
                 borrow_quote = $3, \
                 margin_quote = CASE \
                   WHEN GREATEST(open_quantity - $1, 0) <= 0 THEN margin_quote \
                   ELSE (margin_quote * GREATEST(open_quantity - $1, 0) / GREATEST(open_quantity, 1)) \
                 END, \
                 mint_cost = CASE \
                   WHEN GREATEST(open_quantity - $1, 0) <= 0 THEN mint_cost \
                   ELSE (mint_cost * GREATEST(open_quantity - $1, 0) / GREATEST(open_quantity, 1)) \
                 END, \
                 closing_mark = CASE \
                   WHEN GREATEST(open_quantity - $1, 0) <= 0 AND open_quantity > 0 AND (realized_payout + $2) > 0 THEN \
                     ((realized_payout + $2) * 1000000000 + open_quantity - 1) / open_quantity \
                   WHEN $10 IS NOT NULL AND $10 > 0 THEN $10 \
                   ELSE closing_mark \
                 END, \
                 close_debt_repaid = close_debt_repaid + $8, \
                 close_interest_paid = close_interest_paid + ($8 - GREATEST(borrow_quote - $3, 0)), \
                 close_surplus_quote = close_surplus_quote + $9, \
                 status = CASE \
                   WHEN GREATEST(open_quantity - $1, 0) <= 0 THEN CASE WHEN $7 THEN 'settled' ELSE 'closed' END \
                   ELSE 'open' \
                 END, \
                 closed_at_ms = CASE WHEN GREATEST(open_quantity - $1, 0) <= 0 THEN $4 ELSE NULL END \
                 WHERE position_key = $5 AND account_id = $6",
            )
            .bind::<diesel::sql_types::BigInt, _>(close.quantity)
            .bind::<diesel::sql_types::BigInt, _>(close.payout)
            .bind::<diesel::sql_types::BigInt, _>(close.remaining_borrow_quote)
            .bind::<diesel::sql_types::BigInt, _>(close.closed_at_ms)
            .bind::<diesel::sql_types::Text, _>(&close.position_key)
            .bind::<diesel::sql_types::Text, _>(&close.account_id)
            .bind::<diesel::sql_types::Bool, _>(close.settled)
            .bind::<diesel::sql_types::BigInt, _>(close.debt_repaid)
            .bind::<diesel::sql_types::BigInt, _>(close.surplus_quote)
            .bind::<diesel::sql_types::Nullable<diesel::sql_types::BigInt>, _>(close.closing_mark)
            .execute(conn)
            .await?;
        }

        for patch in &batch.positions_open {
            if !fresh_event_digests.contains(&patch.event_digest) {
                continue;
            }
            let pos = &patch.row;
            if pos.open_quantity <= 0 {
                continue;
            }
            rows += diesel::insert_into(leveraged_positions::table)
                .values(pos)
                .on_conflict((leveraged_positions::position_key, leveraged_positions::account_id))
                .do_update()
                .set((
                    leveraged_positions::owner.eq(excluded(leveraged_positions::owner)),
                    leveraged_positions::predict_manager_id
                        .eq(excluded(leveraged_positions::predict_manager_id)),
                    leveraged_positions::open_quantity.eq(sql::<BigInt>(
                        "CASE WHEN leveraged_positions.status != 'open' \
                         THEN excluded.open_quantity \
                         ELSE leveraged_positions.open_quantity + excluded.open_quantity END",
                    )),
                    leveraged_positions::margin_quote.eq(sql::<BigInt>(
                        "CASE WHEN leveraged_positions.status != 'open' \
                         THEN excluded.margin_quote \
                         ELSE leveraged_positions.margin_quote + excluded.margin_quote END",
                    )),
                    leveraged_positions::borrow_quote.eq(sql::<BigInt>(
                        "CASE WHEN leveraged_positions.status != 'open' \
                         THEN excluded.borrow_quote \
                         ELSE leveraged_positions.borrow_quote + excluded.borrow_quote END",
                    )),
                    leveraged_positions::leverage_bps.eq(excluded(leveraged_positions::leverage_bps)),
                    leveraged_positions::mint_cost.eq(sql::<BigInt>(
                        "CASE WHEN leveraged_positions.status != 'open' \
                         THEN excluded.mint_cost \
                         ELSE leveraged_positions.mint_cost + excluded.mint_cost END",
                    )),
                    leveraged_positions::entry_mark.eq(sql::<Nullable<BigInt>>(
                        "CASE \
                         WHEN leveraged_positions.status != 'open' AND excluded.mint_cost > 0 AND excluded.open_quantity > 0 THEN \
                           (excluded.mint_cost * 1000000000 + excluded.open_quantity - 1) / excluded.open_quantity \
                         WHEN leveraged_positions.status != 'open' THEN excluded.entry_mark \
                         WHEN (leveraged_positions.mint_cost + excluded.mint_cost) > 0 \
                              AND (leveraged_positions.open_quantity + excluded.open_quantity) > 0 THEN \
                           ((leveraged_positions.mint_cost + excluded.mint_cost) * 1000000000 \
                            + leveraged_positions.open_quantity + excluded.open_quantity - 1) \
                           / (leveraged_positions.open_quantity + excluded.open_quantity) \
                         ELSE excluded.entry_mark \
                         END",
                    )),
                    leveraged_positions::last_order_type.eq(excluded(leveraged_positions::last_order_type)),
                    leveraged_positions::status.eq("open"),
                    leveraged_positions::opened_at_ms.eq(excluded(leveraged_positions::opened_at_ms)),
                    leveraged_positions::closed_at_ms.eq(None::<i64>),
                ))
                .execute(conn)
                .await?;
        }

        if !batch.trades.is_empty() {
            rows += diesel::insert_into(market_trades::table)
                .values(&batch.trades)
                .on_conflict(market_trades::event_digest)
                .do_nothing()
                .execute(conn)
                .await?;
        }

        if !batch.global_trades.is_empty() {
            rows += diesel::insert_into(global_market_trades::table)
                .values(&batch.global_trades)
                .on_conflict(global_market_trades::event_digest)
                .do_nothing()
                .execute(conn)
                .await?;
        }

        if !batch.vaults.is_empty() {
            rows += diesel::insert_into(vault_snapshots::table)
                .values(&batch.vaults)
                .on_conflict(vault_snapshots::event_digest)
                .do_nothing()
                .execute(conn)
                .await?;
        }

        let debt_rows = dedupe_debt_patches(&batch.debt_repaid);
        for debt in &debt_rows {
            if !fresh_event_digests.contains(&debt.event_digest) {
                continue;
            }
            rows += diesel::update(
                user_proxies::table.filter(user_proxies::account_id.eq(&debt.account_id)),
            )
            .set((
                user_proxies::borrowed_quote.eq(debt.remaining_debt),
                user_proxies::updated_at_ms.eq(debt.updated_at_ms),
            ))
            .execute(conn)
            .await?;
        }

        for settings in &batch.protocol_settings {
            rows += diesel::insert_into(protocol_settings::table)
                .values(settings)
                .on_conflict(protocol_settings::registry_id)
                .do_update()
                .set((
                    protocol_settings::vault_id.eq(excluded(protocol_settings::vault_id)),
                    protocol_settings::predict_id.eq(excluded(protocol_settings::predict_id)),
                    protocol_settings::fee_collector_id
                        .eq(excluded(protocol_settings::fee_collector_id)),
                    protocol_settings::liquidation_bps.eq(diesel::dsl::sql(
                        "COALESCE(EXCLUDED.liquidation_bps, protocol_settings.liquidation_bps)",
                    )),
                    protocol_settings::updated_at_ms.eq(excluded(protocol_settings::updated_at_ms)),
                ))
                .execute(conn)
                .await?;
        }

        for patch in &batch.trading_paused_patches {
            rows += diesel::insert_into(protocol_settings::table)
                .values(NewProtocolSettings {
                    registry_id: patch.registry_id.clone(),
                    vault_id: None,
                    predict_id: None,
                    fee_collector_id: None,
                    trading_paused: patch.paused,
                    base_rate_bps: None,
                    kink_utilization_bps: None,
                    slope1_bps: None,
                    slope2_bps: None,
                    flash_fee_bps: None,
                    liquidation_bps: None,
                    updated_at_ms: patch.updated_at_ms,
                })
                .on_conflict(protocol_settings::registry_id)
                .do_update()
                .set((
                    protocol_settings::trading_paused.eq(excluded(protocol_settings::trading_paused)),
                    protocol_settings::updated_at_ms.eq(excluded(protocol_settings::updated_at_ms)),
                ))
                .execute(conn)
                .await?;
        }

        for patch in &batch.liquidation_bps_patches {
            rows += diesel::insert_into(protocol_settings::table)
                .values(NewProtocolSettings {
                    registry_id: patch.registry_id.clone(),
                    vault_id: None,
                    predict_id: None,
                    fee_collector_id: None,
                    trading_paused: false,
                    base_rate_bps: None,
                    kink_utilization_bps: None,
                    slope1_bps: None,
                    slope2_bps: None,
                    flash_fee_bps: None,
                    liquidation_bps: Some(patch.liquidation_bps),
                    updated_at_ms: patch.updated_at_ms,
                })
                .on_conflict(protocol_settings::registry_id)
                .do_update()
                .set((
                    protocol_settings::liquidation_bps.eq(excluded(protocol_settings::liquidation_bps)),
                    protocol_settings::updated_at_ms.eq(excluded(protocol_settings::updated_at_ms)),
                ))
                .execute(conn)
                .await?;
        }

        for trigger in &batch.triggers {
            rows += diesel::insert_into(position_triggers::table)
                .values(trigger)
                .on_conflict((
                    position_triggers::account_id,
                    position_triggers::oracle_id,
                    position_triggers::is_range,
                ))
                .do_update()
                .set((
                    position_triggers::take_profit_premium
                        .eq(excluded(position_triggers::take_profit_premium)),
                    position_triggers::stop_loss_premium
                        .eq(excluded(position_triggers::stop_loss_premium)),
                    position_triggers::take_profit_slippage_bps
                        .eq(excluded(position_triggers::take_profit_slippage_bps)),
                    position_triggers::stop_loss_slippage_bps
                        .eq(excluded(position_triggers::stop_loss_slippage_bps)),
                    position_triggers::active.eq(excluded(position_triggers::active)),
                    position_triggers::updated_at_ms.eq(excluded(position_triggers::updated_at_ms)),
                ))
                .execute(conn)
                .await?;
        }

        for executor in &batch.executors {
            rows += diesel::insert_into(proxy_executors::table)
                .values(executor)
                .on_conflict((proxy_executors::account_id, proxy_executors::executor))
                .do_update()
                .set((
                    proxy_executors::active.eq(excluded(proxy_executors::active)),
                    proxy_executors::registered_at_ms.eq(diesel::dsl::sql(
                        "CASE WHEN EXCLUDED.active THEN EXCLUDED.registered_at_ms ELSE proxy_executors.registered_at_ms END",
                    )),
                    proxy_executors::revoked_at_ms.eq(excluded(proxy_executors::revoked_at_ms)),
                ))
                .execute(conn)
                .await?;
        }

        for patch in &batch.borrow_rate_patches {
            rows += diesel::update(
                protocol_settings::table.filter(protocol_settings::vault_id.eq(&patch.vault_id)),
            )
            .set((
                protocol_settings::base_rate_bps.eq(patch.base_rate_bps),
                protocol_settings::kink_utilization_bps.eq(patch.kink_utilization_bps),
                protocol_settings::slope1_bps.eq(patch.slope1_bps),
                protocol_settings::slope2_bps.eq(patch.slope2_bps),
                protocol_settings::flash_fee_bps.eq(patch.flash_fee_bps),
                protocol_settings::updated_at_ms.eq(patch.updated_at_ms),
            ))
            .execute(conn)
            .await?;
        }

        if !batch.liquidations.is_empty() {
            rows += diesel::insert_into(liquidations::table)
                .values(&batch.liquidations)
                .on_conflict(liquidations::event_digest)
                .do_nothing()
                .execute(conn)
                .await?;
        }

        for patch in &batch.key_borrow_patches {
            if !fresh_event_digests.contains(&patch.event_digest) {
                continue;
            }
            let filter = leveraged_positions::table
                .filter(leveraged_positions::position_key.eq(&patch.position_key))
                .filter(leveraged_positions::account_id.eq(&patch.account_id))
                .filter(leveraged_positions::status.eq("open"));
            rows += match patch.leverage_bps {
                Some(leverage) => {
                    diesel::update(filter)
                        .set((
                            leveraged_positions::borrow_quote.eq(patch.key_borrowed_quote),
                            leveraged_positions::leverage_bps.eq(leverage),
                        ))
                        .execute(conn)
                        .await?
                }
                None => {
                    diesel::update(filter)
                        .set(leveraged_positions::borrow_quote.eq(patch.key_borrowed_quote))
                        .execute(conn)
                        .await?
                }
            };
        }

        for liq in &batch.liquidation_positions {
            if !fresh_event_digests.contains(&liq.event_digest) {
                continue;
            }
            rows += diesel::sql_query(
                "UPDATE leveraged_positions SET \
                 status = 'liquidated', \
                 borrow_quote = 0, \
                 closed_at_ms = $1 \
                 WHERE position_key = $2 AND account_id = $3",
            )
            .bind::<diesel::sql_types::BigInt, _>(liq.closed_at_ms)
            .bind::<diesel::sql_types::Text, _>(&liq.position_key)
            .bind::<diesel::sql_types::Text, _>(&liq.account_id)
            .execute(conn)
            .await?;

            // Liquidation prep cancels resting limits on-chain without a separate event.
            rows += diesel::update(
                limit_mint_orders::table
                    .filter(limit_mint_orders::account_id.eq(&liq.account_id))
                    .filter(limit_mint_orders::position_key.eq(&liq.position_key))
                    .filter(limit_mint_orders::status.eq("open")),
            )
            .set((
                limit_mint_orders::status.eq("cancelled"),
                limit_mint_orders::cancelled_event_digest.eq(&liq.event_digest),
                limit_mint_orders::cancelled_at_ms.eq(liq.closed_at_ms),
                limit_mint_orders::cancelled_by.eq(&liq.keeper),
            ))
            .execute(conn)
            .await?;
        }

        let points_rows = dedupe_points_patches(&batch.points_patches);
        for patch in &points_rows {
            rows += diesel::insert_into(user_points::table)
                .values(NewUserPoints {
                    owner: patch.owner.clone(),
                    account_id: patch.account_id.clone(),
                    volume_quote: patch.volume_delta,
                    trade_count: patch.trade_delta,
                    points: patch.volume_delta,
                    first_trade_at_ms: Some(patch.timestamp_ms),
                    last_trade_at_ms: Some(patch.timestamp_ms),
                    updated_at_ms: patch.timestamp_ms,
                })
                .on_conflict(user_points::owner)
                .do_update()
                .set((
                    user_points::account_id.eq(diesel::dsl::sql(
                        "COALESCE(EXCLUDED.account_id, user_points.account_id)",
                    )),
                    user_points::volume_quote
                        .eq(user_points::volume_quote + excluded(user_points::volume_quote)),
                    user_points::trade_count
                        .eq(user_points::trade_count + excluded(user_points::trade_count)),
                    user_points::points.eq(user_points::points + excluded(user_points::points)),
                    user_points::first_trade_at_ms.eq(diesel::dsl::sql(
                        "LEAST(COALESCE(user_points.first_trade_at_ms, EXCLUDED.first_trade_at_ms), EXCLUDED.first_trade_at_ms)",
                    )),
                    user_points::last_trade_at_ms.eq(diesel::dsl::sql(
                        "GREATEST(COALESCE(user_points.last_trade_at_ms, EXCLUDED.last_trade_at_ms), EXCLUDED.last_trade_at_ms)",
                    )),
                    user_points::updated_at_ms.eq(excluded(user_points::updated_at_ms)),
                ))
                .execute(conn)
                .await?;
        }

        Ok(rows)
    }
}

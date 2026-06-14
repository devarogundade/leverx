# LeverX Indexer (Rust)

On-chain indexer for LeverX using Mysten's [`sui-indexer-alt-framework`](https://docs.sui.io/develop/accessing-data/custom-indexer/build). Streams Sui checkpoints, deserializes `leverx::events` via BCS, and writes structured Postgres tables for the app.

## Crates

| Crate | Binary | Role |
|-------|--------|------|
| `leverx-schema` | — | Diesel migrations + table models |
| `leverx-indexer` | `leverx-indexer` | Checkpoint `Processor` + `Handler` pipeline |
| `leverx-server` | `leverx-server` | Read-only HTTP API for the React app |

## Prerequisites

- Rust 1.85+
- PostgreSQL
- Deployed `LEVERX_PACKAGE_ID`

## Environment

```env
DATABASE_URL=postgres://leverx:leverx@localhost:5432/leverx_indexer
LEVERX_PACKAGE_ID=0x...
PREDICT_PACKAGE_ID=0xf5ea2b3749c65d6e56507cc35388719aadb28f9cab873696a2f8687f5c785138
PORT=3100
```

## Run (after Postgres is up)

```bash
# Indexer — migrations run on startup
cargo run -p leverx-indexer -- \
  --remote-store-url https://checkpoints.testnet.sui.io \
  --first-checkpoint <recent_seq>

# HTTP API
cargo run -p leverx-server
```

Production checkpoint sources: [Sui custom indexer build guide](https://docs.sui.io/develop/accessing-data/custom-indexer/build) (gRPC + GCS backfill).

## Indexed tables

| Table | Source events |
|-------|---------------|
| `leverx_events` | All `leverx::events` (raw + `parsed_json`) |
| `limit_mint_orders` | `LimitMintOrderPlaced/Executed/Cancelled` |
| `leveraged_positions` | `LeveragedPositionOpened/Closed`, liquidations |
| `market_trades` | LeverX opens and closes (`LeveragedPositionOpened/Closed`; limit fills share open events) |
| `global_market_trades` | Predict `mint`/`redeem` (`PositionMinted/Redeemed`, `RangeMinted/Redeemed`) |
| `GET /v1/global-markets/{oracle_id}/trades` | Merged tape: `global_market_trades` + LeverX `market_trades` (deduped per tx) |
| `markets` | Canonical market dimension (`market_key` = `position_key`) |
| `predict_managers` | Predict manager registry (`manager_id` → optional LeverX `account_id`) |
| `user_proxies` | `AccountCreated`, `PredictManagerLinked`, debt sync |
| `account_timeline` | Account-scoped activity |
| `vault_snapshots` | Vault / flash / insurance events (+ borrow/LP APR) |
| `protocol_settings` | `ProtocolDeployed`, `RegistryInitialized`, `LiquidationBpsUpdated`, pause/rate updates |
| `position_triggers` | `TriggersUpdated/Cleared` |
| `proxy_executors` | `ExecutorRegistered/Revoked` |
| `liquidations` | `PositionLiquidated`, `PositionForceDeleveraged` (`event_kind` column) |
| `user_points` | LeverX volume leaderboard (`LeveragedPositionOpened` / `LeveragedPositionClosed` only) |

## Breaking changes (contract ↔ indexer)

Resync from the publish checkpoint after upgrading contracts (`bash indexer/scripts/reset-from-publish.sh`).

| Change | Indexer impact |
|--------|----------------|
| `RegistryInitialized` adds `liquidation_bps` | BCS layout fix in `move_events.rs`; `protocol_settings.liquidation_bps` column |
| `LiquidationBpsUpdated` event | Patches `protocol_settings.liquidation_bps` |
| `InsuranceFundSkimmed` + liquidation `ProtocolFeeDistributed` | `vault_snapshots.insurance_fund_delta`; merged into vault summary |
| Surplus routed to owner (not keeper) on settle/close | `LeveragedPositionClosed.surplus_quote` reflects owner economics |
| External `predict::PositionRedeemed` (permissionless bot) | Indexer closes matching open `leveraged_positions` rows; debt unchanged until user runs LeverX settle/repay |
| Force-deleverage remint | Same-tx `LeveragedPositionClosed` → `LeveragedPositionOpened`; `PositionForceDeleveraged.reminted_quantity` |
| Closed/liquidated position snapshots | `leveraged_positions` keeps quantity, margin, leverage, mint cost, and realized payout for history |
| `vault_flash::repay_flash_liquidity` + `liquidated_account_id` | Keeper PTB only (not indexed as event) |

All events are always stored in `leverx_events` with full `parsed_json` even when projections are partial.

## Docker

Build and run the indexer + API image (from repo root):

```bash
docker build -f indexer/Dockerfile -t devarogundade/leverx-indexer:latest .
docker push devarogundade/leverx-indexer:latest
```

Required env: `DATABASE_URL`, `LEVERX_PACKAGE_ID`, `PREDICT_PACKAGE_ID`, `REMOTE_STORE_URL`, `STREAMING_URL`. Optional: `FIRST_CHECKPOINT` (set to publish tx checkpoint after a fresh deploy), `LEVERX_API_PORT` (default 3100), `METRICS_PORT` (default 9184).

After a fresh contract publish, wipe Postgres and re-index from the publish checkpoint:

```bash
bash indexer/scripts/reset-from-publish.sh
# or: docker compose -f indexer/docker-compose.ec2.yml down -v && FIRST_CHECKPOINT=348266507 docker compose -f indexer/docker-compose.ec2.yml up -d --build
```

Verify: `curl -s http://127.0.0.1:3100/v1/protocol` should return the new `registry_id` / `vault_id` from `contracts/deploy-testnet.env`.

## HTTP API (`leverx-server`)

| Endpoint | Description |
|----------|-------------|
| `GET /health` | Liveness |
| `WS /v1/ws` | Live stream (orderbook, trades, positions, limits) — see below |
| `GET /v1/markets/catalog?oracle_id&is_range` | Volume-ranked market catalog (global + LeverX trades) |
| `GET /v1/points/leaderboard?limit&offset` | LeverX volume leaderboard (leveraged open/close only) |
| `GET /v1/points/:owner` | Single trader rank + stats |
| `GET /v1/orderbook?oracle_id&expiry_ms&strike&is_up&is_range&higher_strike` | Bid depth + synthetic asks |
| `GET /v1/limit-orders?account_id&status&oracle_id&min_order_expires_ms&max_order_expires_ms` | Resting / filled limits |
| `GET /v1/positions?owner&account_id&oracle_id&status&min_borrow_quote` | Leveraged positions (`status=all` disables default open filter; `min_borrow_quote` for keeper scans) |
| `GET /v1/accounts?owner&account_id` | All user proxies |
| `GET /v1/accounts/:id` | Account + open positions/limits |
| `GET /v1/accounts/:id/timeline` | Account event timeline |
| `GET /v1/vault/:id/summary` | Latest vault snapshot |
| `GET /v1/vault/:id/history` | Vault event history |
| `GET /v1/markets/:oracleId/trades` | LeverX market trades |
| `GET /v1/global-markets/:oracleId/trades?trade_side&is_range` | Predict global mint/redeem trades |
| `GET /v1/events?event_type` | Raw indexed events |
| `GET /v1/protocol` | Protocol settings (registry, vault, fee collector, pause, borrow params, **liquidation_bps**) |
| `GET /v1/triggers?account_id` | Active take-profit / stop-loss triggers |
| `GET /v1/executors?account_id` | Active proxy executors |
| `GET /v1/liquidations?account_id&owner` | Liquidation history |

Pagination: `limit` (max 500), `offset` → `{ items, limit, offset, has_more }`.

### WebSocket (`WS /v1/ws`)

Connect from the app at `ws://<host>:3100/v1/ws` (or set `VITE_LEVERX_INDEXER_WS_URL`). The keeper HTTP proxy does not upgrade WebSockets — point the app WS URL at `leverx-server` directly when using docker.

**Client → server**

```json
{ "op": "subscribe", "channels": ["orderbook:0x…:1735689600000:95000000000:0:1:0"] }
{ "op": "unsubscribe", "channels": ["orderbook:…"] }
{ "op": "ping" }
```

**Channels**

| Channel | Snapshot / updates |
|---------|-------------------|
| `orderbook:{oracle}:{expiry}:{strike}:{higher}:{is_up}:{is_range}` | Full orderbook (`orderbook.snapshot`) |
| `trades:global:{oracle_id}` | Global mint/redeem trades (`trades.global.snapshot`) |
| `positions:{owner}` or `positions:{owner}:{oracle_id}` | Open positions (`positions.snapshot`) |
| `limits:{owner}` or `limits:{owner}:{oracle_id}` | Open limit orders (`limits.snapshot`) |

**Server → client**

- `connected` — handshake
- `subscribed` / `unsubscribed` — ack with `channels` array
- `orderbook.snapshot`, `trades.global.snapshot`, `positions.snapshot`, `limits.snapshot` — payload matches REST shapes
- `heartbeat` every 30s
- `pong` in reply to `ping`

The server polls `leverx_events` (~1s) and pushes fresh snapshots for subscribed channels when matching limit/trade/position events are indexed.

## Model relations

Parent tables and join keys (enforced with deferred FKs; see `leverx-schema/src/relations.rs`):

| Parent | Children (FK column) |
|--------|----------------------|
| `user_proxies` (`account_id`) | `limit_mint_orders`, `leveraged_positions`, `collateral_balances`, `position_triggers`, `proxy_executors`, `liquidations`, `account_timeline`, `market_trades`, `user_points` |
| `markets` (`market_key`) | `leveraged_positions` (`position_key`), `limit_mint_orders`, `market_trades`, `collateral_balances`, `liquidations`, `global_market_trades` |
| `predict_managers` (`manager_id`) | `global_market_trades` |
| `collateral_assets` (`coin_type`) | `swap_pools`, `collateral_balances` |
| `leverx_events` (`event_digest`) | All event-sourced projection rows |

`position_key` on LeverX tables and `market_key` on global trades share the encoding:
`{oracle_id}:{expiry_ms}:{strike}:{higher_strike}:{is_up}:{is_range}`.

## App integration

```env
VITE_LEVERX_INDEXER_URL=http://localhost:3100
# optional — defaults to ws://<indexer-host>/v1/ws
VITE_LEVERX_INDEXER_WS_URL=ws://localhost:3100/v1/ws
```

Client: `app/src/lib/leverx/indexer-client.ts`, `app/src/lib/leverx/indexer-ws.ts`

## Layout

```
indexer/
  crates/
    leverx-schema/     # migrations/, models, schema.rs
    leverx-indexer/    # move_events.rs, projections.rs, handlers.rs
    leverx-server/     # orderbook.rs, routes.rs, pagination.rs
```

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
| `market_trades` | LeverX opens, closes, limit fills |
| `global_market_trades` | Predict `mint`/`redeem` (`PositionMinted/Redeemed`, `RangeMinted/Redeemed`) |
| `markets` | Canonical market dimension (`market_key` = `position_key`) |
| `predict_managers` | Predict manager registry (`manager_id` → optional LeverX `account_id`) |
| `user_proxies` | `AccountCreated`, `PredictManagerLinked`, debt sync |
| `account_timeline` | Account-scoped activity |
| `vault_snapshots` | Vault / flash / insurance events (+ borrow/LP APR) |
| `collateral_assets` | `CollateralWhitelisted` |
| `swap_pools` | `SwapPoolRegistered` |
| `protocol_settings` | `ProtocolDeployed`, `RegistryInitialized`, pause/rate updates |
| `collateral_balances` | `CollateralDeposited/Withdrawn/Swapped` |
| `position_triggers` | `TriggersUpdated/Cleared` |
| `proxy_executors` | `ExecutorRegistered/Revoked` |
| `liquidations` | `PositionLiquidated` |

## HTTP API (`leverx-server`)

| Endpoint | Description |
|----------|-------------|
| `GET /health` | Liveness |
| `GET /v1/orderbook?oracle_id&expiry_ms&strike&is_up&is_range&higher_strike` | Bid depth + synthetic asks |
| `GET /v1/limit-orders?account_id&status&oracle_id` | Resting / filled limits |
| `GET /v1/positions?owner&account_id&oracle_id&status` | Leveraged positions |
| `GET /v1/accounts?owner&account_id` | All user proxies |
| `GET /v1/accounts/:id` | Account + open positions/limits |
| `GET /v1/accounts/:id/timeline` | Account event timeline |
| `GET /v1/vault/:id/summary` | Latest vault snapshot |
| `GET /v1/vault/:id/history` | Vault event history |
| `GET /v1/markets/:oracleId/trades` | LeverX market trades |
| `GET /v1/global-markets/:oracleId/trades?trade_side&is_range` | Predict global mint/redeem trades |
| `GET /v1/events?event_type` | Raw indexed events |
| `GET /v1/collateral-assets` | Whitelisted collateral catalog |
| `GET /v1/swap-pools` | DeepBook swap pool registry |
| `GET /v1/protocol` | Protocol settings (pause, Pyth age, borrow params) |
| `GET /v1/collateral-balances?account_id&position_key` | Per-position collateral balances |
| `GET /v1/triggers?account_id` | Active take-profit / stop-loss triggers |
| `GET /v1/executors?account_id` | Active proxy executors |
| `GET /v1/liquidations?account_id&owner` | Liquidation history |

Pagination: `limit` (max 500), `offset` → `{ items, limit, offset, has_more }`.

## Model relations

Parent tables and join keys (enforced with deferred FKs; see `leverx-schema/src/relations.rs`):

| Parent | Children (FK column) |
|--------|----------------------|
| `user_proxies` (`account_id`) | `limit_mint_orders`, `leveraged_positions`, `collateral_balances`, `position_triggers`, `proxy_executors`, `liquidations`, `account_timeline`, `market_trades` |
| `markets` (`market_key`) | `leveraged_positions` (`position_key`), `limit_mint_orders`, `market_trades`, `collateral_balances`, `liquidations`, `global_market_trades` |
| `predict_managers` (`manager_id`) | `global_market_trades` |
| `collateral_assets` (`coin_type`) | `swap_pools`, `collateral_balances`, `liquidations` |
| `leverx_events` (`event_digest`) | All event-sourced projection rows |

`position_key` on LeverX tables and `market_key` on global trades share the encoding:
`{oracle_id}:{expiry_ms}:{strike}:{higher_strike}:{is_up}:{is_range}`.

## App integration

```env
VITE_LEVERX_INDEXER_URL=http://localhost:3100
```

Client: `app/src/lib/leverx/indexer-client.ts`

## Layout

```
indexer/
  crates/
    leverx-schema/     # migrations/, models, schema.rs
    leverx-indexer/    # move_events.rs, projections.rs, handlers.rs
    leverx-server/     # orderbook.rs, routes.rs, pagination.rs
```

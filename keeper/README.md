# LeverX Keeper

NestJS bot that maintains the LeverX protocol off-chain:

- **Limit orders** — fill resting mint limits when market ask crosses limit + slippage; expire unfilled orders past `order_expires_ms` via `trade::expire_*_limit_mint_order`
- **Liquidation** — vault flash + permissionless redeem liquidations for underwater dUSDC keys
- **Triggers** — execute TP/SL redeems when indexed trigger premiums are hit
- **Force close** — final-hour deleverage / post-expiry debt repayment for protocol safety

Expired position settlement is **user-initiated** in the app (`settle_expired_proxy_position`). The keeper does not claim redemption payouts on behalf of users.

Also proxies `/v1/*` to `leverx-server` so the frontend can use a single URL (port `3001` in docker stack).

**Trade relay:** Users sign personal-message intents (`leverx:trade:mint:v1` / `leverx:trade:redeem:v1`); the keeper verifies the signature, confirms it is a registered executor on the user's `UserProxy`, builds the PTB, and executes with `KEEPER_PRIVATE_KEY`. Onboarding registers the keeper as executor via `register_executor_entry` (user-signed).

## Setup

```bash
cd keeper
cp .env.example .env
# Set KEEPER_PRIVATE_KEY in .env
# Start Redis (or use docker compose — includes redis)
# Edit src/config/constants.ts for deploy IDs, indexer URL, etc.
pnpm install
pnpm run start:dev
```

## Configuration

| File                      | Purpose                                                                 |
| ------------------------- | ----------------------------------------------------------------------- |
| `keeper/.env`             | `KEEPER_PRIVATE_KEY`, Redis connection, optional deploy/indexer overrides |
| `src/config/constants.ts` | Default package IDs, cron schedules, indexer URL (overridden by env when set) |

### Redis (BullMQ)

Repeatable keeper jobs run through BullMQ and require Redis. Set either:

| Variable     | Default       | Description                          |
| ------------ | ------------- | ------------------------------------ |
| `REDIS_URL`  | —             | Full Redis URL (overrides host/port) |
| `REDIS_HOST` | `127.0.0.1`   | Redis host when `REDIS_URL` is unset |
| `REDIS_PORT` | `6379`        | Redis port when `REDIS_URL` is unset |

`keeper/docker-compose.yml` starts a `redis` service and points the keeper at `redis:6379`.

Optional env vars (same names as `contracts/deploy-testnet.env` and docker-compose): `LEVERX_PACKAGE_ID`, `LEVERX_REGISTRY_ID`, `LEVERX_VAULT_ID`, `LEVERX_FEE_COLLECTOR_ID`, `PREDICT_PACKAGE_ID`, `PREDICT_ID`, `QUOTE_TYPE`, `INDEXER_URL`.

**dUSDC-only, 1×–10× leverage** — quote type `dusdc::DUSDC`, `MIN_LEVERAGE_BPS = 10_000`, `MAX_LEVERAGE_BPS = 100_000`, margin 0.1–100 dUSDC, margin call at `MARGIN_CALL_BPS = 9_500`. Leverage above 1× cannot be opened in the final hour before expiry; in that window the keeper force-deleverages existing borrowed positions (or liquidates if underwater).

Liquidations scan:

1. Open positions with `margin_quote > 0` (`GET /v1/positions?status=open&has_margin=true`)
2. Any key with residual vault borrow (`status=all&min_borrow_quote=1`)

Each candidate is pre-filtered on-chain via `trade::is_binary_position_liquidatable` / `is_range_position_liquidatable` (quote balance vs `effective_health_debt` = vault debt or `margin_debt`; threshold from registry `liquidation_bps`, default 9500). Execution uses `vault_flash::borrow_flash_liquidity` → `liquidation::flash_liquidate_*_with_redeem_permissionless` → `vault_flash::repay_flash_liquidity` (with `liquidated_account_id`).

On startup the keeper loads `/v1/protocol` from the indexer to override registry, vault, fee collector IDs, `trading_paused`, and `liquidation_bps` (required for fill/settle/liquidate/trigger; limit expiry only needs `LEVERX_PACKAGE_ID`).

## Breaking changes (contract upgrade)

Republish LeverX and resync the indexer before running an updated keeper against new package IDs.

| Change | Keeper impact |
|--------|----------------|
| `vault_flash::repay_flash_liquidity` adds `liquidated_account_id: ID` | `buildLiquidation` passes `position.account_id` (6th arg after `receipt`) |
| Maintenance exempt from `trading_paused` on-chain | Keeper runs **force_close** and **liquidation** even when indexer reports `trading_paused`; only **limit fills** and **triggers** are skipped |
| Surplus routed to position owner (not keeper) on settle/close | No PTB change; keeper profit on liquidations is now **10% of post-flash surplus** via protocol fee split |
| `RegistryInitialized.liquidation_bps` + `LiquidationBpsUpdated` | Exposed on `/v1/protocol` and `/health/ready` → `protocol.liquidationBps` |
| Range permissionless settle still blocked in Predict | `settle_expired_proxy_range_permissionless` may fail until Predict adds permissionless range redeem; binary settle unaffected |

## HTTP API

| Endpoint                    | Description                                                                     |
| --------------------------- | ------------------------------------------------------------------------------- |
| `POST /create-manager`      | Create or return keeper-owned Predict manager for `{ "address": "0x..." }` |
| `POST /trade/mint`          | Relay market mint PTB (wallet-signed `leverx:trade:mint:v1` intent; keeper = executor) |
| `POST /trade/redeem`        | Relay market redeem PTB (wallet-signed `leverx:trade:redeem:v1` intent)                 |
| `GET /manager/:address`     | Lookup manager id for a user wallet (local store, then indexer)                       |
| `GET /health`               | Process liveness (always 200 when running)                                      |
| `GET /health/ready`         | Readiness — 503 if signer/RPC/indexer/config not ready                          |
| `GET /health/status`        | Full readiness report (always 200, `ok` in body)                                |
| `GET /keeper/status`        | Same readiness report + orchestrator state                                      |
| `POST /keeper/run?task=all` | Run one task kind: `limit_order`, `liquidation`, `trigger`, `force_close`, `all` |
| `GET /v1/*`                 | Proxied to leverx-server (`INDEXER_URL` in constants or `.env`)                 |

## Docker (LeverX admin)

The keeper runs as part of the leverx docker stack — not as a public self-serve helper page in the app.

```bash
cp keeper/.env.example keeper/.env   # KEEPER_PRIVATE_KEY only
docker compose up --build            # from repo root (leverx stack)
```

After deploy, contract admin must call `protocol_registry::set_keeper_address_entry` with the keeper signer address so onboarding and liquidations validate manager ownership.

Tasks simulate every PTB with `devInspect` before signing.

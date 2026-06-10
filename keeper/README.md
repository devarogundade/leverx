# LeverX Keeper

NestJS bot that maintains the LeverX protocol off-chain:

- **Settlement** — redeem expired positions after oracle settlement (`settle_expired_proxy_position` / `range`)
- **Limit orders** — fill resting mint limits when market ask crosses limit + slippage; expire unfilled orders past `order_expires_ms` via `trade::expire_*_limit_mint_order`
- **Liquidation** — vault flash + permissionless redeem liquidations for underwater dUSDC keys
- **Triggers** — execute TP/SL redeems when indexed trigger premiums are hit

Also proxies `/v1/*` to `leverx-server` so the frontend can use a single URL (port `3001` in docker stack).

## Setup

```bash
cd keeper
cp .env.example .env
# Set KEEPER_PRIVATE_KEY in .env
# Edit src/config/constants.ts for deploy IDs, indexer URL, etc.
pnpm install
pnpm run start:dev
```

## Configuration

| File                      | Purpose                                                                 |
| ------------------------- | ----------------------------------------------------------------------- |
| `keeper/.env`             | `KEEPER_PRIVATE_KEY` and optional deploy/indexer env overrides          |
| `src/config/constants.ts` | Default package IDs, cron, indexer URL (overridden by env when set)     |

Optional env vars (same names as `contracts/deploy-testnet.env` and docker-compose): `LEVERX_PACKAGE_ID`, `LEVERX_REGISTRY_ID`, `LEVERX_VAULT_ID`, `LEVERX_FEE_COLLECTOR_ID`, `PREDICT_PACKAGE_ID`, `PREDICT_ID`, `QUOTE_TYPE`, `INDEXER_URL`.

**dUSDC-only, 1.1×–10× leverage** — quote type `dusdc::DUSDC`, `MIN_LEVERAGE_BPS = 11_000`, `MAX_LEVERAGE_BPS = 100_000`, margin 0.1–100 dUSDC, margin call at `MARGIN_CALL_BPS = 9_500`.

Liquidations scan:

1. Open positions with `margin_quote > 0` (`GET /v1/positions?status=open&has_margin=true`)
2. Any key with residual vault borrow (`status=all&min_borrow_quote=1`)

Each candidate is pre-filtered on-chain via `trade::is_binary_position_liquidatable` / `is_range_position_liquidatable` (quote balance vs `effective_health_debt` = vault debt or `margin_debt`). Execution uses `vault_flash::borrow_flash_liquidity` + `liquidation::flash_liquidate_*_with_redeem_permissionless`.

On startup the keeper loads `/v1/protocol` from the indexer to override registry, vault, and fee collector IDs (required for fill/settle/liquidate/trigger; limit expiry only needs `LEVERX_PACKAGE_ID`).

## HTTP API

| Endpoint                    | Description                                                                     |
| --------------------------- | ------------------------------------------------------------------------------- |
| `GET /health`               | Process liveness (always 200 when running)                                      |
| `GET /health/ready`         | Readiness — 503 if signer/RPC/indexer/config not ready                          |
| `GET /health/status`        | Full readiness report (always 200, `ok` in body)                                |
| `GET /keeper/status`        | Same readiness report + orchestrator state                                      |
| `POST /keeper/run?task=all` | Run one task kind: `settlement`, `limit_order`, `liquidation`, `trigger`, `all` |
| `POST /keeper/settle`       | Settlement only (legacy alias)                                                  |
| `GET /v1/*`                 | Proxied to leverx-server (`INDEXER_URL` in constants or `.env`)                 |

## Docker

```bash
cp keeper/.env.example keeper/.env   # KEEPER_PRIVATE_KEY only
docker compose up --build            # from repo root (leverx stack)
```

Tasks simulate every PTB with `devInspect` before signing.

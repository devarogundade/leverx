# LeverX Keeper

NestJS bot that maintains the LeverX protocol off-chain:

- **Settlement** — redeem expired positions after oracle settlement (`settle_expired_proxy_position` / `range`)
- **Limit orders** — fill resting leveraged mint limits when market ask crosses limit + slippage
- **Liquidation** — atomic flash-loan liquidations for underwater keys
- **Triggers** — execute TP/SL redeems when indexed trigger premiums are hit

Also proxies `/v1/*` to `leverx-server` so the frontend can use a single URL (port `3001` in docker stack).

## Setup

```bash
cd keeper
cp .env.example .env
# Set KEEPER_PRIVATE_KEY in .env
# Edit src/config/constants.ts for deploy IDs, liquidation wiring, etc.
pnpm install
pnpm run start:dev
```

## Configuration

| File                      | Purpose                                                                               |
| ------------------------- | ------------------------------------------------------------------------------------- |
| `keeper/.env`             | `KEEPER_PRIVATE_KEY` only                                                             |
| `src/config/constants.ts` | Package IDs, registry/vault/fee-collector, Predict, cron, indexer URL, launch catalog |

**Launch collateral** (whitelist on-chain): SUI 80%, dUSDC 90%, DEEP 70% max LTV; all liquidate below 95% health — see `LAUNCH_COLLATERAL_CATALOG` in `constants.ts`. Each entry needs `coinType` and `pythOracleId`. Non-quote collateral (SUI, DEEP, …) also needs `spotPoolId` and keeper `deepCoinId` for spot-swap liquidations. Quote-native dUSDC uses vault flash loans (no spot pool). Quote Pyth oracle lives in `TESTNET_LIQUIDATION.pythQuoteOracleId`.

Liquidations scan indexed keys with `borrow_quote > 0` via `GET /v1/positions?status=all&min_borrow_quote=1` (includes closed predict legs with remaining vault debt), then pre-filter with on-chain `trade::is_binary_position_liquidatable` / `is_range_position_liquidatable` (collateral + key quote balance vs per-asset liquidation LTV). Quote-native dUSDC uses `vault_flash` + `flash_liquidate_*_with_redeem_permissionless`; other collaterals use DeepBook flash + `flash_liquidate_*_with_spot_swap_and_redeem`.

## HTTP API

| Endpoint                    | Description                                                                     |
| --------------------------- | ------------------------------------------------------------------------------- |
| `GET /health`               | Process liveness (always 200 when running)                                      |
| `GET /health/ready`         | Readiness — 503 if signer/RPC/indexer/config not ready                          |
| `GET /health/status`        | Full readiness report (always 200, `ok` in body)                                |
| `GET /keeper/status`        | Same readiness report + orchestrator state                                      |
| `POST /keeper/run?task=all` | Run one task kind: `settlement`, `limit_order`, `liquidation`, `trigger`, `all` |
| `POST /keeper/settle`       | Settlement only (legacy alias)                                                  |
| `GET /v1/*`                 | Proxied to leverx-server (`INDEXER_URL` in constants)                           |

## Docker

```bash
cp keeper/.env.example keeper/.env   # KEEPER_PRIVATE_KEY only
docker compose up --build            # from repo root (leverx stack)
```

Tasks simulate every PTB with `devInspect` before signing.

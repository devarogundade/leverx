# LeverX

Leveraged trading layer for [DeepBook Predict](https://docs.sui.io/onchain-finance/deepbook-predict/deepbook-predict) UP, DOWN, and RANGE instruments on Sui testnet.

## Project structure

```
leverx/
├── app/           # TanStack Start UI — markets, trading, portfolio, pool, points
├── contracts/     # Move smart contracts (leverage vault, proxy PredictManager)
├── indexer/       # On-chain indexer (order book, positions, limits, leaderboard)
└── keeper/        # Optional helper bot (liquidations, limit fills, force-close)
```

## App

The UI uses a dark trading palette (neutrals, violet brand accent, green/red position colors), tight corners, and a ~1320px trading-terminal layout, fed by live DeepBook Predict oracle data and the LeverX indexer.

### Pages

| Route | Description |
|-------|-------------|
| `/` | Landing page |
| `/markets` | Market list with live oracle feed |
| `/predictions/:oracleId` | Trading terminal (chart, order book, leverage panel) |
| `/portfolio` | Wallet portfolio — balances, open trades, limit orders |
| `/vault` | Shared dUSDC pool — deposit, withdraw, APR |
| `/keeper` | Helper setup (Docker) |
| `/points` | Genesis volume leaderboard |
| `/guide` | How it works |
| `/terms` | Terms of service |
| `/privacy` | Privacy policy |

### Data sources

- **Predict Server** (`https://predict-server.testnet.mystenlabs.com`) — oracles, spot/forward prices, SVI params, vault TVL
- **LeverX indexer** — order book bids, resting limits, positions, liquidations, points

### Run locally

No `.env` file is required — testnet Predict server URLs and contract IDs are built into `app/src/lib/config.ts`.

```bash
cd app
bun install   # or npm install
bun dev       # or npm run dev
```

### Build

```bash
cd app
bun run build   # or npm run build
```

### Breaking changes (contract ↔ indexer ↔ app)

Resync the indexer after republishing contracts (`bash indexer/scripts/reset-from-publish.sh`). The app reads protocol state from `/v1/protocol` — set `VITE_LEVERX_KEEPER_URL` (REST) and `VITE_LEVERX_INDEXER_WS_URL` (live streams) when self-hosting; keeper does not proxy WebSockets.

| Change | App impact |
|--------|------------|
| `RegistryInitialized.liquidation_bps` + `LiquidationBpsUpdated` | Margin-call band and health labels use `protocol.liquidation_bps` (default 9500 bps) |
| `trading_paused` maintenance exemption | New opens blocked in UI when paused; close, repay, and settle still available in portfolio |
| `remintAfterDeleverage` on mint PTBs | Toggle in leverage panel (default on for >1×) |
| Surplus to owner on settle/close | Close/settle PTBs unchanged; surplus credited to proxy owner, not keeper |
| Liquidation `event_kind` on `/v1/liquidations` | Portfolio shows liquidated / force-deleveraged / bad-debt rows |
| `vault_snapshots.insurance_fund_delta` | Vault history API includes insurance skim deltas (chart-ready) |
| Range permissionless settle | Binary settle works; range settle may fail until Predict adds permissionless range redeem |

PTB builders (`ptb-builder.ts`, `transactions.ts`) do not call `vault_flash::repay_flash_liquidity` — that change is keeper-only.

## Contracts

Move package configured against DeepBook Predict testnet (`predict-testnet-4-16`).

```bash
cd contracts
sui move build
```

## Tech stack

- **App:** TanStack Start/Router, React 19, Tailwind CSS v4, TanStack Query, lightweight-charts
- **Chain:** Sui testnet, DeepBook Predict, Pyth (cross-collateral)

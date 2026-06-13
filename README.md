# LeverX

Leveraged trading layer for [DeepBook Predict](https://docs.sui.io/onchain-finance/deepbook-predict/deepbook-predict) UP, DOWN, and RANGE instruments on Sui testnet.

## Project structure

```
leverx/
├── app/           # TanStack Start UI — markets, trading, portfolio, pool, points
├── contracts/     # Move smart contracts (leverage vault, proxy PredictManager)
├── indexer/       # On-chain indexer (order book, positions, limits, leaderboard)
└── keeper/        # Optional helper bot (liquidations, limit fills, settlements)
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

## Contracts

Move package configured against DeepBook Predict testnet (`predict-testnet-4-16`).

```bash
cd contracts
sui move build
```

## Tech stack

- **App:** TanStack Start/Router, React 19, Tailwind CSS v4, TanStack Query, lightweight-charts
- **Chain:** Sui testnet, DeepBook Predict, Pyth (cross-collateral)

# LeverX

Leveraged trading layer for [DeepBook Predict](https://docs.sui.io/onchain-finance/deepbook-predict/deepbook-predict) UP, DOWN, and RANGE instruments on Sui testnet.

## Project structure

```
leverx/
├── app/           # TanStack Start UI — markets, trading, points (Remora theme)
└── contracts/     # Move smart contracts (leverage vault, proxy PredictManager)
```

## App

The UI uses a dark trading palette (neutrals, violet brand accent, green/red position colors), tight corners, and a ~1320px trading-terminal layout, fed by live DeepBook Predict oracle data.

### Pages

| Route | Description |
|-------|-------------|
| `/` | Landing page |
| `/markets` | Market list with live oracle feed |
| `/predictions/:oracleId` | Trading terminal (chart, order book, leverage panel) |
| `/portfolio` | User portfolio (wallet connect) |
| `/points` | Genesis points program |
| `/points/leaderboard` | Weekly leaderboard |
| `/guide` | Docs / how it works |

### Data sources

- **Predict Server** (`https://predict-server.testnet.mystenlabs.com`) — oracles, spot/forward prices, SVI params, vault TVL, trade history

### Run locally

No `.env` file is required — testnet Predict server URLs and contract IDs are built into `app/src/lib/config.ts`.

```bash
cd app
npm install
npm run dev
```

### Build

```bash
cd app
npm run build
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

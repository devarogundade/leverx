# LeverX — DeepBook Predict Hackathon Submission

**Margin layer for DeepBook Predict on Sui testnet**

| | |
|---|---|
| **Live app** | https://suileverx.xyz |
| **GitHub** | https://github.com/devarogundade/leverx |
| **Network** | Sui testnet |
| **Quote asset** | dUSDC |

---

## Introduction

Prediction markets are moving from one-off event bets toward real market infrastructure — but most venues still only list a handful of binary outcomes, settle slowly, and cannot express leverage, structured yield, or composable risk transfer on-chain.

**LeverX** is a full-stack leveraged trading layer built directly on **DeepBook Predict**. Traders post dUSDC margin, borrow from a shared on-chain vault, and mint UP, DOWN, and RANGE binary positions at **1×–10× leverage** through their own `PredictManager`. Liquidity providers deposit into **LeverageVault** and earn borrow demand; a **keeper network** runs liquidations, limit fills, take-profit/stop-loss triggers, and force-close maintenance; and an **indexer + WebSocket API** makes positions, order flow, and vault state legible in real time.

We built LeverX for the DeepBook Predict hackathon as an end-to-end product — not a mock UI. Contracts, indexer, keeper, trading terminal, LP vault, Telegram bot, and an optional **Jarvis** AI trading agent are all wired to the live Predict testnet deployment (`predict-testnet-4-16`).

---

## What it does

### For traders

- **Leveraged binary options** — Open UP, DOWN, and RANGE positions on BTC oracle markets with 0.1–100 dUSDC margin and up to 10× leverage.
- **Professional trading terminal** — Live SVI-priced charts, synthetic order book (resting limit bids + LP mint ask), market and limit orders, leverage controls, and portfolio PnL.
- **Cross-collateral margin** — Deposit SUI, sSUI, LSTs, or dUSDC; swap to quote via DeepBook spot before minting.
- **Risk controls** — On-chain take-profit / stop-loss triggers, margin-call health labels, and automatic deleverage in the final hour before expiry.
- **Jarvis (AI agent)** — Opt-in agent that scans open positions and nearby expiries every ~5 minutes, applies user guardrails (max leverage, portfolio %, risk profile), and can open/close trades via the keeper executor model.
- **Telegram trading** — Link a wallet, browse markets, and trade with commands like `/up`, `/down`, `/range` without opening the web app.

### For liquidity providers

- **LeverageVault (LXPLP)** — Supply dUSDC to the shared borrow pool; earn a kinked utilization-based APR from trader borrow interest and protocol fee share (80% of interest revenue flows back to LPs).
- **Vault dashboard** — Deposit, withdraw, and track TVL, utilization, borrow rate, and LP APR in the app.

### For the ecosystem

- **Keeper service** — Permissionless-style maintenance: limit order fills, flash-loan liquidations, TP/SL execution, and post-expiry force-close / deleverage.
- **Indexer + API** — Rust indexer on Sui checkpoints → Postgres; REST + WebSocket for positions, limits, liquidations, vault events, and a genesis volume **points leaderboard**.
- **Move protocol layer** — `UserProxy` wraps each user's `PredictManager`; `trade` module adds market/limit semantics and leveraged mint/redeem on top of Predict's oracle-priced fills.

### Hackathon requirements

| Requirement | Status |
|---|---|
| Integrate DeepBook Predict contract on testnet | ✅ Mint/redeem/settle via `deepbook_predict` against `PREDICT_ID` `0xc8736204…8028a` |
| End-to-end product flow | ✅ Connect wallet → create account → deposit → trade → redeem/settle → LP deposit/withdraw |
| Vault strategy simulation (if applicable) | ✅ LeverageVault kinked borrow curve + LP APR modeled on-chain; keeper liquidations simulated via `devInspect` before execution |

---

## How it works

### Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│  App (React)          Telegram Bot          Jarvis UI           │
│  suileverx.xyz                                                     │
└────────────┬───────────────────────┬────────────────────────────┘
             │ REST / intents        │ WebSocket
             ▼                       ▼
┌────────────────────┐    ┌─────────────────────────────────────┐
│  Keeper (NestJS)   │    │  Indexer + API (Rust)               │
│  keeper.suileverx  │───▶│  indexer.suileverx                  │
│  · trade relay     │    │  · checkpoints → Postgres           │
│  · liquidations    │    │  · REST /v1/* + WS live streams     │
│  · limit fills     │    └─────────────────────────────────────┘
│  · Jarvis agent    │
└─────────┬──────────┘
          │ signed PTBs
          ▼
┌─────────────────────────────────────────────────────────────────┐
│  LeverX Move contracts (testnet)                                 │
│  · LeverageVault — borrow pool, LXPLP, flash loans               │
│  · UserProxy — per-user PredictManager + debt + triggers        │
│  · trade / liquidation / predict_client                           │
└─────────┬───────────────────────────────────────────────────────┘
          │ mint · redeem · settle
          ▼
┌─────────────────────────────────────────────────────────────────┐
│  DeepBook Predict (testnet)                                      │
│  · OracleSVI pricing · shared PLP vault · rolling BTC oracles    │
│  · predict-server.testnet.mystenlabs.com                        │
└─────────────────────────────────────────────────────────────────┘
```

### Opening a leveraged trade

1. **Connect wallet** — User connects via Slush / Enoki or a standard Sui wallet.
2. **Create trading account** — Keeper creates a `PredictManager` and the user creates an on-chain `UserProxy`.
3. **Register executor** — User registers the keeper as session executor so relayed trades are authorized.
4. **Deposit margin** — User deposits dUSDC (or cross-collateral swapped to quote).
5. **Sign trade intent** — For market orders, user signs a personal-message intent (`leverx:trade:mint:v1`).
6. **Keeper executes PTB** — Keeper builds and submits: vault borrow (if leverage > 1×) → `predict::mint` via `predict_client`.
7. **Indexer streams update** — Position appears in portfolio; WebSocket pushes live mark-to-market from redeem bids.

Limit orders use a two-phase on-chain flow: user places a resting `PendingLimitMintOrder`; keeper fills when Predict's live ask crosses limit + slippage.

### Liquidation path

When a position's quote balance falls below the registry liquidation threshold (default 95% health):

1. Keeper borrows quote via **vault flash loan**
2. Calls `liquidation::flash_liquidate_with_spot_swap_and_redeem` — redeems Predict position, repays vault debt, optionally swaps seized collateral
3. Repays flash loan; protocol fee split (80% vault / 10% treasury / 10% keeper incentive)

### Dual-oracle design

| Use case | Oracle |
|---|---|
| Collateral LTV, borrow limits, liquidation | **Pyth** |
| Mint/redeem premium, settlement | **OracleSVI** (Predict) |

### Testnet deployment

| Object | ID |
|---|---|
| LeverX package | `0x97b41ca2ed4948d2b448ca4031d1727ee2dfd2c1e9c086748c758e069a366825` |
| LeverxRegistry | `0xc165f33bffbdaf02209690f4ad7aa5090aa214bcba80e23d9be6e52db676de93` |
| LeverageVault | `0x249afdb0a91126b12c262dc57ee871582376874b65ad857df54887a2145c96f3` |
| Predict package | `0xf5ea2b3749c65d6e56507cc35388719aadb28f9cab873696a2f8687f5c785138` |
| Predict object | `0xc8736204d12f0a7277c86388a68bf8a194b0a14c5538ad13f22cbd8e2a38028a` |

Predict server: `https://predict-server.testnet.mystenlabs.com`

### Try it

1. Get testnet **dUSDC** via the [official faucet form](https://tally.so/r/Xx102L).
2. Open **https://suileverx.xyz** → connect wallet → create trading account.
3. Deposit dUSDC → browse **Markets** → open a UP/DOWN/RANGE position with leverage.
4. Optional: link Telegram in Portfolio, or enable **Jarvis** for automated position management.

Local full stack: see [README.md](./README.md) (Docker compose for indexer + keeper, or frontend-only against hosted backends).

---

## What's Next

### Mainnet day one

- Redeploy LeverX contracts against Predict mainnet launch; resync indexer from publish checkpoint.
- Align quote asset with production USDSUI / official stablecoin naming.
- Harden keeper key management and multi-keeper coordination for limit fills and liquidations.

### Composability (Sui DeFi stack)

- **Tokenized vault shares** — Wrap `LXPLP` or managed `PredictManager` positions into portable share tokens usable as margin collateral on `deepbook_margin` or supply on `iron_bank`.
- **Three-protocol margin loop** — Borrow against USDsui on Iron Bank → deploy into Predict ranges via LeverX → repay from settlement (flagship composability demo from the hackathon brief).
- **PLP + hedge vault** — Supply to Predict PLP while buying OTM binaries to cap tail drawdown; net yield product for conservative LPs.

### Trading & automation

- **Vol-arb bot** — Compare Predict SVI implied vol vs Polymarket / Hyperliquid surfaces; trade dislocations with optional perp delta hedge.
- **Settled-redeem keeper network** — Permissionless redemption batching with tip splitting for unclaimed post-settlement positions.
- **Jarvis v2** — Smarter regime detection, multi-oracle allocation, and social/copy-trading hooks via Telegram groups.

### Analytics & tooling

- **Predict Surface Studio** — 3-D SVI surface viewer with replay and arbitrage-free sanity checks (embeddable widget for other Sui frontends).
- **PLP + LeverageVault risk dashboard** — Combined vault utilization, withdrawal-limiter state, and ±σ scenario PnL for institutional LPs.

### Product polish

- Mobile-first PWA install flow and streak/leaderboard gamification (building on the existing points system).
- Range permissionless settle once Predict adds `redeem_range_permissionless`.
- Public keeper operator docs and open-source deployment templates for community-run liquidators.

---

## Links

| Resource | URL |
|---|---|
| Live app | https://suileverx.xyz |
| Source code | https://github.com/devarogundade/leverx |
| Keeper API | https://keeper.suileverx.xyz |
| Indexer API | https://indexer.suileverx.xyz |
| DeepBook Predict docs | https://docs.sui.io/onchain-finance/deepbook-predict/deepbook-predict |
| Predict testnet server | https://predict-server.testnet.mystenlabs.com |
| dUSDC faucet | https://tally.so/r/Xx102L |
| Hackathon registration | https://www.deepsurge.xyz/hackathons/b587dc0c-4cb8-4e63-ada5-519df38103bf |

---

*Built for the DeepBook Predict hackathon — demonstrating leveraged, composable prediction-market infrastructure on Sui.*

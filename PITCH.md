# LeverX

**Trade prediction markets with leverage — on DeepBook Predict.**

🌐 **Try it:** [suileverx.xyz](https://suileverx.xyz)  
📦 **Code:** [github.com/devarogundade/leverx](https://github.com/devarogundade/leverx)

---

## The pitch

Most prediction markets let you bet *yes* or *no* — and that's it. No leverage. No pro tools. No way to earn from the other side unless you're the house.

**LeverX changes that.**

We built the missing layer on top of **DeepBook Predict**: a place where you can **bet on where BTC (and other assets) will land**, use **up to 10× leverage**, set **limit prices**, track your PnL live — and if you'd rather not trade, **deposit into a pool and earn** when others borrow.

Think of it as **prediction markets with a margin account** — live on Sui testnet today.

---

## What can you do?

### 🎯 Trade with conviction

- Pick **UP** (price finishes above a strike), **DOWN** (below), or **RANGE** (inside a band)
- Put down as little as **0.1 dUSDC**, scale up to **10× leverage**
- See a real chart, live prices, and whether you're winning or losing *before* expiry
- Place **market** orders for speed or **limit** orders when you want a better price

### 💰 Earn without trading

Don't want to pick direction? **Add dUSDC to the pool.** Traders borrow from it when they use leverage — and LPs earn from that activity. Deposit and withdraw anytime from the **Vault** page.

### 🤖 Let Jarvis trade for you

Turn on **Jarvis** in the app. Set your rules — max leverage, how much of your balance to use, risk level — and Jarvis scans your account every few minutes, manages open positions, and looks for new opportunities. You stay in control; Jarvis does the busywork.

### 📱 Trade from Telegram

Link your wallet once, then trade from chat:

```
/up 70k 5x 10
/markets
/balance
```

No browser tab required. Great for quick calls on the go.

---

## Why we built it

DeepBook Predict already prices every strike on a live volatility surface — that's powerful infrastructure. But traders still need:

- **Leverage** — size a view without putting up the full premium
- **A real UI** — charts, portfolio, order flow, not just raw contract calls
- **Liquidity for borrowers** — a vault that backs leveraged positions
- **Automation** — keepers that fill limits, close risky positions, and keep the system healthy

LeverX delivers all four as one product you can use end-to-end today.

---

## How it works (simple version)

1. **Connect your wallet** on [suileverx.xyz](https://suileverx.xyz)
2. **Create a trading account** and deposit **dUSDC** (get testnet dUSDC [here](https://tally.so/r/Xx102L))
3. **Pick a market** — e.g. "Will BTC finish above $70k by expiry?"
4. **Choose direction, size, and leverage** — confirm the trade
5. **Watch it live** — chart turns green or red as price moves; close early or hold to settlement
6. **Or skip trading** — deposit in the Vault and earn from borrow demand

Behind the scenes, LeverX talks to **DeepBook Predict** on Sui testnet. Your positions are real on-chain contracts — not paper trades.

---

## Who is it for?

| You are… | LeverX gives you… |
|---|---|
| **A crypto trader** | Leveraged UP/DOWN/RANGE bets with a terminal that feels like a real exchange |
| **A DeFi user** | LP yield from a borrow pool tied to Predict activity |
| **A busy trader** | Jarvis or Telegram so you're not glued to a screen |
| **A builder / judge** | Full open-source stack — contracts, indexer, keeper, frontend — integrated with Predict testnet |

---

## What's next

- **Mainnet** — redeploy on day one when Predict launches
- **More composability** — vault shares as collateral across Sui DeFi (margin, lending, structured products)
- **Smarter bots** — vol-arb between Predict and other venues; auto-redeem after settlement
- **Better mobile & social** — streaks, leaderboards, group trading in Telegram

---

## Quick links

| | |
|---|---|
| **Live app** | [suileverx.xyz](https://suileverx.xyz) |
| **GitHub** | [github.com/devarogundade/leverx](https://github.com/devarogundade/leverx) |
| **Get dUSDC (testnet)** | [tally.so/r/Xx102L](https://tally.so/r/Xx102L) |
| **DeepBook Predict** | [docs.sui.io/.../deepbook-predict](https://docs.sui.io/onchain-finance/deepbook-predict/deepbook-predict) |

---

**LeverX — predict with leverage. Earn from the pool. Trade from your phone.**

*Built for the DeepBook Predict hackathon on Sui.*

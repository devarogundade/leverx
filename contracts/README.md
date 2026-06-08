# LeverX Move package

**Package name:** `leverx` (see `Move.toml`)

**Convention:** each file `foo.move` defines exactly one module `leverx::foo`.

LeverX is a leveraged trading layer on [DeepBook Predict](https://docs.sui.io/onchain-finance/deepbook-predict/deepbook-predict). Traders deposit cross-collateral, borrow dUSDC from the LeverageVault, and mint binary positions via their linked PredictManager.

## Dependencies

| Dependency         | Purpose                                                            |
| ------------------ | ------------------------------------------------------------------ |
| `deepbook_predict` | Binary option mint/redeem via shared `Predict` + `PredictManager`  |
| `deepbook_margin`  | Reference patterns for Pyth oracle + DeepBook pool proxy (testnet) |
| `deepbook`         | Spot pool market orders for collateral → dUSDC swap                |
| `pyth`             | Cross-collateral LTV pricing via `PriceInfoObject` feeds           |

Pinned to testnet (`predict-testnet-4-16`, `margin-testnet`, `sui-contract-testnet`).

## Layout

| File                  | Module                   | Who calls it                                         |
| --------------------- | ------------------------ | ---------------------------------------------------- |
| `trade.move`          | `leverx::trade`          | App — deposit, swap, open position, repay            |
| `account.move`        | `leverx::account`        | App — create proxy account                           |
| `vault.move`          | `leverx::vault`          | App (LP supply/withdraw), `trade` (borrow/repay)     |
| `registry.move`       | `leverx::registry`       | Admin — initialize, register collateral + swap pools |
| `ltv.move`            | `leverx::ltv`            | Internal — Pyth collateral valuation + LTV checks    |
| `spot_swap.move`      | `leverx::spot_swap`      | Internal — DeepBook spot sell for quote              |
| `predict_client.move` | `leverx::predict_client` | Internal — Predict mint/redeem wrappers              |
| `constants.move`      | `leverx::constants`      | Internal — scaling, max leverage                     |
| `events.move`         | `leverx::events`         | Internal — indexer events                            |
| `errors.move`         | `leverx::errors`         | Internal — abort codes                               |

## Transaction model

Typical leveraged open (single PTB):

1. `predict::create_manager` (if needed)
2. `trade::create_account` — link PredictManager
3. `trade::deposit_collateral` — post cross-collateral
4. `trade::swap_collateral_to_quote` — when margin asset ≠ dUSDC
5. `trade::open_leveraged_position` — LTV check, vault borrow, `predict::mint`

LP flows use `vault::supply` / `vault::withdraw` directly.

## Tests

```bash
cd contracts && sui move test
```

On Windows, use WSL2 for the Sui toolchain.

## Testnet setup

After publish:

1. Mint `LXPLP` treasury cap and call `vault::new` + `vault::share`
2. Call `registry::initialize` with `AdminCap`, `PREDICT_ID`, vault ID
3. `whitelist_collateral_entry` per asset with Pyth feed + per-asset LTV bps (see env catalog)
4. `register_swap_pool_entry` per collateral → DeepBook spot pool ID

**Initial launch collateral** (configure on-chain via admin; documented in `keeper/.env.example`):

| Asset | Max LTV          | Notes                  |
| ----- | ---------------- | ---------------------- |
| SUI   | 80% (8000 bps)   | + Pyth feed, spot pool |
| dUSDC | 90% (9000 bps max) | quote-native margin; liquidation below 95% health |
| DEEP  | 70% (7000 bps)   | + Pyth feed, spot pool |

All assets: `liquidation_ltv_bps = 9500` (liquidate when health falls below 95%).

IDs from `deploy-testnet.env` and `app/src/lib/config.ts`.

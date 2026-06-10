# LeverX Move package

**Package name:** `leverx` (see `Move.toml`)

**Convention:** each file `foo.move` defines exactly one module `leverx::foo`.

LeverX is a leveraged trading layer on [DeepBook Predict](https://docs.sui.io/onchain-finance/deepbook-predict/deepbook-predict). Traders deposit dUSDC margin, borrow from the `LeverageVault`, and mint binary positions via their linked `PredictManager`.

## Dependencies

| Dependency         | Purpose                                                           |
| ------------------ | ----------------------------------------------------------------- |
| `deepbook_predict` | Binary option mint/redeem via shared `Predict` + `PredictManager` |

Pinned to testnet (`predict-testnet-4-16`).

## Layout

| File                    | Module                      | Who calls it                              |
| ----------------------- | --------------------------- | ----------------------------------------- |
| `trade.move`            | `leverx::trade`             | App — deposit, open/close, limits, repay  |
| `user_proxy.move`       | `leverx::user_proxy`        | Internal — per-user custody + ledgers     |
| `proxy_vault.move`      | `leverx::proxy_vault`       | Internal — in-proxy coin custody          |
| `leverage_vault.move`   | `leverx::leverage_vault`    | App (LP supply/withdraw), `trade` (borrow) |
| `protocol_registry.move`| `leverx::protocol_registry` | Admin — pause, fee withdraw, vault params |
| `ltv.move`              | `leverx::ltv`               | Internal — quote-only health math         |
| `predict_client.move`   | `leverx::predict_client`    | Internal — Predict mint/redeem wrappers   |
| `protocol_constants.move` | `leverx::protocol_constants` | Internal — scaling, leverage bounds    |
| `events.move`           | `leverx::events`            | Internal — indexer events                 |
| `errors.move`           | `leverx::errors`            | Internal — abort codes                    |

## Transaction model

Typical leveraged open (single PTB):

1. `predict_client::create_manager` (if needed)
2. `trade::create_user_proxy` — link `PredictManager`
3. `trade::deposit_quote_for_binary` / `deposit_quote_for_range` — post margin
4. `trade::leveraged_mint_*` — vault borrow + `predict::mint`

LP flows use `leverage_vault::supply` / `withdraw` directly.

## Tests

```bash
cd contracts && sui move test
```

On Windows, use WSL2 for the Sui toolchain.

## Testnet setup

After publish:

1. Mint `LXPLP` treasury cap and call `deploy::deploy_and_share` (vault + fee collector + registry)
2. IDs land in `deploy-testnet.env` and `app/src/lib/config.ts`

Margin-call threshold: health below 95% (`protocol_constants::margin_call_bps`).

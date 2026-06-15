# LeverX Protocol — Technical Specification

Leveraged trading layer over **DeepBook Predict** on Sui. Traders deposit cross-collateral (Pyth-priced) **per market key** (no shared proxy collateral), borrow **dUSDC** from **LeverageVault** per position, and mint binary/range positions via an isolated **UserProxy** wrapping a **PredictManager**.

**Status:** on-chain Move implementation complete. Build requires Sui CLI ≥ 1.73 (testnet) for `published-at` dependency resolution.

---

## 1. Architecture

```
                    ┌─────────────────────────────────┐
                    │      leverx::leverage_vault     │
                    │  (kinked utilization, LXPLP)     │
                    └───────────────┬─────────────────┘
                                    │ dUSDC credit line
                                    ▼
┌───────────────────────────────────────────────────────────┐
│                   leverx::user_proxy                      │
│  ┌─────────────────────┐  ┌────────────────────────────┐ │
│  │ Collateral Ledger   │  │ PredictManager (DeepBook)  │ │
│  │ SUI / sSUI / LST    │  │ binary + range positions   │ │
│  └─────────────────────┘  └────────────────────────────┘ │
└───────────────────────────────────────────────────────────┘
         ▲ Pyth LTV                              ▲ OracleSVI pricing
```

| Component          | Move module                 | Role                                                                             |
| ------------------ | --------------------------- | -------------------------------------------------------------------------------- |
| **LeverageVault**  | `leverx::leverage_vault`    | LP pool (dUSDC). Kinked borrow rate, interest accrual, vault flash loans         |
| **FeeCollector**   | `leverx::fee_collector`     | Protocol treasury (10% fee share). Routes revenue 80/10/10                       |
| **UserProxy**      | `leverx::user_proxy`        | Per-user shared object. DeepBook `BalanceManager` + debt + executor caps + TP/SL |
| **LeverxRegistry** | `leverx::protocol_registry` | Predict ID, vault ID, fee collector ID, collateral whitelist, swap pools, pause  |
| **Trade**          | `leverx::trade`             | Entry points: deposit, swap, leveraged mint/redeem, settlement, deleverage       |
| **Liquidation**    | `leverx::liquidation`       | Flash liquidate, redeem path, spot swap, insurance skim                          |
| **DeepBook Flash** | `leverx::deepbook_flash`    | Thin wrappers over pool flash loans for keeper PTBs                              |
| **Deploy**         | `leverx::deploy`            | One-shot vault + fee collector + registry deployment                             |

### Protocol fee split (80 / 10 / 10)

When the protocol earns **fee revenue** (not principal repayments), it is split:

| Share   | Destination                     | Notes                                                                 |
| ------- | ------------------------------- | --------------------------------------------------------------------- |
| **80%** | `LeverageVault` liquidity / NAV | LP revenue via `credit_lp_revenue`                                    |
| **10%** | `FeeCollector` balance          | Protocol treasury; admin withdraws via `withdraw_fee_collector_entry` |
| **10%** | `ctx.sender()`                  | Keeper / permissionless caller incentive                              |

**Fee sources** (`protocol_constants::fee_source_*`):

| Tag | Source                                     | Routed through                              |
| --- | ------------------------------------------ | ------------------------------------------- |
| `1` | Borrow **interest** portion of vault repay | `fee_collector::repay_vault_with_fee_split` |
| `2` | Vault **flash-loan fee**                   | `fee_collector::repay_flash_liquidity`      |
| `3` | Liquidation swap **skim**                  | `fee_collector::collect_protocol_skim`      |

Principal repayments and flash-loan principal return 100% to vault liquidity (no split).

### Dual-oracle design

| Path             | Oracle                     | Used for                                   |
| ---------------- | -------------------------- | ------------------------------------------ |
| Cross-collateral | **Pyth** `PriceInfoObject` | LTV, borrow limits, liquidation thresholds |
| Options          | **OracleSVI**              | `mint`, `redeem`, `settle` premium math    |

### Typical PTB — open leveraged binary

1. `leverx::predict_client::create_manager_entry` (if needed)
2. `leverx::trade::create_user_proxy`
3. `leverx::trade::deposit_collateral` (+ Pyth oracles)
4. `leverx::trade::swap_collateral_to_quote` (if margin asset ≠ dUSDC)
5. `leverx::trade::leveraged_mint_binary_market` (with explicit `max_mint_cost` slippage cap)

### Atomic liquidation PTB (keeper)

```
1. leverx::deepbook_flash::borrow_flash_loan_quote(pool, amount, ctx)
2. leverx::liquidation::flash_liquidate_with_spot_swap_and_redeem(...)
3. leverx::deepbook_flash::return_flash_loan_quote(pool, repayment, flash_loan)
4. Transfer surplus quote to keeper
```

---

## 2. Module map

| Module                       | File                      | Status                      |
| ---------------------------- | ------------------------- | --------------------------- |
| `leverx::protocol_registry`  | `protocol_registry.move`  | ✅ Complete                 |
| `leverx::collateral_config`  | `collateral_config.move`  | ✅ Complete                 |
| `leverx::protocol_constants` | `protocol_constants.move` | ✅ Complete                 |
| `leverx::errors`             | `errors.move`             | ✅ Complete                 |
| `leverx::events`             | `events.move`             | ✅ Complete (indexer-ready) |
| `leverx::leverage_vault`     | `leverage_vault.move`     | ✅ Complete                 |
| `leverx::user_proxy`         | `user_proxy.move`         | ✅ Complete                 |
| `leverx::ltv`                | `ltv.move`                | ✅ Complete                 |
| `leverx::spot_swap`          | `spot_swap.move`          | ✅ CLOB + swaps paths       |
| `leverx::predict_client`     | `predict_client.move`     | ✅ Binary + range           |
| `leverx::trade`              | `trade.move`              | ✅ Complete                 |
| `leverx::triggers`           | `triggers.move`           | ✅ On-chain storage         |
| `leverx::liquidation`        | `liquidation.move`        | ✅ Complete                 |
| `leverx::deepbook_flash`     | `deepbook_flash.move`     | ✅ Complete                 |
| `leverx::fee_collector`      | `fee_collector.move`      | ✅ Complete                 |
| `leverx::deploy`             | `deploy.move`             | ✅ Complete                 |

**Naming:** spec **ProtocolState** = `LeverxRegistry`; spec **UserProxy** = `leverx::user_proxy::UserProxy`.

**Legend:** ✅ implemented · 🌐 external (DeepBook / Pyth) · ⚠️ intentional limitation

---

## 3. Function signature matrix

### 3.1 Governance — `leverx::protocol_registry`

| Status | Signature                                                                                                                                                      |
| ------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| ✅     | `fun init(ctx)` → `AdminCap`                                                                                                                                   |
| ✅     | `public fun initialize(admin, predict_id, vault_id, fee_collector_id, ctx): LeverxRegistry`                                                                    |
| ✅     | `public fun share_registry(registry)`                                                                                                                          |
| ✅     | `public fun whitelist_collateral_asset<Collateral>(admin, registry, price_feed_id, decimals, max_ltv_bps, liquidation_ltv_bps, max_conf_bps)`                  |
| ✅     | `public fun register_swap_pool<Collateral>(admin, registry, pool_id)`                                                                                          |
| ✅     | `public fun register_executor_cap(admin, proxy, executor)`                                                                                                     |
| ✅     | `public fun revoke_executor_cap(admin, proxy, executor)`                                                                                                       |
| ✅     | `public fun set_trading_paused(admin, registry, paused)`                                                                                                       |
| ✅     | `public fun set_pyth_max_age(admin, registry, max_age_secs)`                                                                                                   |
| ✅     | `public fun set_borrow_rate_params<Quote>(admin, vault, base_rate_bps, kink_utilization_bps, slope1_bps, slope2_bps, flash_fee_bps)`                           |
| ✅     | Entry variants: `whitelist_collateral_entry`, `register_swap_pool_entry`, `set_trading_paused_entry`, `set_pyth_max_age_entry`, `withdraw_fee_collector_entry` |
| ✅     | Read: `fee_collector_id(registry)`                                                                                                                             |

### 3.2 Vault — `leverx::leverage_vault`

| Status | Signature                                                                                                                                                                                                   |
| ------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| ✅     | `create_lxplp_treasury`, `new`, `share`, `deposit_liquidity`, `withdraw_liquidity`                                                                                                                           |
| ✅     | `accrue_interest`, `borrow` (package), `apply_repayment`, `credit_lp_revenue` (package)                                                                                                                     |
| ✅     | `borrow_flash_liquidity` (package)                                                                                                                                                                          |
| ✅     | Read: `current_borrow_rate`, `borrow_rate_at_utilization`, `current_lp_apr_bps`, `lp_apr_at_utilization`, `utilization_bps`, `available_liquidity`, `total_borrowed`, `outstanding_accrued_interest`, `nav` |

**Dynamic rates:** borrow APR follows a two-slope kinked curve vs utilization. LP supply APR = `borrow_rate × utilization × vault_fee_share` (80% of interest revenue × pool utilization).

### 3.2b Fee collector — `leverx::fee_collector`

| Status | Signature                                                                            |
| ------ | ------------------------------------------------------------------------------------ |
| ✅     | `new`, `share`, `withdraw` (admin)                                                   |
| ✅     | `repay_vault_with_fee_split` (package) — interest split 80/10/10, principal to vault |
| ✅     | `repay_flash_liquidity` — flash fee split 80/10/10                                   |
| ✅     | `collect_protocol_skim` (package) — liquidation skim split 80/10/10                  |
| ✅     | Read: `vault_id`, `balance`, `total_collected`                                       |

### 3.3 User proxy — `leverx::user_proxy` + `leverx::trade`

| Status | Signature                                                                                                              |
| ------ | ---------------------------------------------------------------------------------------------------------------------- |
| ✅     | `user_proxy::create`, `link_predict_manager`, executor cap register/revoke                                             |
| ✅     | `trade::create_user_proxy` (entry)                                                                                     |
| ✅     | `deposit_collateral_for_binary/range`, `deposit_quote_for_binary/range_market`, `withdraw_collateral_for_binary/range` |
| ✅     | `repay_debt_for_binary/range`, `deleverage_*_account_balance`, `synchronize_proxy_accounting`                          |
| ✅     | Read: per-key `binary_quote_balance`, `binary_collateral_balance`, `binary_borrowed_quote` (and range equivalents)     |
| ✅     | Per-key health: `evaluate_binary_position_health`, `is_binary_position_liquidatable`                                   |

### 3.4 Spot swap — `leverx::spot_swap`

| Status | Signature                                                    |
| ------ | ------------------------------------------------------------ |
| ✅     | `swap_to_quote` (CLOB market order)                          |
| ✅     | `swap_to_quote_via_swaps` (DeepBook swaps + balance manager) |
| ✅     | `swap_collateral_coin` (direct, for liquidation)             |

### 3.5 Leveraged trade — `leverx::trade`

DeepBook Predict has **no on-chain order book** — mint/redeem are always oracle market fills. LeverX adds **market** (slippage-capped) and **limit** (premium-validated) semantics on top.

| Status | Signature                                                                                            |
| ------ | ---------------------------------------------------------------------------------------------------- |
| ✅     | `leveraged_mint_binary_market` — `max_mint_cost` slippage cap                                        |
| ✅     | `leveraged_mint_binary_limit` — `limit_premium_per_unit` + `slippage_bps` (immediate fill)           |
| ✅     | `leveraged_mint_range_market`, `leveraged_mint_range_limit`                                          |
| ✅     | `leveraged_redeem_binary_market` — `min_payout` floor                                                |
| ✅     | `leveraged_redeem_binary_limit` — `min_premium_per_unit` floor                                       |
| ✅     | `leveraged_redeem_range_market`, `leveraged_redeem_range_limit`                                      |
| ✅     | `quote_leveraged_mint_binary/range`, `quote_leveraged_redeem_binary/range`                           |
| ✅     | `settle_expired_proxy_position`, `settle_expired_proxy_range`                                        |
| ✅     | `swap_collateral_to_quote_for_binary/range`, `swap_collateral_to_quote_via_swaps_for_binary/range`   |
| ✅     | `repay_debt_for_binary/range`                                                                        |
| ✅     | `place_binary_limit_mint_order`, `execute_binary_limit_mint_order`, `cancel_binary_limit_mint_order` |
| ✅     | `place_range_limit_mint_order`, `execute_range_limit_mint_order`, `cancel_range_limit_mint_order`    |
| ✅     | `get_binary_limit_mint_order`, `get_range_limit_mint_order`                                          |

**Immediate limit buy:** aborts with `limit_price_not_met` (25) when `market_ask > limit + slippage_tolerance`.

**Market buy:** aborts with `slippage_exceeded` (26) when `mint_cost > max_mint_cost`.

**Bounds:** aborts with `ask_out_of_bounds` (27) when premium outside Predict `ask_bounds`.

### 3.5.1 Resting limit mint orders — `leverx::trade`

Two-phase flow for keeper bots (Predict has no native order book):

| Phase   | Caller            | Function                                                            | Validation                                                                                                                              |
| ------- | ----------------- | ------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| Place   | Anyone (keeper)   | `place_binary_limit_mint_order`, `place_range_limit_mint_order`     | Live `market_ask` within `placement_slippage_bps` of `limit_premium_per_unit`; **margin reserved from that market key's quote balance** |
| Execute | Anyone (keeper)   | `execute_binary_limit_mint_order`, `execute_range_limit_mint_order` | `market_ask <= limit + stored slippage_bps`; mint uses frozen slippage from placement                                                   |
| Cancel  | Owner or executor | `cancel_binary_limit_mint_order`, `cancel_range_limit_mint_order`   | —                                                                                                                                       |

`PendingLimitMintOrder` on `UserProxy` stores: `limit_premium_per_unit`, `slippage_bps`, `market_ask_at_place`, `margin_quote`, `leverage_bps`, `quantity`, `expires_ms` (order TTL; must be `> now` and `<= market key expiry`).

**Order expiry:** execute aborts with `limit_order_expired` (33); invalid TTL at place aborts with `invalid_limit_order_expiry` (34).

**Placement errors:** `placement_price_not_aligned` (30), `limit_order_exists` (31), `slippage_too_high` (32, max 5000 bps).

**Events:** `LimitMintOrderPlaced`, `LimitMintOrderExecuted`, `LimitMintOrderCancelled`.

### 3.6 Triggers — `leverx::triggers`

| Status | Signature                                            |
| ------ | ---------------------------------------------------- |
| ✅     | `set_automated_triggers`, `clear_automated_triggers` |
| ✅     | `set_range_triggers`, `clear_range_triggers`         |
| ✅     | `get_triggers`, `get_range_triggers`                 |

Execution is **off-chain** (keepers read triggers, simulate via `devInspect`).

### 3.7 Liquidation — `leverx::liquidation`

All entrypoints take `&mut FeeCollector<Quote>` in addition to vault. Debt repay routes interest through `repay_vault_with_fee_split`; swap skim routes through `collect_protocol_skim` (80/10/10).

| Status | Signature                                                             |
| ------ | --------------------------------------------------------------------- |
| ✅     | `flash_liquidate` — debt repay + collateral seize                     |
| ✅     | `flash_liquidate_with_redeem` — optional live position redeem         |
| ✅     | `flash_liquidate_with_spot_swap` — seize + swap to quote              |
| ✅     | `flash_liquidate_with_spot_swap_and_redeem` — full keeper atomic path |

### 3.8 Predict client — `leverx::predict_client`

| Status | Signature                                                          |
| ------ | ------------------------------------------------------------------ |
| ✅     | `create_manager`, `preview_trade`, `preview_range_trade`           |
| ✅     | `mint_binary`, `mint_range`, `redeem_binary`, `redeem_range`       |
| ✅     | `redeem_settled_permissionless`, `deposit_quote`, `withdraw_quote` |

### 3.9 LTV — `leverx::ltv`

| Status | Signature                                                                |
| ------ | ------------------------------------------------------------------------ |
| ✅     | `collateral_value_in_quote`, `max_borrow_quote`, `assert_borrow_allowed` |
| ✅     | `position_from_margin`, `borrow_for_leverage`, `evaluate_account_health` |
| ✅     | `is_liquidatable`, `is_proxy_liquidatable`                               |

### 3.10 Deploy — `leverx::deploy`

| Status | Signature                                                                         |
| ------ | --------------------------------------------------------------------------------- |
| ✅     | `deploy_protocol<Quote>(admin, predict_id, ctx): (LeverageVault, LeverxRegistry)` |
| ✅     | `deploy_and_share<Quote>` (entry)                                                 |

---

## 4. Known limitations

| ID    | Issue                                                          | Status                                                                                |
| ----- | -------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| **A** | SVI premium decay                                              | Mitigated via early liquidation + insurance skim                                      |
| **B** | On-chain health cannot call Predict preview for open positions | Off-chain `devInspect` redeem simulation                                              |
| **C** | Predict vault rate limits on liquidation                       | Per-account isolated PTBs                                                             |
| **D** | Keeper capital                                                 | DeepBook + vault flash loans                                                          |
| **E** | Multi-collateral LTV                                           | ⚠️ Health checks one `Collateral` type per call; multi-asset aggregation is off-chain |
| **F** | Range post-expiry settlement                                   | Uses `redeem_range` (no `redeem_range_permissionless` in Predict)                     |
| **G** | Build tooling                                                  | Requires Sui CLI ≥ 1.73 for `published-at` deps                                       |

---

## 5. Event catalog (frontend / indexer)

All events live in `leverx::events`. Index by `account_id`, `vault_id`, `registry_id`, `owner`, and `oracle_id`.

### 5.1 Protocol & governance

| Event                   | Key fields                                                                               | Emitted when                    |
| ----------------------- | ---------------------------------------------------------------------------------------- | ------------------------------- |
| `ProtocolDeployed`      | `registry_id`, `vault_id`, `predict_id`, `fee_collector_id`, `deployer`                  | `deploy::deploy_and_share`      |
| `RegistryInitialized`   | `registry_id`, `vault_id`, `fee_collector_id`, `predict_id`                              | `protocol_registry::initialize` |
| `CollateralWhitelisted` | `registry_id`, `asset`, `decimals`, `max_ltv_bps`, `liquidation_ltv_bps`, `max_conf_bps` | Collateral registered/updated   |

**Launch collateral** (per-asset via `whitelist_collateral_entry`, documented in env — not protocol constants): SUI 80%, dUSDC 90%, DEEP 70% max LTV; all liquidate below 95% health (`liquidation_ltv_bps = 9500`).
| `SwapPoolRegistered` | `registry_id`, `asset`, `pool_id` | Swap pool mapped |
| `TradingPausedChanged` | `registry_id`, `paused` | Pause toggled |
| `PythMaxAgeUpdated` | `registry_id`, `max_age_secs` | Oracle staleness updated |
| `BorrowRateParamsUpdated` | `vault_id`, rate curve params | Vault init (`leverage_vault::new`) and admin rate update |

### 5.2 Vault & LP

| Event                    | Key fields                                                                                                                  | Emitted when                           |
| ------------------------ | --------------------------------------------------------------------------------------------------------------------------- | -------------------------------------- |
| `VaultSupplied`          | … + `borrow_rate_bps`, `lp_apr_bps`                                                                                         | LP deposit                             |
| `VaultWithdrawn`         | … + `borrow_rate_bps`, `lp_apr_bps`                                                                                         | LP withdraw                            |
| `VaultBorrowed`          | … + `borrow_rate_bps`, `lp_apr_bps`                                                                                         | Leveraged borrow                       |
| `VaultRepaid`            | … + `borrow_rate_bps`, `lp_apr_bps`                                                                                         | Debt repayment                         |
| `InterestAccrued`        | … + `borrow_rate_bps`, `lp_apr_bps`                                                                                         | Interest tick                          |
| `FlashLoanBorrowed`      | `vault_id`, `borrower`, `amount`, `fee`                                                                                     | Vault flash loan                       |
| `FlashLoanRepaid`        | `vault_id`, `amount`, `fee`                                                                                                 | Flash repayment                        |
| `ProtocolFeeDistributed` | `vault_id`, `fee_collector_id`, `total_amount`, `vault_amount`, `collector_amount`, `keeper_amount`, `keeper`, `fee_source` | Any 80/10/10 fee split                 |
| `FeeCollectorWithdrawn`  | `fee_collector_id`, `recipient`, `amount`, `balance_after`                                                                  | Admin treasury withdraw                |
| `InsuranceFundSkimmed`   | `vault_id`, `account_id`, `amount`, `source`                                                                                | Liquidation skim amount (before split) |

**Frontend charts:** plot `VaultSupplied`/`VaultWithdrawn`/`InterestAccrued` → TVL, utilization, `borrow_rate_bps`, and `lp_apr_bps` time series.

### 5.3 User accounts

| Event                   | Key fields                                                                                                            | Emitted when         |
| ----------------------- | --------------------------------------------------------------------------------------------------------------------- | -------------------- |
| `AccountCreated`        | `account_id`, `owner`, `predict_manager_id`                                                                           | Proxy created        |
| `PredictManagerLinked`  | `account_id`, `owner`, `predict_manager_id`                                                                           | Manager linked       |
| `CollateralDeposited`   | `account_id`, `owner`, `asset`, `amount`, `collateral_value_quote`, `balance_after`                                   | Collateral in        |
| `CollateralWithdrawn`   | `account_id`, `owner`, `asset`, `amount`, `balance_after`                                                             | Collateral out       |
| `CollateralSwapped`     | `account_id`, `owner`, `base_asset`, `quote_asset`, `base_amount`, `quote_received`, `pool_id`, `quote_balance_after` | Spot swap            |
| `DebtBorrowed`          | `account_id`, `owner`, `amount`, `borrowed_quote_after`                                                               | Proxy debt increased |
| `DebtRepaid`            | `account_id`, `owner`, `amount`, `remaining_debt`                                                                     | Proxy debt decreased |
| `ProxyAccountingSynced` | `account_id`, `borrowed_quote`                                                                                        | Manual sync          |

**Frontend account view:** derive current collateral/debt from latest `CollateralDeposited`/`Withdrawn`/`Swapped` + `DebtBorrowed`/`DebtRepaid` per `account_id`.

### 5.4 Positions

| Event                     | Key fields                                                                                                                                                                                                  | Emitted when      |
| ------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------- |
| `LeveragedPositionOpened` | … + `order_type` (0=market, 1=limit), `limit_premium_per_unit`, `market_ask_at_fill`, `max_mint_cost`                                                                                                       | Mint binary/range |
| `LeveragedPositionClosed` | `account_id`, `owner`, `predict_manager_id`, `oracle_id`, `expiry_ms`, `strike`, `higher_strike`, `is_up`, `is_range`, `quantity`, `payout`, `debt_repaid`, `surplus_quote`, `remaining_debt`, `is_settled` | Redeem or settle  |

**Position key for UI:** `(oracle_id, expiry_ms, strike, higher_strike, is_up, is_range)`.

**PnL:** `payout - mint_cost` per close event; aggregate opens/closes by position key.

| Event                     | Key fields                             | Emitted when               |
| ------------------------- | -------------------------------------- | -------------------------- |
| `LimitMintOrderPlaced`    | … + `order_expires_ms`, `placed_by`    | Resting limit registered   |
| `LimitMintOrderExecuted`  | … + `order_expires_ms`                 | Keeper fills resting limit |
| `LimitMintOrderCancelled` | … + `order_expires_ms`, `cancelled_by` | Owner/executor cancels     |

### 5.5 Liquidations

| Event                | Key fields                                                                                                                                                       | Emitted when         |
| -------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------- |
| `PositionLiquidated` | `account_id`, `owner`, `keeper`, `collateral_asset`, `debt_repaid`, `collateral_seized`, `quote_from_swap`, `surplus_quote`, `health_bps`, `had_position_redeem` | Any liquidation path |

### 5.6 Triggers & executors

| Event                | Key fields                                                                        | Emitted when        |
| -------------------- | --------------------------------------------------------------------------------- | ------------------- |
| `TriggersUpdated`    | `account_id`, `oracle_id`, `is_range`, `take_profit_premium`, `stop_loss_premium` | TP/SL set           |
| `TriggersCleared`    | `account_id`, `oracle_id`, `is_range`                                             | TP/SL cleared       |
| `ExecutorRegistered` | `account_id`, `executor`                                                          | Session key added   |
| `ExecutorRevoked`    | `account_id`, `executor`                                                          | Session key removed |

### 5.7 Indexer query patterns

```typescript
// Account timeline
filter: account_id == $proxyId;
events: CollateralDeposited |
  CollateralWithdrawn |
  CollateralSwapped |
  DebtBorrowed |
  DebtRepaid |
  LeveragedPositionOpened |
  LeveragedPositionClosed |
  PositionLiquidated |
  TriggersUpdated |
  TriggersCleared;

// Vault dashboard
filter: vault_id == $vaultId;
events: VaultSupplied |
  VaultWithdrawn |
  VaultBorrowed |
  VaultRepaid |
  InterestAccrued |
  ProtocolFeeDistributed |
  InsuranceFundSkimmed;

// Protocol admin
filter: registry_id == $registryId;
events: CollateralWhitelisted | SwapPoolRegistered | TradingPausedChanged;
```

Combine with DeepBook Predict events (`PositionMinted`, `PositionRedeemed`, etc.) for full options exposure.

---

## 6. Dependencies

| Package              | Rev                    | Published (testnet) |
| -------------------- | ---------------------- | ------------------- |
| `deepbook_predict`   | `predict-testnet-4-16` | `0xf5ea2b37…5138`   |
| `deepbook`           | `predict-testnet-4-16` | `0x22be4cad…a3c`    |
| `Pyth`               | `sui-contract-testnet` | `0x28592788…44c`    |
| `Sui` / `MoveStdlib` | `61dcfdbe` (override)  | —                   |

---

## 7. Telegram bot API (off-chain)

| Command                                              | Backend action                                                            |
| ---------------------------------------------------- | ------------------------------------------------------------------------- |
| `/start`                                             | Link Telegram ID → wallet; find/create `UserProxy`; register executor cap |
| `/markets`                                           | Predict server: oracles, strikes, premiums                                |
| `/positions`                                         | `devInspect` redeem sim → health + PnL                                    |
| `/buy up\|down\|range [strike] [leverage]x [margin]` | PTB: deposit → swap → `leveraged_mint_*`                                  |
| `/close [position_id]`                               | `leveraged_redeem_*`                                                      |
| `/deleverage [amount]`                               | `deleverage_account_balance`                                              |

/** Short help copy for info popovers across LeverX UI. */
export const leverxInfo = {
  orderType:
    "Market orders fill immediately against resting liquidity. Limit orders set a max premium (¢) per contract — configure slippage and expiry via the settings control.",
  marketSlippage:
    "Maximum mint cost above the quoted cost for market orders. Protects you if the book moves before your transaction lands.",
  limitExecution:
    "Fill now attempts an immediate limit mint if the book crosses your price. Resting places an order that stays on the book until filled or cancelled.",
  placementSlippage:
    "Allowed drift versus the market ask when placing or filling a limit order.",
  orderExpires:
    "How long a resting limit order stays on the book before it expires. Fill-now limits execute in one transaction and ignore this timer.",
  collateral:
    "Asset you post as margin. Whitelisted collateral is valued via oracle and can be borrowed against up to the indexed max LTV.",
  margin:
    "Collateral you commit to this trade. Leverage multiplies notional; the vault lends the remainder as USDC borrow.",
  quantity:
    "Number of leveraged contracts to mint. Each contract settles against the oracle at expiry.",
  leverage:
    "Multiplier on margin (1.1×–10×). Higher leverage increases vault borrow and liquidation risk.",
  preTradeQuote:
    "Simulated on-chain quote via devInspect. Requires an existing UserProxy for full borrow sizing.",
  askPerUnit: "Best ask premium per contract at quote time (¢).",
  mintCost: "Total USDC-equivalent cost to mint, including your margin and protocol fees.",
  vaultBorrow: "USDC borrowed from LeverageVault to fund the leveraged portion of the position.",
  tpSl:
    "Optional on-chain triggers that auto-close when contract premium crosses your take-profit or stop-loss thresholds.",
  tpSlUnits: "% is relative to entry premium; ¢ is an absolute premium per contract.",
  lowerStrike:
    "Lower bound of the vertical range (exclusive). The range pays if settlement lands inside (lower, upper].",
  upperStrike: "Upper bound of the vertical range (inclusive).",
  limitPrice: "Maximum premium (¢) you will pay per contract when opening a limit order.",
  rangeMarket: "Vertical range pays when oracle settlement lands inside your strike band.",

  marginOpen: "Sum of margin locked in your open leveraged positions.",
  borrowedQuote: "Outstanding USDC debt borrowed from the vault across your account.",
  openPositions: "Count of active leveraged positions indexed for your wallet.",
  openPositionsTable:
    "Use the ⋯ menu to close at market, close at limit, repay vault debt, or settle after expiry.",
  accountSettings:
    "Link your Predict manager and register session executors for delegated or automated trading.",
  predictManager:
    "On-chain PredictManager that holds your positions. Must match the manager linked to your UserProxy.",
  sessionExecutor:
    "Delegated address allowed to sign trades on your behalf without holding your main wallet key.",
  triggers:
    "Active take-profit and stop-loss triggers registered on-chain. Clear them when you close the matching position.",
  collateralBalances:
    "Per-position collateral held in your UserProxy, indexed by position key and asset type.",
  liquidations:
    "Recent liquidation events where vault debt was repaid from your posted collateral.",

  vaultSupply:
    "Deposit dUSDC into LeverageVault and receive lxPLP shares. LPs earn yield from trader borrow fees.",
  vaultWithdraw: "Burn lxPLP shares to withdraw dUSDC plus accrued yield from the pool.",
  vaultAmount: "dUSDC to supply, or lxPLP shares to burn when withdrawing.",
  vaultTvl: "Total net asset value of liquidity in the LeverageVault pool.",
  vaultApr: "Annualized yield paid to liquidity providers from borrow utilization and fees.",
  vaultUtil: "Share of vault liquidity currently lent to leveraged traders.",

  markPrice: "Current oracle spot price for the underlying asset.",
  premium: "Last traded or quoted premium for this strike and expiry (¢, probability-style).",
  volume24h: "Notional traded in the last 24 hours for this market key.",
  vaultNav: "Net asset value of the LeverageVault liquidity pool backing trader borrow.",
  autoClose: "Position expiry — contracts auto-settle after this timestamp.",

  orderBook:
    "Resting buy (bid) and sell (ask) orders for leveraged contracts on this market key.",
  orderBookSide:
    "Long book shows liquidity to open long exposure; Short book mirrors bids and asks for short exposure.",
  spread: "Gap between the best ask and best bid premiums.",

  balanceTotal: "Total margin locked across open positions (header wallet pill).",
  balanceMargin: "Collateral margin posted in open positions.",
  balanceBorrowed: "Vault debt outstanding on your account.",
  balancePositions: "Number of open leveraged positions.",

  closeMarket: "Redeem immediately at the best available bid, subject to slippage settings.",
  closeLimit: "Redeem only if the bid premium meets your minimum (¢).",
  repayDebt:
    "Pay down vault borrow with wallet USDC without fully closing the position.",
  settleExpired:
    "Finalize an expired position and clear remaining vault debt after oracle settlement.",
  tradingPaused: "Protocol admin has paused new mints on-chain. Closes and vault ops may still work.",
  protocolNotConfigured:
    "Registry, vault, fee collector, or Pyth oracle IDs are missing from env / indexer. Trades cannot be built until configured.",
} as const;

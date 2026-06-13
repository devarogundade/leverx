/** Short help copy for info popovers across LeverX UI. */
export const leverxInfo = {
  orderType:
    "Market orders open right away at the best available price. Limit orders default to Resting (pending) — set your max price and they appear under Open Orders until filled.",
  marketSlippage:
    "How much extra you allow above the quoted price if the market moves before your trade goes through.",
  limitExecution:
    "Resting (default) queues your order under Open Orders until the market reaches your price. Fill now opens immediately if the live price is within your limit + slippage.",
  placementSlippage: "How far the price can move from your target when your order fills.",
  orderExpires: "How long a waiting order stays open before it is cancelled.",
  collateral: "dUSDC margin posted for a trade.",
  margin: "dUSDC you deposit per trade (0.1–100 dUSDC). Higher leverage borrows from the vault to increase position size.",
  quantity: "How many contracts you are opening. Each one pays out based on the final price at expiry.",
  leverage:
    "Multiplier on your deposit (1×–10×). At 1× there is no vault borrow. Leverage above 1× closes one hour before market expiry.",
  leveragedMintWindow:
    "New leveraged positions cannot be opened in the final hour before expiry. Existing borrowed positions in that window are force-deleveraged to 1× (or liquidated if underwater).",
  preTradeQuote: "Estimated cost before you confirm. Connect your wallet for the most accurate number.",
  askPerUnit: "Best available price per contract right now.",
  mintCost: "Total cost to open, including your deposit and any fees.",
  vaultBorrow: "Amount borrowed from the vault to reach your target leverage.",
  tpSl:
    "Optional auto-exit when the contract premium hits your take-profit or stop-loss price (¢ per contract). Take profit should be above entry; stop loss below entry.",
  tpSlEntry: "Estimated entry premium for this trade — used to suggest TP/SL levels.",
  tpSlTakeProfit: "Close when the contract premium rises to this price (above entry).",
  tpSlStopLoss: "Close when the contract premium falls to this price (below entry).",
  strikePrice:
    "Price level for this bet. Market uses the current spot (rounded to the oracle tick). Presets offset from spot; Custom lets you enter any valid strike at or above the oracle minimum.",
  lowerStrike: "Bottom of the range — the bet pays if the final price lands inside your band.",
  upperStrike: "Top of the range — the bet pays if the final price lands inside your band.",
  limitPrice: "Most you will pay per contract when placing a limit order.",
  rangeMarket: "Pays when the final price lands inside your chosen range.",

  marginOpen: "Total you have locked in open trades.",
  borrowedQuote: "Amount borrowed from the pool across your account.",
  openPositions: "Number of trades still open.",
  openPositionsTable:
    "Live unrealized P&L and health update from on-chain redeem quotes. Use Manage to close, repay debt, or settle after expiry.",
  accountSettings:
    "Link your trading account and allow trusted addresses to trade on your behalf.",
  predictManager: "Your on-chain trading account that holds positions.",
  sessionExecutor: "A trusted address allowed to trade for you without your main wallet key.",
  triggers: "Active profit-target and stop-loss rules. Clear them when you close the matching trade.",
  collateralBalances: "dUSDC margin allocated to each open market key.",
  marginInTrades: "dUSDC margin allocated to each open market key.",
  liquidations: "Times the pool stepped in to close a trade because margin ran too low.",
  withdrawTradingBalance:
    "dUSDC credited to your trading account after closing a trade. Withdraw here to your wallet once key borrow is fully repaid.",
  estimatedHealth:
    "Estimated collateral ratio (mark value ÷ borrow). On-chain health also considers accrued interest and per-key ledger state.",

  vaultSupply: "Add dUSDC to the pool and receive shares that earn from trading fees.",
  vaultWithdraw: "Cash out your shares back to dUSDC, including any earnings.",
  vaultAmount: "dUSDC to deposit, or shares to redeem when withdrawing.",
  vaultTvl: "Total value currently in the pool.",
  vaultApr: "Estimated yearly return from trading fees and borrow demand.",
  vaultUtil: "Share of pool funds currently lent to traders.",

  markPrice: "Live price of the underlying asset.",
  premium: "Current contract price for this market (shown in cents).",
  volume24h: "Total traded in the last 24 hours.",
  vaultNav: "Total value in the pool backing leveraged trades.",
  autoClose: "When this market settles and your position closes.",

  orderBook:
    "Resting limit bids from traders and the live LP mint price. Bids are real open limits; the ask is the current vault mint quote.",
  orderBookSide: "Switch outcome to view limits and LP pricing for UP, DOWN, or RANGE.",
  spread: "Gap between the best limit bid and the live LP mint price.",

  balanceTotal: "Estimated net equity across open trades (mark value minus borrow).",
  balanceMargin: "Your own funds posted in open trades.",
  balanceBorrowed: "Amount borrowed from the pool.",
  balancePositions: "Number of open trades.",
  unrealizedPnl: "Profit or loss if you closed all open trades at the current redeem bid.",
  openOrders: "Resting limit orders waiting to be filled.",
  closedPositions: "Trades that have been closed or settled.",

  closeMarket: "Close now at the best available price.",
  closeLimit: "Close only if the price meets your minimum.",
  repayDebt: "Pay back borrowed dUSDC without fully closing the trade.",
  settleExpired: "Finalize a trade after the market has expired.",
  tradingPaused: "New trades are temporarily paused. You may still be able to close positions.",
  protocolNotConfigured:
    "Trading is not fully set up yet. Check back once the app is connected to live markets.",

  landingHealth:
    "Each trade tracks whether you are ahead or behind. If the market moves too far against you, the position may be closed automatically.",
  landingVault:
    "The pool holds dUSDC for settlement and borrow. Add funds and earn a share of fees over time.",
  landingKeeper:
    "A helper is a small app you run in the background. It keeps markets fair and you can earn fees when yours completes work first.",

  keeperPull: "Official download for the LeverX helper app.",
  keeperPrivateKey:
    "A demo wallet that pays network fees. Use a separate wallet with only enough for fees — never share your main key.",
  keeperKeyHint: "Add your key as an environment variable. Never save it in code or commit it to git.",
  keeperRun: "Starts the helper on port 3001.",
  keeperRunHint: "Replace the placeholder key before starting. Restart if you change keys.",
  keeperHealth: "Shows OK when the helper is up and responding.",
  keeperRewards:
    "When your helper closes a risky trade or settles an expired one, you may receive part of the fee.",
} as const;

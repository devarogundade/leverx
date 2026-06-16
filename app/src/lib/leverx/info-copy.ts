/** Short help copy for info popovers across LeverX UI. */
export const leverxInfo = {
  orderType:
    "Market orders open right away at the best available price. Limit orders queue under Open Orders until the market reaches your price.",
  marketSlippage: "How far the price can move from your target when your order fills.",
  orderExpires: "How long a waiting order stays open before it is cancelled.",
  collateral: "dUSDC margin posted for a trade.",
  margin:
    "dUSDC from your trading account per trade (0.1–100 dUSDC). Deposit in Portfolio first. Higher leverage borrows from the vault to increase position size.",
  quantity: "How many contracts you are opening. Each one pays out based on the final price at expiry.",
  leverage:
    "Multiplier on your deposit (1×–10×). At 1× there is no vault borrow. Leverage above 1× closes one hour before market expiry.",
  leveragedMintWindow:
    "New leveraged positions cannot be opened in the final hour before expiry. Existing borrowed positions in that window are force-deleveraged to 1× (or liquidated if underwater).",
  leverageCountdown:
    "Countdown until new trades are limited to 1× margin (no vault borrow). In the final hour, only the market settlement timer remains.",
  preTradeQuote: "Estimated cost before you confirm. Sign in for the most accurate number.",
  askPerUnit: "Best available price per contract right now.",
  mintCost: "Total cost to open, including your deposit and any fees.",
  vaultBorrow: "Amount borrowed from the vault to reach your target leverage.",
  tpSl:
    "Optional auto-exit when the contract premium hits your take-profit or stop-loss price (¢ per contract). Take profit should be above entry; stop loss below entry.",
  tpSlEntry: "Estimated entry premium for this trade — used to suggest TP/SL levels.",
  tpSlTakeProfit: "Close when the contract premium rises to this price (above entry).",
  tpSlStopLoss: "Close when the contract premium falls to this price (below entry).",
  tpSlExitSlippage:
    "Maximum price movement allowed when your take-profit or stop-loss closes automatically (same limits as market orders for market exits, limit orders for limit exits).",
  remintAfterDeleverage:
    "If the pool force-deleverages your position, automatically reopen at 1× with any leftover margin. Turn off to stay in cash after deleverage.",
  strikePrice:
    "Price level for this bet. Market uses the current spot (rounded to the oracle tick). Presets offset from spot; Custom lets you enter any valid strike at or above the oracle minimum.",
  lowerStrike: "Bottom of the range — the bet pays if the final price lands inside your band.",
  upperStrike: "Top of the range — the bet pays if the final price lands inside your band.",
  limitPrice: "Most you will pay per contract when placing a limit order.",
  rangeMarket: "Pays when the final price lands inside your chosen range.",
  rangePreset:
    "Market is a tight band around spot (±1 tick). Percent presets widen the band symmetrically. Custom sets exact low and high strikes.",

  marginOpen: "Total you have locked in open trades.",
  borrowedQuote: "Amount borrowed from the pool across your account.",
  openPositions: "Number of trades still open.",
  openPositionsTable:
    "Live profit and loss and health update as prices move. Use Manage to close, repay debt, or settle after expiry.",
  positionAvgFill:
    "Average price you paid per contract when you opened (total mint cost ÷ contracts). Repaying borrow or lowering leverage does not change this.",
  positionNow:
    "Current redeem bid per contract (open positions) or average exit price when you closed.",
  positionPnlMargin:
    "Net cash back minus everything you put in from your wallet: posted margin plus any repay/deleverage payments while the position was open.",
  positionMarginBorrow:
    "Your posted margin and vault borrow on this market key. Borrow drops when you repay; leverage updates with it.",
  closedPnlBreakdown:
    "Cash you received after close, minus margin posted and any wallet repayments made before close (deleverage/repay debt). Borrow repaid at close comes from the redeem payout, not your wallet.",
  accountSettings:
    "Link your trading account and allow trusted apps to trade on your behalf.",
  predictManager: "Your trading account that holds positions and balances.",
  sessionExecutor:
    "A trusted wallet or bot that can place trades for you without your main wallet key.",
  telegramAlerts:
    "Telegram notifications for limit fills, liquidation risk, and completed liquidations on this trading account.",
  telegramTrading:
    "Trade from Telegram. Generate a one-time code here, send /auth in the bot, then use /markets and /up. Sessions last 7 days; disconnect anytime.",
  jarvis:
    "AI assistant that checks your account every 5 minutes, manages risk, finds opportunities in markets closing soon, and closes losing positions.",
  jarvisExecutor:
    "Jarvis places trades through the platform trading service. Deposit dUSDC to your account before you turn Jarvis on.",
  triggers: "Active profit-target and stop-loss rules. Clear them when you close the matching trade.",
  collateralBalances: "dUSDC margin allocated to each open market key.",
  marginInTrades: "dUSDC margin allocated to each open market key.",
  liquidations:
    "Liquidations, force-deleverages, and bad-debt write-offs when health falls below the protocol threshold.",
  withdrawTradingBalance: "Move surplus to your wallet.",
  withdrawDialogDescription:
    "Withdraw free surplus from your trading account to your wallet. Outstanding vault borrow reduces what you can pull out (withdrawable = key balance − borrow).",
  withdrawDialogWithdrawableHint:
    "Free surplus on each market key — not vault borrow (debt), and not margin locked in open trades.",
  withdrawTradingBalanceDetail:
    "dUSDC credited after closing a trade or adding margin. You can withdraw up to the free balance on each key after subtracting any outstanding borrow on that key.",
  depositTradingBalance: "Move dUSDC from your wallet to trade.",
  depositTradingBalanceDetail:
    "Deposits go to a specific market on your trading account. Your trusted trading bot uses that balance when placing trades.",
  funds:
    "Move dUSDC between wallet and trading account. Withdrawable is free surplus you can pull out now (key balance minus borrow).",
  portfolioOverviewDetail:
    "Net equity, unrealized P&L, margin posted, and vault borrow across open positions. Live marks refresh about every 12 seconds.",
  withdrawEmpty: "Nothing to withdraw right now.",
  withdrawEmptyDetail:
    "Withdrawable is free surplus on your trading account — not borrowed vault debt. Surplus appears on a market key after you close a trade and that key’s payout lands.",
  managerWithdrawLockedDetail:
    "Borrowed is debt on your trading account, not cash you can pull out. Outstanding vault borrow reduces what you can withdraw (withdrawable = trading-account balance − borrow). Close positions or repay debt to free more.",
  estimatedHealth:
    "Estimated collateral ratio (mark value ÷ borrow). Liquidation can trigger above 100% when extra buffer is required. Health also includes accrued interest.",

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

  balanceTotal:
    "Wallet dUSDC plus margin and free trading-account surplus, minus vault borrow across your account.",
  balanceWithdrawable: "Surplus you can withdraw to your wallet now.",
  balanceWithdrawableHint:
    "Free surplus only — not vault borrow (debt), and not margin in open trades.",
  balanceWithdrawableDetail:
    "Counts dUSDC sitting as free surplus on your trading-account market keys. Outstanding vault borrow reduces it (withdrawable = trading-account balance − borrow); borrowed debt itself is not withdrawable.",
  balanceWallet: "dUSDC available in your account (not yet in open trades).",
  balanceMargin: "Your own funds posted in open trades.",
  balanceBorrowed:
    "Vault debt from leveraged trades. Not withdrawable — repay by closing positions or repaying debt.",
  balancePositions: "Number of open trades.",
  unrealizedPnl: "Profit or loss if you closed all open trades at the current redeem bid.",
  openOrders: "Resting limit orders waiting to be filled.",
  closedPositions:
    "Trades that have been closed or settled. Avg fill is what you paid per contract; P&L is your net return on posted margin (can be positive even when exit price is below entry, after borrow is repaid).",

  closeMarket: "Close now at the best available price.",
  closeLimit: "Close only if the price meets your minimum.",
  repayDebt: "Pay back borrowed dUSDC without closing contracts. Leverage and borrow update after repay.",
  settleExpired:
    "Finalize redemption after the market settles. Uses your actual contract count, not the portfolio summary.",
  tradingPaused:
    "New opens, limit fills, and triggers are paused. You can still close, repay debt, and settle expired positions.",
  quotePaused:
    "Live contract pricing is unavailable right now. New orders are paused until the quote recovers.",
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

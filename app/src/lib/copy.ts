/** Shared plain-language labels for UI surfaces. */
export const ui = {
  appTagline: "Leveraged trading on price predictions",
  tabMarkets: "Markets",
  tabPortfolio: "Portfolio",
  tabPoints: "Points",
  connectHint: "Demo network",
  priceNow: "Price now",
  markPrice: "Current price",
  priceChart: "Price chart",
  predictionCatalogHint: "Live markets you can trade right now",
  predictionActiveOnly: "Active only",
  predictionSearchPlaceholder: "Search markets…",
  predictVaultTitle: "Shared pool",
  predictVaultHint: "dUSDC pool backing settlement and borrow on demo markets",
  predictVaultValue: "Pool value",
  predictVaultUtilization: "In use",
  predictVaultMaxPayoutUtil: "Max payout",
  predictVaultAvailable: "Available to borrow",
  predictPlpSharePrice: "Your share price",
  vaultPageTitle: "Pool",
  vaultPageHint:
    "Add dUSDC to the pool and earn from trading fees as activity grows.",
  vaultApr: "Estimated return",
  vaultYourPosition: "Your balance",
  vaultYourEarned: "Total earned",
  vaultAvailableWithdraw: "Available to withdraw",
  vaultLiquidityAction: "Action",
  vaultSupply: "Deposit",
  vaultWithdraw: "Withdraw",
  vaultSupplyAmount: "Deposit amount",
  vaultWithdrawAmount: "Withdraw amount",
  vaultSupplyCta: "Deposit dUSDC",
  vaultWithdrawCta: "Withdraw dUSDC",
  vaultActionHint:
    "Deposit dUSDC to earn from trading activity, or withdraw your balance anytime. Connect your wallet first.",
  vaultPoolDetails: "Pool details",
  vaultPoolDetailsHint: "Live stats updated as trading activity changes.",
  vaultChartTitle: "Performance",
  vaultChartTvl: "Pool size",
  vaultChartApr: "Return",
  vaultChartEmpty: "No history yet",
  vaultChartEmptyHint: "Charts appear once the pool has activity.",
  keeperPageTitle: "Run a helper",
  keeperPageHint:
    "Helpers keep markets running — closing expired trades, matching orders, and stepping in on risky positions. You can earn a share of fees when yours runs successfully.",
  keeperStepPull: "Download the app",
  keeperStepKey: "Connect your wallet",
  keeperStepRun: "Start the helper",
  keeperHealthLabel: "Make sure it is running",
  keeperIndexerHint:
    "If you host your own setup, point the app to your helper’s address (default uses port 3001).",
  keeperRewardsHint: "Successful helper runs can earn a share of protocol fees.",
  keeperVaultLink: "Prefer passive income? Add funds to the pool instead",
  portfolioHint: "Your account balance, profit and loss, and open trades.",
  portfolioAccountValue: "Account value",
  balanceTotal: "Total balance",
  balanceAvailable: "Avail",
  balanceInPositions: "In open trades",
  balanceRealizedPnl: "Realized profit & loss",
  balanceConnectHint: "Connect your wallet to see your balance.",
  predictManagerTitle: "Your trading account",
  predictManagerHint: "Balance and open trades for your wallet",
  predictManagerBalance: "Trading balance",
  predictManagerRealizedPnl: "Realized P&L",
  predictManagerUnrealizedPnl: "Unrealized P&L",
  predictManagerOpenPositions: "Open trades",
  predictManagerRecentPositions: "Recent trades",
  predictManagerEmpty: "No trading account yet — one is created when you place your first trade.",
  predictOracleSpot: "Price",
  backToMarkets: "Back to markets",
  connectForTrades: "Connect your wallet to trade and view your positions.",
  connectToTrade: "Connect your wallet to open a trade.",
  tradeUp: "UP",
  tradeDown: "DOWN",
  tradeRange: "RANGE",
  instrumentsHint: "Bet price goes up, down, or stays in a range",
  loadingMarkets: "Loading markets…",
  loadingOracles: "Loading markets…",
  loadingVault: "Loading pool…",
  loadingManager: "Loading account…",
  loadingTrades: "Loading trades…",
  loadingChart: "Loading chart…",
  emptyMarkets: "No markets right now",
  emptyMarketsHint: "Markets will show up here when they are available to trade.",
  emptyFavoriteMarkets: "No favorites yet",
  emptyFavoriteMarketsHint: "Bookmark markets from the list to find them here quickly.",
  emptyPositions: "No open trades",
  emptyPositionsHint: "Your open trades will appear here after your first position.",
  predictServerDisabled: "Live data unavailable",
  predictServerDisabledHint: "Some numbers may show placeholders until the connection is restored.",
} as const;

const MAX_DISPLAY_FRACTION_DIGITS = 6;
const LARGE_AMOUNT_FRACTION_DIGITS = 2;
const LARGE_AMOUNT_THRESHOLD = 1000;
const SUBSCRIPT_ZERO_THRESHOLD = 4;

const SUBSCRIPT_DIGITS = "₀₁₂₃₄₅₆₇₈₉";

function toSubscriptDigits(count: number): string {
  return String(count).replace(/[0-9]/g, (digit) => SUBSCRIPT_DIGITS[Number(digit)]!);
}

export function formatAmount(value: number): string {
  if (!Number.isFinite(value)) return "0";

  const sign = value < 0 ? "-" : "";
  const abs = Math.abs(value);
  if (abs === 0) return "0";

  if (abs < 10 ** -SUBSCRIPT_ZERO_THRESHOLD) {
    const rounded = Number(abs.toFixed(MAX_DISPLAY_FRACTION_DIGITS));
    if (rounded === 0) return "0";

    const fracPart = rounded.toFixed(MAX_DISPLAY_FRACTION_DIGITS).split(".")[1] ?? "";
    let zeroCount = 0;
    for (const ch of fracPart) {
      if (ch === "0") zeroCount++;
      else break;
    }

    const significant = fracPart.slice(zeroCount).replace(/0+$/, "");
    if (!significant) return "0";

    return `${sign}0.0${toSubscriptDigits(zeroCount)}${significant}`;
  }

  const fractionDigits =
    abs >= LARGE_AMOUNT_THRESHOLD ? LARGE_AMOUNT_FRACTION_DIGITS : MAX_DISPLAY_FRACTION_DIGITS;
  const rounded = Number(abs.toFixed(fractionDigits));
  if (rounded === 0) return "0";

  return (
    sign +
    rounded.toLocaleString(undefined, {
      maximumFractionDigits: fractionDigits,
      minimumFractionDigits: 0,
    })
  );
}

export function formatPrice(_base: string, value: number): string {
  return `$${formatAmount(value)}`;
}

export function formatUsdc(amount: number): string {
  return `${formatAmount(amount)} USDC`;
}

export function formatCount(value: number): string {
  if (!Number.isFinite(value) || value < 0) return "0";
  return value.toLocaleString();
}

/** Compact USD for tables, e.g. $32K / $1.2M */
export function formatCompactUsd(amount: number): string {
  if (!Number.isFinite(amount) || amount <= 0) return "—";
  const abs = Math.abs(amount);
  if (abs >= 1_000_000) return `$${(amount / 1_000_000).toFixed(1)}M`;
  if (abs >= 1_000) return `$${Math.round(amount / 1_000)}K`;
  return `$${Math.round(amount)}`;
}

/** Shared plain-language labels for UI surfaces. */
export const ui = {
  appTagline: "The margin layer for DeepBook Predict",
  tabMarkets: "Markets",
  tabPortfolio: "Portfolio",
  tabPoints: "Points",
  connectHint: "Sui testnet",
  priceNow: "Price now",
  markPrice: "Mark price",
  priceChart: "Price chart",
  predictionCatalogHint: "Markets indexed from on-chain Predict activity",
  predictionActiveOnly: "Active only",
  predictionSearchPlaceholder: "Search oracles…",
  predictVaultTitle: "Shared vault",
  predictVaultHint: "LP vault backing Predict binary markets on testnet",
  predictVaultValue: "Vault value",
  predictVaultUtilization: "Utilization",
  predictVaultMaxPayoutUtil: "Max payout util.",
  predictVaultAvailable: "Available liquidity",
  predictPlpSharePrice: "lxPLP share price",
  vaultPageTitle: "Vault",
  vaultPageHint:
    "Supply dUSDC to the LeverageVault pool. LPs earn yield from leveraged trading fees and borrow demand on DeepBook Predict markets.",
  vaultApr: "Pool APR",
  vaultYourPosition: "Your position",
  vaultYourEarned: "Total earned",
  vaultAvailableWithdraw: "Available to withdraw",
  vaultLiquidityAction: "Action",
  vaultSupply: "Supply",
  vaultWithdraw: "Withdraw",
  vaultSupplyAmount: "Supply amount",
  vaultWithdrawAmount: "Withdraw amount",
  vaultSupplyCta: "Supply dUSDC",
  vaultWithdrawCta: "Withdraw dUSDC",
  vaultActionHint:
    "Supply dUSDC to earn LP yield or withdraw lxPLP shares. Requires a connected wallet and deployed protocol IDs.",
  vaultPoolDetails: "Pool details",
  vaultPoolDetailsHint: "Live stats from the LeverX indexer vault snapshots.",
  vaultChartTitle: "Performance",
  vaultChartTvl: "TVL",
  vaultChartApr: "APR",
  vaultChartEmpty: "No vault history yet",
  vaultChartEmptyHint: "Performance data will appear once the pool has activity.",
  keeperPageTitle: "Run a keeper",
  keeperPageHint:
    "Keepers are helper nodes that keep the protocol running — settling expired trades, filling limit orders, and closing risky positions. You earn a share of fees when your node submits work.",
  keeperStepPull: "Pull the Docker image",
  keeperStepKey: "Set your wallet key",
  keeperStepRun: "Start the container",
  keeperHealthLabel: "Check it is running",
  keeperIndexerHint:
    "Point the app indexer URL to your node if you self-host (default stack uses port 3001).",
  keeperRewardsHint: "Successful keeper transactions can earn a caller reward from protocol fees.",
  keeperVaultLink: "Prefer passive yield? Supply to the vault instead",
  portfolioHint: "Your trading account, PnL, and open leveraged positions.",
  portfolioAccountValue: "Account value",
  balanceTotal: "Total balance",
  balanceAvailable: "Available to trade",
  balanceInPositions: "In positions",
  balanceRealizedPnl: "Realized P&L",
  balanceConnectHint: "Connect your wallet to see your trading balance.",
  predictManagerTitle: "Your Predict manager",
  predictManagerHint: "Trading balance and binary positions via Predict Manager",
  predictManagerBalance: "Trading balance",
  predictManagerRealizedPnl: "Realized PnL",
  predictManagerUnrealizedPnl: "Unrealized PnL",
  predictManagerOpenPositions: "Open positions",
  predictManagerRecentPositions: "Recent positions",
  predictManagerEmpty:
    "No Predict manager for this wallet yet — one is created when you place your first trade.",
  predictOracleSpot: "Spot",
  backToMarkets: "Back to markets",
  connectForTrades: "Connect your wallet to trade and view positions.",
  connectToTrade: "Connect your wallet to open a leveraged trade.",
  tradeUp: "UP",
  tradeDown: "DOWN",
  tradeRange: "RANGE",
  instrumentsHint: "DeepBook Predict: UP, DOWN, and vertical RANGE instruments",
  loadingMarkets: "Loading markets…",
  loadingOracles: "Loading oracles…",
  loadingVault: "Loading vault…",
  loadingManager: "Loading Predict manager…",
  loadingTrades: "Loading trades…",
  loadingChart: "Loading price history…",
  emptyMarkets: "No active markets",
  emptyMarketsHint: "Active Predict oracles will appear here when the testnet catalog is available.",
  emptyPositions: "No open positions",
  emptyPositionsHint: "Your leveraged Predict positions will show here after your first trade.",
  predictServerDisabled: "Indexer offline",
  predictServerDisabledHint: "Live stats show placeholders until the indexer is reachable.",
} as const;

const MAX_DISPLAY_FRACTION_DIGITS = 6;
const LARGE_AMOUNT_FRACTION_DIGITS = 2;
const LARGE_AMOUNT_THRESHOLD = 1000;
const SUBSCRIPT_ZERO_THRESHOLD = 4;

const SUBSCRIPT_DIGITS = "₀₁₂₃₄₅₆₇₈₉";

function toSubscriptDigits(count: number): string {
  return String(count).replace(/[0-9]/g, (digit) => SUBSCRIPT_DIGITS[Number(digit)]!);
}

function formatAmount(value: number): string {
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

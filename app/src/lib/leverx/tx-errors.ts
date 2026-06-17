import {
  formatInsufficientGasMessage,
  GAS_BUDGET_EXCEEDED_MESSAGE,
  INSUFFICIENT_GAS_MESSAGE,
  InsufficientGasError,
  isGasBudgetExceededError,
  isInsufficientGasError,
  parseGasBalanceShortfall,
} from "@/lib/sui/insufficient-gas";

const PREMIUM_BOUNDS_MESSAGE =
  "Contract price is outside DeepBook Predict's tradable range (1¢–99¢). The market may be near expiry or temporarily unpriced — try another strike or wait for updated oracle prices.";

const MINT_COST_EXCEEDS_POSITION_MESSAGE =
  "Mint cost exceeds your leveraged position size. Try a smaller deposit, lower leverage, or wait for a better contract price.";

const SLIPPAGE_EXCEEDED_MESSAGE =
  "Market moved beyond your slippage tolerance before the trade executed. Try again or increase slippage.";

const LIMIT_PRICE_NOT_MET_MESSAGE =
  "Live contract price is above your limit. Raise the limit or switch to Resting.";

const PLACEMENT_PRICE_NOT_ALIGNED_MESSAGE =
  "Live contract price is outside your limit ± placement slippage. Adjust the limit or widen placement slippage.";

const SLIPPAGE_TOO_HIGH_MESSAGE =
  "Slippage exceeds the maximum allowed (50%). Lower slippage and try again.";

const LEVERAGED_MINT_OUTSIDE_WINDOW_MESSAGE =
  "Leverage above 1× closes one hour before this market expires.";

const FORCE_DELEVERAGE_OUTSIDE_WINDOW_MESSAGE =
  "Force deleverage is only available in the final hour before this market expires.";

const INSUFFICIENT_POSITION_MESSAGE =
  "Your account does not hold enough contracts for this market. Refresh your portfolio — the position may already be settled.";

const TRADING_PAUSED_MESSAGE =
  "Trading is paused for new opens and limit fills. You can still close, repay debt, and settle expired positions.";

const OPEN_HEALTH_BELOW_LIQUIDATION_MESSAGE =
  "Projected position health is below the protocol liquidation threshold. Lower leverage, add margin, or wait for a better contract price.";

const NOT_OWNER_MESSAGE =
  "This action can only be performed by the wallet that owns this trading account. Reconnect with the original wallet and try again.";

const NOT_AUTHORIZED_MESSAGE =
  "Your wallet isn't authorized to act on this trading account. If you just created it, refresh your portfolio and try again.";

const INVALID_MANAGER_MESSAGE =
  "This trading account is linked to a different settlement account. Refresh your portfolio and try again.";

const NOT_KEEPER_MESSAGE =
  "The trading service isn't authorized for this action right now. Try again shortly.";

const MANAGER_OWNER_MESSAGE =
  "The trade could not be completed on your account. Refresh your portfolio and try again in a moment.";

const RELAY_FAILED_MESSAGE = "Your trade could not be completed. Please try again in a moment.";

/** A relayed trade op (mint/redeem/settle) bounced back from the keeper API. */
function isRelayFailure(raw: string): boolean {
  return /\/trade\/(mint|redeem|settle)_failed/.test(raw);
}

export function formatTxError(error: unknown): string {
  const raw =
    error instanceof Error
      ? error.message
      : typeof error === "string"
        ? error
        : "Transaction failed.";
  if (error instanceof InsufficientGasError) {
    return error.message;
  }
  const gasShortfall = parseGasBalanceShortfall(raw);
  if (gasShortfall) {
    return formatInsufficientGasMessage(gasShortfall.have, gasShortfall.needed);
  }
  if (isInsufficientGasError(raw)) {
    return INSUFFICIENT_GAS_MESSAGE;
  }
  if (isGasBudgetExceededError(raw)) {
    return GAS_BUDGET_EXCEEDED_MESSAGE;
  }
  if (raw.includes("trading_paused") || (raw.includes("trade") && raw.includes(", 2)"))) {
    return TRADING_PAUSED_MESSAGE;
  }
  if (
    raw.includes("assert_premium_within_bounds") ||
    (raw.includes("predict_client") && raw.includes(", 27)"))
  ) {
    return PREMIUM_BOUNDS_MESSAGE;
  }
  if (
    raw.includes("mint_cost_exceeds_position") ||
    (raw.includes("trade") && raw.includes(", 23)"))
  ) {
    return MINT_COST_EXCEEDS_POSITION_MESSAGE;
  }
  if (raw.includes("slippage_exceeded") || (raw.includes("trade") && raw.includes(", 26)"))) {
    return SLIPPAGE_EXCEEDED_MESSAGE;
  }
  if (raw.includes("limit_price_not_met") || (raw.includes("trade") && raw.includes(", 25)"))) {
    return LIMIT_PRICE_NOT_MET_MESSAGE;
  }
  if (
    raw.includes("placement_price_not_aligned") ||
    (raw.includes("trade") && raw.includes(", 30)"))
  ) {
    return PLACEMENT_PRICE_NOT_ALIGNED_MESSAGE;
  }
  if (
    raw.includes("slippage_too_high") ||
    (raw.includes("predict_client") && raw.includes(", 32)"))
  ) {
    return SLIPPAGE_TOO_HIGH_MESSAGE;
  }
  if (
    raw.includes("leveraged_mint_outside_window") ||
    (raw.includes("trade") && raw.includes(", 42)"))
  ) {
    return LEVERAGED_MINT_OUTSIDE_WINDOW_MESSAGE;
  }
  if (
    raw.includes("force_deleverage_outside_window") ||
    (raw.includes("trade") && raw.includes(", 47)"))
  ) {
    return FORCE_DELEVERAGE_OUTSIDE_WINDOW_MESSAGE;
  }
  if (
    raw.includes("decrease_position") ||
    (raw.includes("predict_manager") && raw.includes(", 1)"))
  ) {
    return INSUFFICIENT_POSITION_MESSAGE;
  }
  if (
    raw.includes("open_health_below_liquidation") ||
    (raw.includes("trade") && raw.includes(", 51)"))
  ) {
    return OPEN_HEALTH_BELOW_LIQUIDATION_MESSAGE;
  }
  // Authorization aborts (errors.move): not_owner=1, invalid_manager=9,
  // not_authorized=17, not_keeper=53. Match the owning module to avoid clashing
  // with predict_manager(", 1)") which means insufficient contracts.
  if (
    raw.includes("not_keeper") ||
    ((raw.includes("trade") || raw.includes("protocol_registry") || raw.includes("liquidation")) &&
      raw.includes(", 53)"))
  ) {
    return NOT_KEEPER_MESSAGE;
  }
  if (
    raw.includes("not_authorized") ||
    ((raw.includes("user_proxy") || raw.includes("trade") || raw.includes("triggers")) &&
      raw.includes(", 17)"))
  ) {
    return NOT_AUTHORIZED_MESSAGE;
  }
  if (
    raw.includes("invalid_manager") ||
    ((raw.includes("user_proxy") || raw.includes("trade")) && raw.includes(", 9)"))
  ) {
    return INVALID_MANAGER_MESSAGE;
  }
  if (
    raw.includes("not_owner") ||
    ((raw.includes("user_proxy") || raw.includes("trade") || raw.includes("triggers")) &&
      raw.includes(", 1)"))
  ) {
    return NOT_OWNER_MESSAGE;
  }
  // DeepBook Predict owner gate (EInvalidOwner) when the keeper executes against
  // the manager — surfaces via the relayed op's error detail.
  if (
    (raw.includes("predict") || isRelayFailure(raw)) &&
    (raw.includes("EInvalidOwner") || raw.includes("invalid_owner"))
  ) {
    return MANAGER_OWNER_MESSAGE;
  }
  if (
    raw.includes("LeverxOnboardingError") ||
    raw.includes("trading account is still being set up")
  ) {
    return "Your trading account is still being set up. Refresh your portfolio in a moment and try again.";
  }
  if (raw.includes("FunctionNotFound")) {
    return "This app build is out of sync with the on-chain LeverX package. Refresh the page; if it persists, open Portfolio → Account to set up a new trading account.";
  }
  if (
    raw.includes("LeverxDeployMismatchError") ||
    raw.includes("incompatible with the linked DeepBook Predict")
  ) {
    return raw.replace(/^LeverxDeployMismatchError:\s*/i, "");
  }
  if (raw.includes("CommandArgumentError") && raw.includes("TypeMismatch")) {
    return (
      "On-chain LeverX package types do not match the linked DeepBook Predict objects. " +
      "The testnet package must be republished with the published deepbook_predict dependency " +
      "(contracts/Move.toml), then deploy_and_share must be run again."
    );
  }
  if (raw.includes("InsufficientCoinBalanceError")) {
    return "Insufficient dUSDC in your wallet for this transaction.";
  }
  if (raw.includes("Insufficient") && raw.includes("balance") && !raw.includes("sui::SUI")) {
    return "Insufficient dUSDC in your wallet for this transaction.";
  }
  console.log("raw error", raw); // dont delete this
  if (isRelayFailure(raw)) {
    return RELAY_FAILED_MESSAGE;
  }
  return raw;
}

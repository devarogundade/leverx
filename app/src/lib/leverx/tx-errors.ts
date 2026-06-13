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
  "Slippage exceeds the on-chain maximum (50%). Lower slippage and try again.";

const LEVERAGED_MINT_OUTSIDE_WINDOW_MESSAGE =
  "Leverage above 1× closes one hour before this market expires.";

const FORCE_DELEVERAGE_OUTSIDE_WINDOW_MESSAGE =
  "Force deleverage is only available in the final hour before this market expires.";

export function formatTxError(error: unknown): string {
  const raw =
    error instanceof Error
      ? error.message
      : typeof error === "string"
        ? error
        : "Transaction failed.";
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
  if (raw.includes("slippage_too_high") || (raw.includes("predict_client") && raw.includes(", 32)"))) {
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
  if (raw.includes("Predict manager is not linked")) {
    return "Predict manager is not linked. Open Portfolio → Account to link your manager.";
  }
  if (
    raw.includes("LeverxOnboardingError") ||
    raw.includes("Predict manager is not linked to your trading account")
  ) {
    return "Trading account setup is incomplete. Open Portfolio → Account to link your Predict manager.";
  }
  if (raw.includes("FunctionNotFound")) {
    return "This app build is out of sync with the on-chain LeverX package. Refresh the page; if it persists, open Portfolio → Account to set up a new trading account.";
  }
  if (raw.includes("LeverxDeployMismatchError") || raw.includes("incompatible with the linked DeepBook Predict")) {
    return raw.replace(/^LeverxDeployMismatchError:\s*/i, "");
  }
  if (
    raw.includes("CommandArgumentError") &&
    raw.includes("TypeMismatch")
  ) {
    return (
      "On-chain LeverX package types do not match the linked DeepBook Predict objects. " +
      "The testnet package must be republished with the published deepbook_predict dependency " +
      "(contracts/Move.toml), then deploy_and_share must be run again."
    );
  }
  if (
    raw.includes("InsufficientCoinBalanceError") ||
    (raw.includes("Insufficient") && raw.includes("balance"))
  ) {
    return "Insufficient dUSDC in your wallet for this transaction.";
  }
  return raw;
}

/** Minimum SUI (mist) we expect for a signed PTB — actual gas is usually lower than the budget. */
export const MIN_SUI_GAS_MIST = 5_000_000n;

export const INSUFFICIENT_GAS_MESSAGE =
  "Not enough SUI for network fees. Add SUI to your wallet to pay gas, then try again.";

export const GAS_BUDGET_EXCEEDED_MESSAGE =
  "This transaction needs more gas than allowed. Refresh the page and try again.";

export class InsufficientGasError extends Error {
  constructor(message = INSUFFICIENT_GAS_MESSAGE) {
    super(message);
    this.name = "InsufficientGasError";
  }
}

export function isInsufficientGasError(raw: string): boolean {
  if (raw.includes("InsufficientGasError")) return true;

  const lower = raw.toLowerCase();
  if (lower.includes("insufficient gas")) return true;
  if (lower.includes("gasbalancetoolow")) return true;
  if (lower.includes("no valid gas coins")) return true;
  if (lower.includes("no gas coin")) return true;
  if (lower.includes("not enough sui")) return true;
  if (raw.includes("sui::SUI") && lower.includes("insufficient")) return true;
  if (lower.includes("gas payment") && lower.includes("insufficient")) return true;
  if (lower.includes("insufficient") && lower.includes("gas")) return true;

  return false;
}

export function isGasBudgetExceededError(raw: string): boolean {
  const lower = raw.toLowerCase();
  return (
    lower.includes("gas budget") &&
    (lower.includes("exceed") || lower.includes("too low") || lower.includes("too small"))
  );
}

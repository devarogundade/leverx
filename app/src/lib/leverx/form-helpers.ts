import { MAX_MARGIN_USD } from "@/lib/leverx/trade-limits";

/** Fraction presets for wallet-balance quick-amount buttons. */
export const BALANCE_QUICK_FRACTIONS = [
  { label: "10%", fraction: 0.1 },
  { label: "25%", fraction: 0.25 },
  { label: "50%", fraction: 0.5 },
  { label: "75%", fraction: 0.75 },
  { label: "MAX", fraction: 1 },
] as const;

/** Format a numeric amount for an input field (trim trailing zeros). */
export function formatAmountInput(amount: number): string {
  if (!Number.isFinite(amount) || amount <= 0) return "0";
  if (amount >= 1000) return amount.toFixed(0);
  if (amount >= 1) {
    const rounded = Math.round(amount * 100) / 100;
    return rounded % 1 === 0 ? String(rounded) : rounded.toFixed(2).replace(/\.?0+$/, "") || "0";
  }
  const rounded = Math.round(amount * 1e6) / 1e6;
  return String(rounded);
}

/** Build quick-amount button values from a wallet balance. */
export function buildQuickAmounts(
  balance: number | null | undefined,
): readonly { label: string; value: string }[] {
  const capped = balance != null && balance > 0 ? Math.min(balance, MAX_MARGIN_USD) : 0;
  const available = capped;
  return BALANCE_QUICK_FRACTIONS.map(({ label, fraction }) => ({
    label,
    value: formatAmountInput(available * fraction),
  }));
}

/** Basic Sui address check (0x + hex). */
export function isValidSuiAddress(value: string): boolean {
  const trimmed = value.trim();
  return /^0x[a-fA-F0-9]{64}$/.test(trimmed);
}

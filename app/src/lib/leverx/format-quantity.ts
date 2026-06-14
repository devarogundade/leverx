function formatSubThousand(abs: number): string {
  if (Number.isInteger(abs)) return abs.toLocaleString("en-US");
  return abs.toFixed(3).replace(/\.?0+$/, "");
}

function compactScaled(value: number, divisor: number, suffix: string): string {
  const scaled = value / divisor;
  const text = scaled.toFixed(3).replace(/\.?0+$/, "");
  return `${text}${suffix}`;
}

/** Compact number, e.g. 999, 12.5, 1.5K, 2.345M, 1.1B */
export function formatQuantity(value: number | bigint): string {
  const n = typeof value === "bigint" ? Number(value) : value;
  if (!Number.isFinite(n)) return "0";
  if (n === 0) return "0";

  const sign = n < 0 ? "-" : "";
  const abs = Math.abs(n);

  if (abs < 1_000) return sign + formatSubThousand(abs);

  if (abs >= 1_000_000_000_000) return sign + compactScaled(abs, 1_000_000_000_000, "T");
  if (abs >= 1_000_000_000) return sign + compactScaled(abs, 1_000_000_000, "B");
  if (abs >= 1_000_000) return sign + compactScaled(abs, 1_000_000, "M");
  return sign + compactScaled(abs, 1_000, "K");
}

export function formatUsd(amount: number): string {
  if (!Number.isFinite(amount) || amount <= 0) return "—";
  return `$${formatQuantity(amount)}`;
}

export function formatDusdc(amount: number): string {
  return `${formatQuantity(amount)} dUSDC`;
}

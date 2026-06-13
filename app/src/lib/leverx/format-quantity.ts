function compactScaled(value: number, divisor: number, suffix: string): string {
  const scaled = value / divisor;
  const digits = scaled >= 100 ? 0 : 1;
  const text = scaled.toFixed(digits).replace(/\.0$/, "");
  return `${text}${suffix}`;
}

/** Compact contract quantity, e.g. 999, 1.5k, 2.3m, 1.1b */
export function formatQuantity(value: number | bigint): string {
  const n = typeof value === "bigint" ? Number(value) : value;
  if (!Number.isFinite(n) || n <= 0) return "0";
  if (n < 1_000) return Math.round(n).toLocaleString("en-US");

  if (n >= 1_000_000_000) return compactScaled(n, 1_000_000_000, "b");
  if (n >= 1_000_000) return compactScaled(n, 1_000_000, "m");
  return compactScaled(n, 1_000, "k");
}

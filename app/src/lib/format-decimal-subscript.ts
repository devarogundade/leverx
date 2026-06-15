const SUBSCRIPT_DIGITS = "₀₁₂₃₄₅₆₇₈₉";
const ANALYSIS_PRECISION = 15;
const MAX_SIGNIFICANT_DIGITS = 6;

/** Minimum leading fractional zeros before compressing with subscript notation. */
export const SUBSCRIPT_ZERO_THRESHOLD = 4;

export function toSubscriptDigits(count: number): string {
  return String(count).replace(/[0-9]/g, (digit) => SUBSCRIPT_DIGITS[Number(digit)]!);
}

function decimalParts(abs: number): { intPart: string; fracPart: string } {
  const plain = abs.toString();
  const str = (
    plain.includes("e") || plain.includes("E")
      ? abs.toFixed(ANALYSIS_PRECISION)
      : plain.includes(".")
        ? plain
        : abs.toFixed(ANALYSIS_PRECISION)
  )
    .replace(/(\.\d*?)0+$/, "$1")
    .replace(/\.$/, "");
  const dot = str.indexOf(".");
  if (dot === -1) return { intPart: str, fracPart: "" };
  return { intPart: str.slice(0, dot), fracPart: str.slice(dot + 1) };
}

/**
 * Formats values with many leading fractional zeros as `40.0₆1`.
 * Returns null when normal locale formatting should be used instead.
 */
export function formatDecimalWithSubscript(abs: number, sign = ""): string | null {
  if (abs === 0) return "0";

  const { intPart, fracPart } = decimalParts(abs);
  if (!fracPart) return null;

  let zeroCount = 0;
  for (const ch of fracPart) {
    if (ch === "0") zeroCount++;
    else break;
  }

  const significant = fracPart
    .slice(zeroCount, zeroCount + MAX_SIGNIFICANT_DIGITS)
    .replace(/0+$/, "");
  if (!significant) return null;
  if (zeroCount < SUBSCRIPT_ZERO_THRESHOLD) return null;

  const formattedInt =
    intPart === "0" ? "0" : Number(intPart).toLocaleString("en-US");

  return `${sign}${formattedInt}.0${toSubscriptDigits(zeroCount)}${significant}`;
}

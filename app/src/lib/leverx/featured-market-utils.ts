import { premiumToCents, type LeverxMarketRow } from "@/lib/leverx/indexer-markets";
import { positionKeyFromArgs, marketRowToKey } from "@/lib/leverx/market-keys";

export function featuredDownRow(row: LeverxMarketRow): LeverxMarketRow {
  const keyArgs = marketRowToKey({ ...row, isUp: false, isRange: false });
  const id = keyArgs ? positionKeyFromArgs(keyArgs) : `${row.id}:down`;

  return {
    ...row,
    id,
    isUp: false,
    isRange: false,
  };
}

export function payoutMultiplier(premium: number | null | undefined): string | null {
  if (premium == null || premium <= 0) return null;
  const cents = premiumToCents(premium);
  if (cents <= 0 || cents >= 100) return null;
  return `${(100 / cents).toFixed(2)}x`;
}

/** Short countdown — M:SS under an hour, otherwise H:MM:SS. */
export function formatFeaturedCountdown(remainingMs: number): string {
  if (remainingMs <= 0) return "0:00";
  const totalSec = Math.floor(remainingMs / 1000);
  const hours = Math.floor(totalSec / 3600);
  const minutes = Math.floor((totalSec % 3600) / 60);
  const seconds = totalSec % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  if (hours > 0) return `${hours}:${pad(minutes)}:${pad(seconds)}`;
  return `${minutes}:${pad(seconds)}`;
}

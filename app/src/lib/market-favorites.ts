const STORAGE_KEY = "lx-market-favorites";

function parseFavorites(raw: string | null): string[] {
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((id): id is string => typeof id === "string" && id.length > 0);
  } catch {
    return [];
  }
}

export function readMarketFavorites(): readonly string[] {
  if (typeof window === "undefined") return [];
  return parseFavorites(localStorage.getItem(STORAGE_KEY));
}

export function writeMarketFavorites(oracleIds: readonly string[]): void {
  if (typeof window === "undefined") return;
  const unique = [...new Set(oracleIds)];
  if (unique.length === 0) {
    localStorage.removeItem(STORAGE_KEY);
    return;
  }
  localStorage.setItem(STORAGE_KEY, JSON.stringify(unique));
}

export { STORAGE_KEY as MARKET_FAVORITES_STORAGE_KEY };

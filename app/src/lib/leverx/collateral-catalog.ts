/**
 * Optional LeverX collateral catalog from env (UI awareness only).
 * Authoritative max LTV lives on-chain in `LeverxRegistry` per whitelisted asset.
 *
 * VITE_SUPPORTED_COLLATERALS — JSON array (see keeper/.env.example).
 */
export type CollateralCatalogEntry = {
  symbol: string;
  coinType: string;
  maxLtvBps: number;
  liquidationLtvBps?: number;
  pythOracleId?: string;
  spotPoolId?: string;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseEntry(raw: unknown): CollateralCatalogEntry | null {
  if (!isRecord(raw)) return null;
  const symbol = String(raw.symbol ?? "").trim();
  const coinType = String(raw.coinType ?? raw.coin_type ?? "").trim();
  const maxLtvBps = Number(raw.maxLtvBps ?? raw.max_ltv_bps);
  if (!symbol || !coinType || !Number.isFinite(maxLtvBps) || maxLtvBps <= 0) {
    return null;
  }

  const liquidationRaw = raw.liquidationLtvBps ?? raw.liquidation_ltv_bps;
  const liquidationLtvBps =
    liquidationRaw !== undefined ? Number(liquidationRaw) : undefined;

  return {
    symbol,
    coinType,
    maxLtvBps,
    liquidationLtvBps:
      liquidationLtvBps !== undefined && Number.isFinite(liquidationLtvBps)
        ? liquidationLtvBps
        : undefined,
    pythOracleId: String(raw.pythOracleId ?? raw.pyth_oracle_id ?? "").trim() || undefined,
    spotPoolId: String(raw.spotPoolId ?? raw.spot_pool_id ?? "").trim() || undefined,
  };
}

export function parseCollateralCatalog(json: string): CollateralCatalogEntry[] {
  const trimmed = json.trim();
  if (!trimmed) return [];

  try {
    const parsed: unknown = JSON.parse(trimmed);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map(parseEntry)
      .filter((e): e is CollateralCatalogEntry => e !== null);
  } catch {
    return [];
  }
}

/** Parsed catalog from `VITE_SUPPORTED_COLLATERALS`, empty when unset. */
export function leverxCollateralCatalog(): CollateralCatalogEntry[] {
  const raw = import.meta.env.VITE_SUPPORTED_COLLATERALS as string | undefined;
  return parseCollateralCatalog(raw ?? "");
}

export function formatMaxLtvPercent(maxLtvBps: number): string {
  return `${(maxLtvBps / 100).toFixed(0)}%`;
}

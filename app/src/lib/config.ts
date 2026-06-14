/**
 * Testnet integration — see:
 * - docs/DEEPBOOK_PREDICT.md (workshop FAQ)
 * - https://docs.sui.io/onchain-finance/deepbook-predict/contract-information
 * Predict testnet expirations: 1, 2, 7, 14, 21 days.
 *
 * Defaults mirror `contracts/deploy-testnet.env` (publish tx 4xABgj…).
 * Shared object IDs (registry, vault, fee collector) come from the indexer
 * `/v1/protocol` after `deploy_and_share`, or optional `VITE_LEVERX_*` env vars.
 */

/** DeepBook Predict testnet (predict-testnet-4-16). */
const TESTNET_PREDICT = {
  serverUrl: "https://predict-server.testnet.mystenlabs.com",
  predictId: "0xc8736204d12f0a7277c86388a68bf8a194b0a14c5538ad13f22cbd8e2a38028a",
  packageId: "0xf5ea2b3749c65d6e56507cc35388719aadb28f9cab873696a2f8687f5c785138",
  registryId: "0x43af14fed5480c20ff77e2263d5f794c35b9fab7e2212903127062f4fe2a6e64",
  quoteType:
    "0xe95040085976bfd54a1a07225cd46c8a2b4e8e2b6732f140a0fc49850ba73e1a::dusdc::DUSDC",
} as const;

/** Published LeverX package (testnet). Shared objects filled via indexer or .env. */
const TESTNET_LEVERX = {
  packageId:
    "0x624db6bf4dd968e345a961964d25e24a965e1d5d7c60967678ef8b392744cc4f",
  registryId:
    "0xfdd22d75272dc9b69d0f43137ed198bf500d7f52e504dcb5a687ae8f0b2df740",
  vaultId:
    "0xffe2cb656b71c98f2deaafb62b22f926d04d9409d48486e9a64c7a059f969e7e",
  feeCollectorId:
    "0xfbaebb19aed9f501a2304e14d43cbe882ebd5697820cb258bb8f7222a51f14c5",
} as const;

function viteEnv(name: string): string {
  const value = import.meta.env[name as keyof ImportMetaEnv];
  return typeof value === "string" ? value.trim() : "";
}

const DEFAULT_INDEXER_DIRECT = "http://localhost:3100";
const DEFAULT_KEEPER_API = "https://keeper.suileverx.xyz";
const DEFAULT_INDEXER_PUBLIC = "https://indexer.suileverx.xyz";

/** True when REST `/v1/*` is served by the keeper proxy (not leverx-server directly). */
export function isKeeperApiUrl(url: string): boolean {
  try {
    const { hostname, port } = new URL(url);
    if (port === "3001") return true;
    return hostname === "keeper.suileverx.xyz" || hostname.startsWith("keeper.");
  } catch {
    return false;
  }
}

function defaultIndexerDirectUrl(): string {
  return import.meta.env.PROD ? DEFAULT_INDEXER_PUBLIC : DEFAULT_INDEXER_DIRECT;
}

function resolveLeverxApiUrl(): string {
  const keeper = viteEnv("VITE_LEVERX_KEEPER_URL");
  if (keeper) return keeper;
  const indexer = viteEnv("VITE_LEVERX_INDEXER_URL");
  if (indexer) return indexer;
  return import.meta.env.PROD ? DEFAULT_KEEPER_API : DEFAULT_INDEXER_DIRECT;
}

function resolveLeverxWsUrl(apiUrl: string): string | null {
  const explicit = viteEnv("VITE_LEVERX_INDEXER_WS_URL");
  if (explicit) {
    const trimmed = explicit.replace(/\/$/, "");
    return trimmed.endsWith("/v1/ws") ? trimmed : `${trimmed}/v1/ws`;
  }
  if (!apiUrl) return null;

  const explicitIndexer = viteEnv("VITE_LEVERX_INDEXER_URL");
  const wsBase = isKeeperApiUrl(apiUrl)
    ? explicitIndexer && !isKeeperApiUrl(explicitIndexer)
      ? explicitIndexer
      : defaultIndexerDirectUrl()
    : apiUrl;

  return `${wsBase.replace(/^http/i, "ws").replace(/\/$/, "")}/v1/ws`;
}

const leverxApiUrl = resolveLeverxApiUrl();
const leverxIndexerWsUrl = resolveLeverxWsUrl(leverxApiUrl);

export const appConfig = {
  suiNetwork: "testnet" as const,

  predictServerUrl: TESTNET_PREDICT.serverUrl,
  predictId: viteEnv("VITE_PREDICT_ID") || TESTNET_PREDICT.predictId,
  predictPackageId: viteEnv("VITE_PREDICT_PACKAGE_ID") || TESTNET_PREDICT.packageId,
  predictRegistryId: TESTNET_PREDICT.registryId,
  quoteType: TESTNET_PREDICT.quoteType,

  leverxPackageId: viteEnv("VITE_LEVERX_PACKAGE_ID") || TESTNET_LEVERX.packageId,
  leverxRegistryId: viteEnv("VITE_LEVERX_REGISTRY_ID") || TESTNET_LEVERX.registryId,
  leverxVaultId: viteEnv("VITE_LEVERX_VAULT_ID") || TESTNET_LEVERX.vaultId,
  feeCollectorId:
    viteEnv("VITE_LEVERX_FEE_COLLECTOR_ID") || TESTNET_LEVERX.feeCollectorId,

  /** Vault/manager legacy paths; oracle catalog always uses predictServerUrl. */
  usePredictServer: false,

  /**
   * LeverX REST API base — keeper proxies `/v1/*` to leverx-server in production/docker.
   * WebSocket live streams still use `leverxIndexerWsUrl` (keeper does not proxy WS).
   */
  leverxIndexerUrl: leverxApiUrl,

  /** Direct leverx-server WebSocket endpoint (`/v1/ws`). */
  leverxIndexerWsUrl,

  /** True when `leverxIndexerWsUrl` is configured (streams require direct indexer host). */
  indexerStreamEnabled: Boolean(leverxIndexerWsUrl),

  /** DeepBook spot OHLCV (chart visualization only). */
  deepbookIndexerUrl:
    viteEnv("VITE_DEEPBOOK_INDEXER_URL") ||
    "https://deepbook-indexer.mainnet.mystenlabs.com",

  /** Vertical RANGE instruments in trade UI and market actions. */
  rangeEnabled: viteEnv("VITE_RANGE_ENABLED") !== "false",
} as const;

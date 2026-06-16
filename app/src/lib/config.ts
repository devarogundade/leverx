/**
 * Testnet integration — see:
 * - docs/DEEPBOOK_PREDICT.md (workshop FAQ)
 * - https://docs.sui.io/onchain-finance/deepbook-predict/contract-information
 * Predict testnet expirations: 1, 2, 7, 14, 21 days.
 *
 * Defaults mirror `contracts/deploy-testnet.env` (publish tx G848YC…).
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
    "0x972b59d3ee7c74a01d88d0b2d895d0f6ce58fc68fdead02c974ad824bfd6b790",
  registryId:
    "0xe7a1cc48e4073557ed6819a313ff1bbee4cafe50929712500782b1046660bbc0",
  vaultId:
    "0xed3e5aa7b6a148720ad4b9813eb621c6d2c14c45616b1fe11b88ee1cb057f907",
  feeCollectorId:
    "0x91fccb2929c76addfb958930901a81e59f6eff8309d6afe6c507261bbbd49468",
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

function resolveKeeperApiUrl(leverxApiUrl: string): string {
  const explicit = viteEnv("VITE_LEVERX_KEEPER_URL");
  if (explicit) return explicit.replace(/\/$/, "");
  if (isKeeperApiUrl(leverxApiUrl)) return leverxApiUrl.replace(/\/$/, "");
  return import.meta.env.PROD ? DEFAULT_KEEPER_API : "http://localhost:3001";
}

const keeperApiUrl = resolveKeeperApiUrl(leverxApiUrl);

function envBool(name: string, defaultValue: boolean): boolean {
  const raw = viteEnv(name).toLowerCase();
  if (raw === "true" || raw === "1") return true;
  if (raw === "false" || raw === "0") return false;
  return defaultValue;
}

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

  /** Optional fallback when indexer has not indexed keeper_address yet. */
  keeperAddress: viteEnv("VITE_KEEPER_ADDRESS"),

  /** Optional shared secret for keeper ops routes (not required for user-signed relay). */
  keeperApiKey: viteEnv("VITE_KEEPER_API_KEY"),

  /** Telegram bot username for portfolio alert subscriptions (without @). */
  telegramBotUsername: viteEnv("VITE_TELEGRAM_BOT_USERNAME"),

  /** Enoki public API key — when set, zkLogin wallets are registered at startup. */
  enokiApiKey: viteEnv("VITE_ENOKI_API_KEY"),
  enokiGoogleClientId: viteEnv("VITE_ENOKI_GOOGLE_CLIENT_ID"),

  /** Vault/manager legacy paths; oracle catalog always uses predictServerUrl. */
  usePredictServer: false,

  /**
   * LeverX REST API base — keeper proxies `/v1/*` to leverx-server in production/docker.
   * WebSocket live streams still use `leverxIndexerWsUrl` (keeper does not proxy WS).
   */
  leverxIndexerUrl: leverxApiUrl,

  /** Keeper HTTP base (trade relay, manager create, health). */
  keeperApiUrl,

  /** Direct leverx-server WebSocket endpoint (`/v1/ws`). */
  leverxIndexerWsUrl,

  /** True when `leverxIndexerWsUrl` is configured (streams require direct indexer host). */
  indexerStreamEnabled: Boolean(leverxIndexerWsUrl),

  /** DeepBook spot OHLCV (chart visualization only). */
  deepbookIndexerUrl:
    viteEnv("VITE_DEEPBOOK_INDEXER_URL") ||
    "https://deepbook-indexer.mainnet.mystenlabs.com",

  /** Vertical RANGE instruments in trade UI and market actions. */
  rangeEnabled: true,
} as const;

/** True when Google zkLogin can be registered via Enoki at startup. */
export function isEnokiGoogleLoginEnabled(): boolean {
  return Boolean(appConfig.enokiApiKey && appConfig.enokiGoogleClientId);
}

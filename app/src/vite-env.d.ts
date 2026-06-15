/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_LEVERX_PACKAGE_ID?: string;
  readonly VITE_LEVERX_REGISTRY_ID?: string;
  readonly VITE_LEVERX_VAULT_ID?: string;
  readonly VITE_LEVERX_FEE_COLLECTOR_ID?: string;
  /** Keeper HTTP base (proxies `/v1/*`). Preferred over `VITE_LEVERX_INDEXER_URL` when set. */
  readonly VITE_LEVERX_KEEPER_URL?: string;
  /** leverx-server REST base, or direct indexer host for WebSocket when using keeper REST. */
  readonly VITE_LEVERX_INDEXER_URL?: string;
  readonly VITE_LEVERX_INDEXER_WS_URL?: string;
  readonly VITE_PREDICT_ID?: string;
  readonly VITE_PREDICT_PACKAGE_ID?: string;
  readonly VITE_DEEPBOOK_INDEXER_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

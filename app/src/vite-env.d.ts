/// <reference types="vite/client" />

import type { PredictSide } from "@/lib/predict/instruments";

interface ImportMetaEnv {
  readonly VITE_LEVERX_PACKAGE_ID?: string;
  readonly VITE_LEVERX_REGISTRY_ID?: string;
  readonly VITE_LEVERX_VAULT_ID?: string;
  readonly VITE_LEVERX_FEE_COLLECTOR_ID?: string;
  readonly VITE_LEVERX_INDEXER_URL?: string;
  readonly VITE_LEVERX_INDEXER_WS_URL?: string;
  readonly VITE_PREDICT_ID?: string;
  readonly VITE_PREDICT_PACKAGE_ID?: string;
  readonly VITE_DEEPBOOK_INDEXER_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

declare module "@tanstack/react-router" {
  interface HistoryState {
    predictSide?: PredictSide;
  }
}

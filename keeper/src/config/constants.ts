/**
 * Keeper configuration — defaults mirror `contracts/deploy-testnet.env`.
 * The only value in `keeper/.env` is `KEEPER_PRIVATE_KEY`.
 */

/** DeepBook Predict testnet (rev predict-testnet-4-16). */
export const TESTNET_PREDICT = {
  packageId:
    '0xf5ea2b3749c65d6e56507cc35388719aadb28f9cab873696a2f8687f5c785138',
  sharedObjectId:
    '0xc8736204d12f0a7277c86388a68bf8a194b0a14c5538ad13f22cbd8e2a38028a',
  registryId:
    '0x43af14fed5480c20ff77e2263d5f794c35b9fab7e2212903127062f4fe2a6e64',
  serverUrl: 'https://predict-server.testnet.mystenlabs.com',
} as const;

/** Published LeverX package + shared objects (testnet). */
export const TESTNET_LEVERX = {
  packageId:
    '0xe6345a6251057614904a4de8971cfd5d9d7dd5ce6bb7b4c036ca13e8f0dcbd78',
  registryId:
    '0x63a9128e375110edd51b7abc57de2b37eacdd1cf06ae72339e5bc41da791d3d5',
  vaultId: '0xa541e32a9338fca1953a5626a238f1723b969839a3896ff61a174b34e4c30b0a',
  feeCollectorId:
    '0xe506020d1f29c88c00f91460af0197760b1fce5893a680c386595f1b508d2cd2',
} as const;

/** dUSDC quote type on testnet. */
export const TESTNET_ASSETS = {
  quoteType:
    '0xe95040085976bfd54a1a07225cd46c8a2b4e8e2b6732f140a0fc49850ba73e1a::dusdc::DUSDC',
} as const;

/** Min/max leverage (basis points). */
export const MIN_LEVERAGE_BPS = 10_000;

/** Leveraged mints (>1x) blocked in the final hour before expiry. */
export const LEVERAGED_MINT_WINDOW_MS = 3_600_000;
export const MAX_LEVERAGE_BPS = 100_000;

/** Margin-call threshold (95%). */
export const MARGIN_CALL_BPS = 9_500;

/** Extra quote borrowed on flash loans to cover accrued vault interest. */
export const FLASH_BORROW_BUFFER_BPS = 500;

/** Slippage floor on keeper trigger redeems (matches app `DEFAULT_SLIPPAGE_BPS`). */
export const TRIGGER_REDEEM_SLIPPAGE_BPS = 500;

/** Predict per-contract premium scale (1e9). */
export const PREDICT_PRICE_SCALE = 1_000_000_000n;

export const KEEPER_ENABLED = true;

export const DEFAULT_SUI_NETWORK = 'testnet' as const;

export const SUI_RPC_URLS: Record<string, string> = {
  testnet: 'https://fullnode.testnet.sui.io:443',
};

/** Public leverx-server (standalone keeper / Docker). Override for local stack. */
export const INDEXER_URL = 'https://indexer.suileverx.xyz';

export const DEFAULT_PORT = 3001;

/** Stagger by 2s so concurrent crons do not pile up on the same tick. */
export const KEEPER_CRON_DEFAULTS = {
  settlement: '0,10,20,30,40,50 * * * * *',
  limitOrder: '2,12,22,32,42,52 * * * * *',
  liquidation: '4,14,24,34,44,54 * * * * *',
  trigger: '6,16,26,36,46,56 * * * * *',
  forceClose: '8,18,28,38,48,58 * * * * *',
} as const;

export const KEEPER_LIMIT_DEFAULTS = {
  settlements: 10,
  limitFills: 10,
  liquidations: 5,
  triggers: 10,
  forceCloses: 10,
} as const;

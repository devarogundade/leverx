/**
 * Keeper configuration — edit this file for testnet deploy IDs, etc.
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
    '0x0d97963b7032ca790844559446a8fb4b036d00d0c7e50f338840d4ad6d109a20',
  registryId:
    '0x7e36d8362e5315ea97b2f374c90b96d1a8d3e93a1ceb5dbc54acf40bae1c17e2',
  vaultId: '0x4e3d2d54c5b3ac7f0d65be9515a50da4cf72e7388ef985298c417f4c8b8317a7',
  feeCollectorId:
    '0x66a202c6ed7a2bb451da7d049cb0f82b0780e95307c5966c1c187d5c32493110',
} as const;

/** dUSDC quote type on testnet. */
export const TESTNET_ASSETS = {
  quoteType:
    '0xe95040085976bfd54a1a07225cd46c8a2b4e8e2b6732f140a0fc49850ba73e1a::dusdc::DUSDC',
} as const;

/** Min/max leverage (basis points). */
export const MIN_LEVERAGE_BPS = 11_000;
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

/** leverx-server URL (same host when running leverx stack). */
export const INDEXER_URL = 'http://127.0.0.1:3100';

export const DEFAULT_PORT = 3001;

export const KEEPER_CRON_DEFAULTS = {
  settlement: '*/5 * * * *',
  limitOrder: '*/1 * * * *',
  liquidation: '*/2 * * * *',
  trigger: '*/1 * * * *',
} as const;

export const KEEPER_LIMIT_DEFAULTS = {
  settlements: 10,
  limitFills: 10,
  liquidations: 5,
  triggers: 10,
} as const;

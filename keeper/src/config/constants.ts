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

/** Published LeverX package + shared objects (testnet). Mirrors `contracts/deploy-testnet.env`. */
export const TESTNET_LEVERX = {
  packageId:
    '0xe960e158acfea28447f0b9945d452ad59f8222e7a72139c1e876e26816064cc9',
  registryId:
    '0x4d23bb5f39a62e2b0fa73c568c8288a9770ce4ba5eb50519c188fa313a905f7f',
  vaultId: '0xe798095691416b8fc44ebeab1e5feefdf89cc8b342d48f373c861fac65c14743',
  feeCollectorId:
    '0x8dd3376f772e6a98bd74e98c2e21fb1f0dfd6779ffc388da0ad4de1c6b50b145',
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

/** Default on-chain liquidation health threshold (105%). */
export const DEFAULT_LIQUIDATION_BPS = 10_500;

/** Maximum admin-configurable liquidation threshold (150%). */
export const MAX_LIQUIDATION_BPS = 15_000;

/** Margin-call threshold — matches `protocol_constants::default_liquidation_bps`. */
export const MARGIN_CALL_BPS = DEFAULT_LIQUIDATION_BPS;

/** Extra quote on vault flash loans (covers accrued interest + fees). Matches on-chain buffer. */
export const FLASH_BORROW_BUFFER_BPS = 500;

/** Default on-chain trigger redeem slippage when unset at placement. */
export const DEFAULT_TRIGGER_SLIPPAGE_BPS = 500;

/** Slippage floor on keeper trigger redeems when on-chain config is zero. */
export const TRIGGER_REDEEM_SLIPPAGE_BPS = DEFAULT_TRIGGER_SLIPPAGE_BPS;

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

/** Every 20s, staggered by 2s so concurrent crons do not pile up on the same tick. */
export const KEEPER_CRON_DEFAULTS = {
  limitOrder: '2,22,42 * * * * *',
  liquidation: '4,24,44 * * * * *',
  trigger: '6,26,46 * * * * *',
  forceClose: '8,28,48 * * * * *',
} as const;

export const KEEPER_LIMIT_DEFAULTS = {
  limitFills: 10,
  liquidations: 5,
  triggers: 10,
  forceCloses: 10,
} as const;

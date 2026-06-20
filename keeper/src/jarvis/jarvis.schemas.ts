import { z } from 'zod';

// ---------------------------------------------------------------------------
// Event types
// ---------------------------------------------------------------------------

export const JarvisEventTypeSchema = z.enum([
  'welcome',
  'enabled',
  'disabled',
  'startup',
  'running',
  'analyzing_trades',
  'analyzing_markets',
  'closing_position',
  'repaying_debt',
  'opening_position',
  'idle',
  'cycle_complete',
  'account_required',
  'no_funds',
  'low_balance',
  'executor_required',
  'skipped',
  'error',
]);

export type JarvisEventType = z.infer<typeof JarvisEventTypeSchema>;

/** Enum-like constants for backend emit sites. */
export const JarvisEventType = {
  WELCOME: 'welcome',
  ENABLED: 'enabled',
  DISABLED: 'disabled',
  STARTING_UP: 'startup',
  RUNNING: 'running',
  ANALYZING_TRADES: 'analyzing_trades',
  ANALYZING_MARKETS: 'analyzing_markets',
  CLOSING_POSITION: 'closing_position',
  REPAYING_DEBT: 'repaying_debt',
  OPENING_POSITION: 'opening_position',
  /** No trade found this cycle (stored as `idle`). */
  NO_OPPORTUNITY: 'idle',
  /** End-of-cycle heartbeat (stored as `cycle_complete`). */
  CYCLE_COMPLETE: 'cycle_complete',
  ACCOUNT_REQUIRED: 'account_required',
  NO_FUNDS: 'no_funds',
  LOW_BALANCE: 'low_balance',
  EXECUTOR_REQUIRED: 'executor_required',
  SKIPPED: 'skipped',
  ERROR: 'error',
} as const satisfies Record<string, JarvisEventType>;

// ---------------------------------------------------------------------------
// Event metadata (validated per event_type)
// ---------------------------------------------------------------------------

const emptyMetadataSchema = z.object({}).strict();

export const JarvisWelcomeMetadataSchema = z.object({
  first_time: z.boolean().optional(),
});

export const JarvisSkippedMetadataSchema = z.object({
  reason: z.string(),
});

export const JarvisCycleCompleteMetadataSchema = z.object({
  next_run_at_ms: z.number(),
  skipped: z.boolean().optional(),
});

export const JarvisErrorMetadataSchema = z.object({
  reason: z.string().optional(),
  code: z.string().optional(),
});

export const JarvisPhaseMetadataSchema = z.object({
  phase: z.enum(['positions', 'markets']),
  action_count: z.number().optional(),
});

export const JarvisActionMetadataSchema = z.object({
  reasoning: z.string().optional(),
  confidence: z.number().optional(),
  action_type: z.string().optional(),
  leverage: z.number().optional(),
  portfolio_pct: z.number().optional(),
  dry_run: z.boolean().optional(),
});

export const JarvisPositionActionMetadataSchema = JarvisActionMetadataSchema.extend({
  position_key: z.string().optional(),
  digest: z.string().optional(),
  dry_run: z.boolean().optional(),
});

export const JarvisOpeningPositionMetadataSchema = z.object({
  oracle_id: z.string(),
  side: z.enum(['up', 'down']),
  margin_usd: z.number(),
  leverage: z.number(),
  portfolio_pct: z.number(),
  confidence: z.number().optional(),
  reasoning: z.string().optional(),
  dry_run: z.boolean().optional(),
});

export const JarvisNoFundsMetadataSchema = z.object({
  balance_usd: z.number(),
});

export const JarvisRunningMetadataSchema = JarvisPositionActionMetadataSchema.extend({
  phase: z.enum(['positions', 'markets']).optional(),
  action_count: z.number().optional(),
  digest: z.string().optional(),
  tx_digest: z.string().optional(),
  position_key: z.string().optional(),
}).passthrough();

export const JarvisIdleOpportunityMetadataSchema = z.object({
  phase: z.literal('markets').optional(),
  action_count: z.number().optional(),
});

export const jarvisEventMetadataSchemas = {
  welcome: JarvisWelcomeMetadataSchema,
  enabled: emptyMetadataSchema,
  disabled: emptyMetadataSchema,
  startup: emptyMetadataSchema,
  running: JarvisRunningMetadataSchema,
  analyzing_trades: emptyMetadataSchema,
  analyzing_markets: emptyMetadataSchema,
  closing_position: JarvisPositionActionMetadataSchema,
  repaying_debt: JarvisPositionActionMetadataSchema,
  opening_position: JarvisOpeningPositionMetadataSchema,
  idle: JarvisIdleOpportunityMetadataSchema,
  cycle_complete: JarvisCycleCompleteMetadataSchema,
  account_required: emptyMetadataSchema,
  no_funds: JarvisNoFundsMetadataSchema,
  low_balance: emptyMetadataSchema,
  executor_required: emptyMetadataSchema,
  skipped: JarvisSkippedMetadataSchema,
  error: JarvisErrorMetadataSchema,
} satisfies Record<JarvisEventType, z.ZodType>;

export type JarvisEventMetadataMap = {
  [K in JarvisEventType]: z.infer<(typeof jarvisEventMetadataSchemas)[K]>;
};

export function parseJarvisEventMetadata<T extends JarvisEventType>(
  eventType: T,
  metadata?: unknown,
): JarvisEventMetadataMap[T] | null {
  if (metadata == null) return null;
  const parsed = jarvisEventMetadataSchemas[eventType].safeParse(metadata);
  if (!parsed.success) return null;
  return parsed.data as JarvisEventMetadataMap[T];
}

// ---------------------------------------------------------------------------
// LLM decision
// ---------------------------------------------------------------------------

export const JarvisActionSchema = z.object({
  type: z.enum(['close', 'partial_repay', 'open', 'hold', 'skip']),
  position_id: z.string().optional(),
  oracle_id: z.string().optional(),
  direction: z.enum(['UP', 'DOWN']).optional(),
  portfolio_pct: z.number().min(0).max(100).optional(),
  leverage: z.number().min(1).max(10).optional(),
  confidence: z.number().min(0).max(100).optional(),
  reasoning: z.string().min(1),
  user_message: z.string().min(1),
});

export const JarvisDecisionSchema = z.object({
  phase: z.enum(['positions', 'markets', 'idle']),
  actions: z.array(JarvisActionSchema),
  summary_message: z.string().min(1),
});

export type JarvisAction = z.infer<typeof JarvisActionSchema>;
export type JarvisDecision = z.infer<typeof JarvisDecisionSchema>;

export const JarvisPhaseSchema = z.enum(['positions', 'markets']);
export type JarvisPhase = z.infer<typeof JarvisPhaseSchema>;

export const JarvisPhaseRequestSchema = z.object({
  phase: JarvisPhaseSchema,
  owner: z.string().min(1),
  accountId: z.string().min(1),
  systemContext: z.lazy(() => JarvisSystemContextSchema),
});

export type JarvisPhaseRequest = z.infer<typeof JarvisPhaseRequestSchema>;

// ---------------------------------------------------------------------------
// Data / tool payloads
// ---------------------------------------------------------------------------

export const OhlcvCandleSchema = z.tuple([
  z.number(),
  z.number(),
  z.number(),
  z.number(),
  z.number(),
]);

export type OhlcvCandle = z.infer<typeof OhlcvCandleSchema>;

export const OhlcvIntervalSchema = z.enum(['15m', '1m']);
export type OhlcvInterval = z.infer<typeof OhlcvIntervalSchema>;

export const JarvisOhlcvBundleSchema = z.object({
  candles_15m: z.array(OhlcvCandleSchema),
  candles_1m: z.array(OhlcvCandleSchema),
});

export type JarvisOhlcvBundle = z.infer<typeof JarvisOhlcvBundleSchema>;

export const OhlcvCandleFieldsSchema = z.tuple([
  z.literal('timestamp_ms'),
  z.literal('open_usd'),
  z.literal('high_usd'),
  z.literal('low_usd'),
  z.literal('close_usd'),
]);

/** On-chain mint/redeem quote from Predict dev-inspect (see jarvis-units.ts). */
export const OnChainQuoteSchema = z.object({
  kind: z.enum(['mint', 'redeem', 'partial_repay']),
  source: z.literal('on_chain_dev_inspect'),
  shares_in: z.string().nullable(),
  shares_out: z.string().nullable(),
  quote_in_usd: z.number().nullable(),
  quote_in_atoms: z.string().nullable(),
  quote_out_usd: z.number().nullable(),
  quote_out_atoms: z.string().nullable(),
  price_per_share_cents: z.number().nullable(),
  price_per_share_raw: z.string().nullable(),
  slippage_bps: z.number(),
  min_quote_out_usd: z.number().nullable(),
  min_quote_out_atoms: z.string().nullable(),
  unit_quote: z.literal('dUSDC'),
  unit_shares: z.literal('contracts'),
});

export type OnChainQuote = z.infer<typeof OnChainQuoteSchema>;

export const JarvisPositionQuotesSchema = z.object({
  redeem: OnChainQuoteSchema.nullable(),
  partial_repay: OnChainQuoteSchema.nullable(),
});

export const JarvisMarketMintQuotesSchema = z.object({
  mint_up: OnChainQuoteSchema.nullable(),
  mint_down: OnChainQuoteSchema.nullable(),
  reference_sizing: z.object({
    margin_usd: z.number(),
    leverage: z.number(),
    note: z.string(),
  }),
});

export const JarvisPositionSnapshotSchema = z.object({
  position_key: z.string(),
  oracle_id: z.string(),
  market_type: z.enum(['UP', 'DOWN', 'RANGE']),
  direction: z.enum(['UP', 'DOWN']).nullable(),
  open_quantity: z.number(),
  open_quantity_unit: z.literal('contracts'),
  margin_quote_usd: z.number(),
  margin_quote_atoms: z.string(),
  borrow_quote_usd: z.number(),
  borrow_quote_atoms: z.string(),
  mint_cost_usd: z.number(),
  leverage: z.number(),
  leverage_unit: z.literal('x_multiplier'),
  entry_premium_cents: z.number().nullable(),
  closing_premium_cents: z.number().nullable(),
  entry_mark_raw: z.string().nullable(),
  closing_mark_raw: z.string().nullable(),
  mark_pnl_pct: z.number().nullable(),
  unrealized_pnl_usd: z.number().nullable(),
  unrealized_pnl_pct: z.number().nullable(),
  liquidatable: z.boolean().nullable(),
  mark_value_usd: z.number(),
  net_equity_after_redeem_usd: z.number(),
  health_bps: z.number().nullable(),
  health_pct: z.number().nullable(),
  health_label: z.enum(['healthy', 'margin_call', 'at_risk', 'unknown']),
  distance_to_liquidation_bps: z.number().nullable(),
  distance_to_liquidation_pct_points: z.number().nullable(),
  liquidation_threshold_bps: z.number().nullable(),
  liquidation_threshold_pct: z.number().nullable(),
  risk_readout: z.string(),
  expiry_ms: z.number(),
  time_to_expiry_ms: z.number(),
  time_to_expiry_hours: z.number(),
  final_window_ms: z.number(),
  in_final_window: z.boolean(),
  hours_until_final_window: z.number(),
  has_vault_borrow: z.boolean(),
  at_risk_of_force_deleverage: z.boolean(),
  leveraged_mint_blocked: z.boolean(),
  final_window_periods_remaining: z.number(),
  max_leverage_for_time: z.number(),
  leverage_closes_at_ms: z.number(),
  ms_until_leverage_closes: z.number(),
  strike_usd: z.number(),
  strike_raw: z.number(),
  higher_strike_usd: z.number(),
  higher_strike_raw: z.number(),
  opened_at_ms: z.number().nullable(),
  status: z.string(),
  close_source: z.string().nullable().optional(),
  leverx_custody_complete: z.boolean().optional(),
  needs_custody_recovery: z.boolean().optional(),
  recommended_actions: z.array(z.string()).optional(),
  primary_cta: z.string().nullable().optional(),
  quotes: JarvisPositionQuotesSchema,
});

export const JarvisAccountSnapshotSchema = z.object({
  owner: z.string(),
  account_id: z.string(),
  balance_usd: z.number(),
  balance_atoms: z.string(),
  balance_unit: z.literal('dUSDC'),
  borrowed_quote_usd: z.number(),
  borrowed_quote_atoms: z.string(),
  executor_registered: z.boolean(),
  open_positions: z.array(JarvisPositionSnapshotSchema),
});

export const JarvisMarketCandidateSchema = z.object({
  oracle_id: z.string(),
  underlying: z.string(),
  expiry_ms: z.number(),
  time_to_expiry_ms: z.number(),
  time_to_expiry_hours: z.number(),
  final_window_ms: z.number(),
  in_final_window: z.boolean(),
  hours_until_final_window: z.number(),
  leveraged_mint_blocked: z.boolean(),
  final_window_periods_remaining: z.number(),
  max_leverage_for_time: z.number(),
  leverage_closes_at_ms: z.number(),
  ms_until_leverage_closes: z.number(),
  spot_usd: z.number(),
  spot_unit: z.literal('USD'),
  min_strike_usd: z.number(),
  min_strike_raw: z.number(),
  atm_strike_usd: z.number(),
  atm_strike_raw: z.number(),
  tick_size_usd: z.number(),
  tick_size_raw: z.number(),
  strike_unit: z.literal('USD_on_chain_1e9'),
  status: z.string(),
  is_settled: z.boolean(),
  quotes: JarvisMarketMintQuotesSchema,
});

export const JarvisPlatformRulesSchema = z.object({
  min_leverage: z.number(),
  max_leverage: z.number(),
  min_margin_usd: z.number(),
  max_margin_usd: z.number(),
  market_slippage_bps: z.number(),
  final_window_ms: z.number(),
  final_window_minutes: z.number(),
  liquidation_threshold_bps: z.number(),
  max_markets_fetched: z.number(),
  quote_unit_atoms: z.string(),
  min_leverage_bps: z.number(),
  max_leverage_bps: z.number(),
  final_window_rules: z.string(),
  time_based_leverage_rules: z.string(),
  one_x_leverage_rules: z.string(),
  force_deleverage_rules: z.string(),
  settlement_rules: z.string(),
  keeper_force_close_rules: z.string(),
  health_interpretation_rules: z.string(),
});

export const JarvisRiskProfileSchema = z.enum(['conservative', 'balanced', 'aggressive']);
export type JarvisRiskProfile = z.infer<typeof JarvisRiskProfileSchema>;

export const JarvisGuardrailsSchema = z.object({
  max_leverage: z.number().int().min(1).max(10),
  max_portfolio_pct: z.number().int().min(1).max(100),
  max_open_positions: z.number().int().min(1).max(10),
  risk_profile: JarvisRiskProfileSchema,
  dry_run: z.boolean(),
});

export type JarvisGuardrails = z.infer<typeof JarvisGuardrailsSchema>;

export const JarvisSystemContextSchema = z.object({
  jarvis_enabled: z.boolean(),
  last_run_at_ms: z.number().nullable(),
  interval_ms: z.number(),
  platform_rules: JarvisPlatformRulesSchema,
  user_guardrails: JarvisGuardrailsSchema,
});

export type JarvisPositionSnapshot = z.infer<typeof JarvisPositionSnapshotSchema>;
export type JarvisAccountSnapshot = z.infer<typeof JarvisAccountSnapshotSchema>;
export type JarvisMarketCandidate = z.infer<typeof JarvisMarketCandidateSchema>;
export type JarvisPlatformRules = z.infer<typeof JarvisPlatformRulesSchema>;
export type JarvisSystemContext = z.infer<typeof JarvisSystemContextSchema>;

export const OrderBookLevelSchema = z.object({
  price: z.number(),
  size: z.number(),
  total: z.number(),
});

export const OrderBookResponseSchema = z.object({
  oracle_id: z.string(),
  expiry_ms: z.number(),
  strike: z.number(),
  higher_strike: z.number(),
  is_up: z.boolean(),
  is_range: z.boolean(),
  last_traded_premium: z.number().nullable(),
  spread_bps: z.number().nullable(),
  bids: z.array(OrderBookLevelSchema),
  asks: z.array(OrderBookLevelSchema),
  ask_share_pct: z.number(),
  bid_share_pct: z.number(),
  updated_at_ms: z.number(),
});

export type OrderBookResponse = z.infer<typeof OrderBookResponseSchema>;

export const JarvisMarketDetailSchema = z.object({
  candidate: JarvisMarketCandidateSchema.nullable(),
  candles_15m: z.array(OhlcvCandleSchema),
  candles_1m: z.array(OhlcvCandleSchema),
  order_book_up: OrderBookResponseSchema.nullable(),
  order_book_down: OrderBookResponseSchema.nullable(),
});

// Tool inputs
export const GetAccountSnapshotInputSchema = z.object({});
export const GetMarketCandidatesInputSchema = z.object({});
export const GetMarketCandlesInputSchema = z.object({
  underlying: z.string().min(1),
});
export const GetOrderBookInputSchema = z.object({
  oracle_id: z.string().min(1),
  expiry_ms: z.number(),
  strike: z.number(),
  direction: z.enum(['UP', 'DOWN']).default('UP'),
});
export const GetMarketDetailInputSchema = z.object({
  oracle_id: z.string().min(1),
});
export const AnalyzePositionInputSchema = z.object({
  position_id: z.string().min(1),
});
export const GetPositionQuotesInputSchema = z.object({
  position_id: z.string().min(1),
});
export const GetOracleQuotesInputSchema = z.object({
  oracle_id: z.string().min(1),
  margin_usd: z.number().positive().optional(),
  leverage: z.number().min(1).max(10).optional(),
});
export const GetPlatformRulesInputSchema = z.object({});

export const JarvisKnowledgeTopicSchema = z.enum([
  'platform',
  'predict',
  'strategy',
  'mechanics',
  'risk',
  'units',
  'all',
]);

export type JarvisKnowledgeTopic = z.infer<typeof JarvisKnowledgeTopicSchema>;

export const GetKnowledgeBaseInputSchema = z.object({
  topic: JarvisKnowledgeTopicSchema.optional().default('all'),
});

// Tool outputs
export const GetAccountSnapshotOutputSchema = JarvisAccountSnapshotSchema;
export const GetMarketCandidatesOutputSchema = z.object({
  candidates: z.array(JarvisMarketCandidateSchema),
  count: z.number(),
});
export const GetMarketCandlesOutputSchema = z.object({
  underlying: z.string(),
  lookback_15m_hours: z.number(),
  lookback_1m_hours: z.number(),
  count_15m: z.number(),
  count_1m: z.number(),
  /** Each candle: [timestamp_ms, open_usd, high_usd, low_usd, close_usd] from DeepBook indexer. */
  candle_fields: OhlcvCandleFieldsSchema,
  candles_15m: z.array(OhlcvCandleSchema),
  candles_1m: z.array(OhlcvCandleSchema),
});
export const GetOrderBookOutputSchema = z.union([
  OrderBookResponseSchema,
  z.object({ error: z.literal('order_book_unavailable') }),
]);
export const GetMarketDetailOutputSchema = JarvisMarketDetailSchema;
export const AnalyzePositionOutputSchema = z.union([
  JarvisPositionSnapshotSchema,
  z.object({ error: z.literal('position_not_found'), position_id: z.string() }),
]);
export const GetPositionQuotesOutputSchema = z.union([
  JarvisPositionQuotesSchema.extend({ position_key: z.string() }),
  z.object({ error: z.literal('position_not_found'), position_id: z.string() }),
]);
export const GetOracleQuotesOutputSchema = z.union([
  JarvisMarketMintQuotesSchema.extend({ oracle_id: z.string() }),
  z.object({ error: z.literal('oracle_not_found'), oracle_id: z.string() }),
]);
export const GetPlatformRulesOutputSchema = JarvisPlatformRulesSchema;
export const GetKnowledgeBaseOutputSchema = z.object({
  topic: JarvisKnowledgeTopicSchema,
  content: z.string(),
});
export const SubmitJarvisDecisionOutputSchema = z.object({
  accepted: z.boolean(),
  action_count: z.number(),
});

export const JarvisInitialContextSchema = z.object({
  system: JarvisSystemContextSchema,
  account: JarvisAccountSnapshotSchema,
  platform_rules: JarvisPlatformRulesSchema,
  market_candidates: z
    .array(
      z.object({
        candidate: JarvisMarketCandidateSchema,
        candles_15m: z.array(OhlcvCandleSchema),
        candles_1m: z.array(OhlcvCandleSchema),
        order_book_up: OrderBookResponseSchema.nullable(),
        order_book_down: OrderBookResponseSchema.nullable(),
      }),
    )
    .optional(),
});

// ---------------------------------------------------------------------------
// API / job / websocket
// ---------------------------------------------------------------------------

export const JarvisJobDataSchema = z.object({
  userAddress: z.string().min(1),
  accountId: z.string().min(1),
});

export type JarvisJobData = z.infer<typeof JarvisJobDataSchema>;

export const JarvisAccountBodySchema = z.object({
  owner: z.string().min(1),
  account_id: z.string().min(1),
});

export const JarvisMarkReadBodySchema = JarvisAccountBodySchema.extend({
  event_ids: z.array(z.string()).optional(),
});

export const JarvisStatusQuerySchema = z.object({
  owner: z.string().min(1),
  account_id: z.string().min(1),
});

export const JarvisEventsQuerySchema = JarvisStatusQuerySchema.extend({
  limit: z.coerce.number().int().min(1).max(200).optional().default(50),
  before_ms: z.coerce.number().int().positive().optional(),
});

export const JarvisStatusResponseSchema = z.object({
  enabled: z.boolean(),
  configured: z.boolean(),
  user_address: z.string(),
  account_id: z.string(),
  last_run_at_ms: z.number().nullable(),
  next_run_at_ms: z.number().nullable(),
  unread_count: z.number(),
  guardrails: JarvisGuardrailsSchema,
  last_decision_at_ms: z.number().nullable().optional(),
});

export type JarvisStatusResponse = z.infer<typeof JarvisStatusResponseSchema>;

export const JarvisSettingsResponseSchema = z.object({
  enabled: z.boolean(),
  user_address: z.string(),
  account_id: z.string(),
  guardrails: JarvisGuardrailsSchema,
});

export type JarvisSettingsResponse = z.infer<typeof JarvisSettingsResponseSchema>;

export const JarvisUpdateSettingsBodySchema = JarvisAccountBodySchema.extend({
  max_leverage: z.number().int().min(1).max(10).optional(),
  max_portfolio_pct: z.number().int().min(1).max(100).optional(),
  max_open_positions: z.number().int().min(1).max(10).optional(),
  risk_profile: JarvisRiskProfileSchema.optional(),
  dry_run: z.boolean().optional(),
});

export type JarvisUpdateSettingsBody = z.infer<typeof JarvisUpdateSettingsBodySchema>;

export const JarvisEventRecordSchema = z.object({
  id: z.string(),
  user_address: z.string(),
  account_id: z.string(),
  event_type: JarvisEventTypeSchema,
  message: z.string(),
  metadata: z.record(z.unknown()).nullable(),
  read: z.boolean(),
  created_at_ms: z.string(),
});

export type JarvisEventRecord = z.infer<typeof JarvisEventRecordSchema>;

export const JarvisMarkReadResponseSchema = z.object({
  updated: z.number(),
});

export const JarvisSubscribePayloadSchema = z.object({
  owner: z.string().min(1),
  account_id: z.string().min(1),
});

export const JarvisSubscribeResponseSchema = z.object({
  ok: z.boolean(),
});

export const JarvisUnreadPayloadSchema = z.object({
  unread_count: z.number(),
});

export const JarvisWsEventPayloadSchema = JarvisEventRecordSchema;

import { DynamicStructuredTool } from '@langchain/core/tools';
import { z } from 'zod';
import { getJarvisKnowledge } from '../jarvis-knowledge';
import type { JarvisDataService } from '../jarvis-data.service';
import {
  AnalyzePositionInputSchema,
  AnalyzePositionOutputSchema,
  GetAccountSnapshotInputSchema,
  GetAccountSnapshotOutputSchema,
  GetKnowledgeBaseInputSchema,
  GetKnowledgeBaseOutputSchema,
  GetMarketCandidatesInputSchema,
  GetMarketCandidatesOutputSchema,
  GetMarketCandlesInputSchema,
  GetMarketCandlesOutputSchema,
  GetMarketDetailInputSchema,
  GetMarketDetailOutputSchema,
  GetOrderBookInputSchema,
  GetOrderBookOutputSchema,
  GetOracleQuotesInputSchema,
  GetOracleQuotesOutputSchema,
  GetPlatformRulesInputSchema,
  GetPlatformRulesOutputSchema,
  GetPositionQuotesInputSchema,
  GetPositionQuotesOutputSchema,
  JarvisDecisionSchema,
  JarvisSystemContextSchema,
  SubmitJarvisDecisionOutputSchema,
  type JarvisDecision,
  type JarvisPhase,
} from '../jarvis.schemas';

export type JarvisToolSession = {
  owner: string;
  accountId: string;
  phase: JarvisPhase;
  systemContext: z.infer<typeof JarvisSystemContextSchema>;
  data: JarvisDataService;
  onDecision?: (decision: JarvisDecision) => void;
};

function stringifyOutput<T>(schema: z.ZodType<T>, value: unknown): string {
  return JSON.stringify(schema.parse(value));
}

export function createJarvisTools(session: JarvisToolSession) {
  const getAccountSnapshotTool = new DynamicStructuredTool({
    name: 'get_account_snapshot',
    description:
      'Return full trading account context: balance (dUSDC), executor registration, and all open positions with on-chain redeem/partial_repay quotes, health_pct, risk_readout, and labeled units.',
    schema: GetAccountSnapshotInputSchema,
    func: async () => {
      const snapshot = await session.data.getAccountSnapshot(
        session.owner,
        session.accountId,
      );
      return stringifyOutput(GetAccountSnapshotOutputSchema, snapshot);
    },
  });

  const getMarketCandidatesTool = new DynamicStructuredTool({
    name: 'get_market_candidates',
    description:
      'List live binary option markets ending within 72 hours, including on-chain UP/DOWN mint quotes at ATM strike, spot price, strikes, and expiry metadata.',
    schema: GetMarketCandidatesInputSchema,
    func: async () => {
      const candidates = await session.data.getMarketCandidates();
      return stringifyOutput(GetMarketCandidatesOutputSchema, {
        candidates,
        count: candidates.length,
      });
    },
  });

  const getMarketCandlesTool = new DynamicStructuredTool({
    name: 'get_market_candles',
    description:
      'Fetch OHLCV candle series for an underlying asset (e.g. BTC): 15m (7-day lookback) and 1m (12-hour lookback). Returns [timestamp, open, high, low, close] tuples for each interval.',
    schema: GetMarketCandlesInputSchema,
    func: async (input) => {
      const { underlying } = GetMarketCandlesInputSchema.parse(input);
      const ohlcv = await session.data.getMarketCandles(underlying);
      return stringifyOutput(GetMarketCandlesOutputSchema, {
        underlying: underlying.toUpperCase(),
        lookback_15m_hours: 7 * 24,
        lookback_1m_hours: 12,
        count_15m: ohlcv.candles_15m.length,
        count_1m: ohlcv.candles_1m.length,
        candle_fields: [
          'timestamp_ms',
          'open_usd',
          'high_usd',
          'low_usd',
          'close_usd',
        ] as const,
        candles_15m: ohlcv.candles_15m,
        candles_1m: ohlcv.candles_1m,
      });
    },
  });

  const getOrderBookTool = new DynamicStructuredTool({
    name: 'get_order_book',
    description:
      'Fetch order book summary for a market side (UP or DOWN) including bid/ask levels and share percentages.',
    schema: GetOrderBookInputSchema,
    func: async (input) => {
      const { oracle_id, expiry_ms, strike, direction } =
        GetOrderBookInputSchema.parse(input);
      const book = await session.data.getOrderBook({
        oracleId: oracle_id,
        expiryMs: expiry_ms,
        strike,
        isUp: direction === 'UP',
      });
      const output =
        book ?? ({ error: 'order_book_unavailable' as const });
      return stringifyOutput(GetOrderBookOutputSchema, output);
    },
  });

  const getMarketDetailTool = new DynamicStructuredTool({
    name: 'get_market_detail',
    description:
      'Fetch comprehensive market data for one oracle: metadata with on-chain mint quotes, 15m + 1m OHLCV candles, and UP/DOWN order books at ATM strike.',
    schema: GetMarketDetailInputSchema,
    func: async (input) => {
      const { oracle_id } = GetMarketDetailInputSchema.parse(input);
      const detail = await session.data.getMarketDetail(oracle_id);
      return stringifyOutput(GetMarketDetailOutputSchema, detail);
    },
  });

  const analyzePositionTool = new DynamicStructuredTool({
    name: 'analyze_position',
    description:
      'Look up a single open position by position_key or oracle_id with on-chain redeem/partial_repay quotes, health_pct, risk_readout, PnL, and labeled units.',
    schema: AnalyzePositionInputSchema,
    func: async (input) => {
      const { position_id } = AnalyzePositionInputSchema.parse(input);
      const snapshot = await session.data.getAccountSnapshot(
        session.owner,
        session.accountId,
      );
      const position = session.data.findPosition(snapshot, position_id);
      const output =
        position ?? { error: 'position_not_found' as const, position_id };
      return stringifyOutput(AnalyzePositionOutputSchema, output);
    },
  });

  const getPositionQuotesTool = new DynamicStructuredTool({
    name: 'get_position_quotes',
    description:
      'Refresh on-chain redeem and partial_repay quotes for one open position (by position_key or oracle_id).',
    schema: GetPositionQuotesInputSchema,
    func: async (input) => {
      const { position_id } = GetPositionQuotesInputSchema.parse(input);
      const output = await session.data.getPositionQuotes(
        position_id,
        session.owner,
        session.accountId,
      );
      return stringifyOutput(GetPositionQuotesOutputSchema, output);
    },
  });

  const getOracleQuotesTool = new DynamicStructuredTool({
    name: 'get_oracle_quotes',
    description:
      'Fetch fresh on-chain UP/DOWN mint quotes for an oracle at ATM strike. Optional margin_usd and leverage override reference sizing.',
    schema: GetOracleQuotesInputSchema,
    func: async (input) => {
      const parsed = GetOracleQuotesInputSchema.parse(input);
      const output = await session.data.getOracleQuotes(
        parsed.oracle_id,
        parsed.margin_usd,
        parsed.leverage,
      );
      return stringifyOutput(GetOracleQuotesOutputSchema, output);
    },
  });

  const getPlatformRulesTool = new DynamicStructuredTool({
    name: 'get_platform_rules',
    description:
      'Return platform bounds (leverage, margin, slippage, final_window_ms) plus rule text for final window, time-graded leverage (1×–10× by periods remaining), 1× leverage, force-deleverage, settlement, keeper force-close, and health_interpretation_rules. For strategy context use get_knowledge_base.',
    schema: GetPlatformRulesInputSchema,
    func: async () => {
      return stringifyOutput(
        GetPlatformRulesOutputSchema,
        session.systemContext.platform_rules,
      );
    },
  });

  const getKnowledgeBaseTool = new DynamicStructuredTool({
    name: 'get_knowledge_base',
    description:
      'Return LeverX / DeepBook Predict knowledge for Jarvis: platform overview, Predict mechanics, profit strategy, trading mechanics, risk/health/PnL messaging, or units/parameters reference. Optional topic filter: platform | predict | strategy | mechanics | risk | units | all (default all).',
    schema: GetKnowledgeBaseInputSchema,
    func: async (input) => {
      const { topic } = GetKnowledgeBaseInputSchema.parse(input);
      return stringifyOutput(GetKnowledgeBaseOutputSchema, getJarvisKnowledge(topic));
    },
  });

  const submitJarvisDecisionTool = new DynamicStructuredTool({
    name: 'submit_jarvis_decision',
    description:
      'Submit the final structured Jarvis decision for this lifecycle phase. Must be called once when analysis is complete.',
    schema: JarvisDecisionSchema,
    func: async (input) => {
      const decision = JarvisDecisionSchema.parse({
        ...input,
        phase: input.phase === 'idle' ? session.phase : input.phase,
      });
      session.onDecision?.(decision);
      return stringifyOutput(SubmitJarvisDecisionOutputSchema, {
        accepted: true,
        action_count: decision.actions.length,
      });
    },
  });

  return [
    getAccountSnapshotTool,
    getMarketCandidatesTool,
    getMarketCandlesTool,
    getOrderBookTool,
    getMarketDetailTool,
    analyzePositionTool,
    getPositionQuotesTool,
    getOracleQuotesTool,
    getPlatformRulesTool,
    getKnowledgeBaseTool,
    submitJarvisDecisionTool,
  ];
}

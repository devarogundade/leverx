import { Injectable, Logger } from '@nestjs/common';
import { z } from 'zod';
import { ConfigService } from '@nestjs/config';
import type { JarvisConfig } from '../config/jarvis.config';
import {
  MAX_LEVERAGE_BPS,
  MIN_LEVERAGE_BPS,
} from '../config/constants';
import { computeFinalWindowContext } from '../config/trade-math';
import { IndexerService } from '../indexer/indexer.service';
import type { LeveragedPosition } from '../indexer/indexer.types';
import { logKeeperWarn } from '../lib/keeper-log';
import { SuiService } from '../sui/sui.service';
import { TelegramMarketsService } from '../telegram/telegram-markets.service';
import {
  atmStrikeRaw,
  baseFromUnderlying,
  MAX_LEVERAGE,
  MAX_MARGIN_USD,
  MIN_LEVERAGE,
  MIN_MARGIN_USD,
  QUOTE_UNIT,
  toOracleStrikeRaw,
} from '../telegram/telegram-trade-math';
import {
  JarvisAccountSnapshotSchema,
  JarvisMarketCandidateSchema,
  JarvisMarketDetailSchema,
  JarvisPlatformRulesSchema,
  JarvisPositionSnapshotSchema,
  JarvisOhlcvBundleSchema,
  OhlcvCandleSchema,
  type JarvisAccountSnapshot,
  type JarvisMarketCandidate,
  type JarvisPlatformRules,
  type JarvisPositionSnapshot,
  type JarvisOhlcvBundle,
  type OhlcvCandle,
  type OhlcvInterval,
} from './jarvis.schemas';
import { JarvisTradeService } from './jarvis-trade.service';
import {
  closingPremiumRaw,
  computeHealthMetrics,
  computePositionPnl,
  coerceAtoms,
  entryPremiumRaw,
  premiumRawToCents,
  scaleQuoteUsd,
  scaleSpotUsd,
  strikeRawToUsd,
} from './jarvis-units';

const DEEPBOOK_PAIRS: Record<string, string> = {
  BTC: 'XBTC_USDC',
};

/** 15m series — multi-day trend context. */
const OHLCV_15M_LOOKBACK_MS = 7 * 24 * 60 * 60 * 1000;
/** 1m series — recent intraday momentum (kept shorter to limit LLM payload). */
const OHLCV_1M_LOOKBACK_MS = 12 * 60 * 60 * 1000;

export type {
  JarvisAccountSnapshot,
  JarvisMarketCandidate,
  JarvisPlatformRules,
  JarvisPositionSnapshot,
  JarvisSystemContext,
} from './jarvis.schemas';

@Injectable()
export class JarvisDataService {
  private readonly logger = new Logger(JarvisDataService.name);
  private readonly cfg: JarvisConfig;

  constructor(
    config: ConfigService,
    private readonly indexer: IndexerService,
    private readonly trade: JarvisTradeService,
    private readonly markets: TelegramMarketsService,
    private readonly sui: SuiService,
  ) {
    this.cfg = config.get<JarvisConfig>('jarvis')!;
  }

  getPlatformRules(): JarvisPlatformRules {
    const finalWindowMs = this.sui.getFinalWindowMs();
    const liquidationBps = this.sui.getLiquidationBps() ?? 10_200;
    const finalWindowMinutes = finalWindowMs / (60 * 1000);

    return JarvisPlatformRulesSchema.parse({
      min_leverage: MIN_LEVERAGE,
      max_leverage: MAX_LEVERAGE,
      min_margin_usd: MIN_MARGIN_USD,
      max_margin_usd: MAX_MARGIN_USD,
      market_slippage_bps: this.cfg.marketSlippageBps,
      final_window_ms: finalWindowMs,
      final_window_minutes: finalWindowMinutes,
      liquidation_threshold_bps: liquidationBps,
      max_markets_fetched: this.cfg.marketsLimit,
      quote_unit_atoms: QUOTE_UNIT.toString(),
      min_leverage_bps: MIN_LEVERAGE_BPS,
      max_leverage_bps: MAX_LEVERAGE_BPS,
      final_window_rules: [
        `Final window duration: ${finalWindowMs} ms (${finalWindowMinutes} minutes) from on-chain registry final_window_ms.`,
        `Window interval: [expiry_ms - final_window_ms, expiry_ms) — inclusive start, exclusive expiry.`,
        `During the final window, new mints with leverage > 1× are blocked (assert_leveraged_mint_window).`,
        `1× mints remain allowed until expiry unless trading is paused.`,
        `Resting leveraged limit orders must expire before the final window opens.`,
      ].join(' '),
      one_x_leverage_rules: [
        'At 1× (leverage_bps = 10_000, no vault borrow), positions are never liquidatable via the health-factor path.',
        'ltv::effective_health_debt returns 0 for unleveraged keys, so is_position_liquidatable is always false at 1×.',
        '1× positions still expire and settle at oracle expiry — redeem/settle flows apply normally.',
        'After force-deleverage, the keeper may remint at 1× from leftover margin if remint_after_deleverage is enabled on the key.',
      ].join(' '),
      force_deleverage_rules: [
        'In the final window, permissionless keepers force-deleverage borrowed positions (borrow_quote > 0): redeem contracts → repay vault debt → optionally remint at 1×.',
        'Underwater positions skip force-deleverage and go through liquidation instead (must_liquidate).',
        'Force-deleverage requires oracle not yet settled and positive open quantity.',
        'User setting remint_after_deleverage=false leaves surplus as cash on the key after deleverage.',
      ].join(' '),
      settlement_rules: [
        'At expiry the oracle settles to a final price; positions redeem against settled bids.',
        'After expiry but before oracle settlement, keepers may force-repay borrowed positions (redeem live → repay, no remint).',
        'Once settled, users/keepers call settle_expired_proxy_position to finalize payout and clear key debt.',
      ].join(' '),
      keeper_force_close_rules: [
        'Keeper force_close task path 1 (pre-expiry): force-deleverage in final window for borrowed, healthy positions.',
        'Keeper force_close task path 2 (post-expiry, pre-settlement): force-repay vault debt without remint.',
        'Jarvis should close or de-risk leveraged positions before the final window — force-deleverage removes timing control.',
      ].join(' '),
    });
  }

  async getAccountSnapshot(
    owner: string,
    accountId: string,
  ): Promise<JarvisAccountSnapshot> {
    const normalizedOwner = owner.trim().toLowerCase();
    let detail: Awaited<ReturnType<IndexerService['fetchAccount']>>;
    try {
      detail = await this.indexer.fetchAccount(accountId);
    } catch (err) {
      logKeeperWarn(this.logger, `jarvis account snapshot ${accountId}`, err);
      return JarvisAccountSnapshotSchema.parse({
        owner: normalizedOwner,
        account_id: accountId,
        balance_usd: 0,
        balance_atoms: '0',
        balance_unit: 'dUSDC',
        borrowed_quote_usd: 0,
        borrowed_quote_atoms: '0',
        executor_registered: false,
        open_positions: [],
      });
    }

    const balanceAtoms = await this.trade.fetchTradingBalanceAtoms(accountId);
    const executorRegistered = await this.trade.isKeeperRegisteredExecutor(accountId);
    const borrowedAtoms = coerceAtoms(detail.account?.borrowed_quote ?? 0);

    const positions = (detail.open_positions ?? []).filter(
      (p) => BigInt(p.open_quantity || 0) > 0n,
    );

    const openPositions: JarvisPositionSnapshot[] = [];
    for (const position of positions) {
      openPositions.push(await this.enrichPosition(position));
    }

    return JarvisAccountSnapshotSchema.parse({
      owner: normalizedOwner,
      account_id: accountId,
      balance_usd: this.trade.formatBalanceUsd(balanceAtoms),
      balance_atoms: balanceAtoms.toString(),
      balance_unit: 'dUSDC',
      borrowed_quote_usd: scaleQuoteUsd(borrowedAtoms),
      borrowed_quote_atoms: borrowedAtoms.toString(),
      executor_registered: executorRegistered,
      open_positions: openPositions,
    });
  }

  async getMarketCandidates(): Promise<JarvisMarketCandidate[]> {
    return this.buildMarketCandidates();
  }

  /**
   * Full markets-phase context: candidates + candles + order books.
   * Fetches each market sequentially and caches OHLCV per underlying.
   */
  async buildMarketsInitialBundle(): Promise<
    Array<{
      candidate: JarvisMarketCandidate;
      candles_15m: OhlcvCandle[];
      candles_1m: OhlcvCandle[];
      order_book_up: Awaited<ReturnType<JarvisDataService['getOrderBook']>>;
      order_book_down: Awaited<ReturnType<JarvisDataService['getOrderBook']>>;
    }>
  > {
    const candidates = await this.buildMarketCandidates();
    const ohlcvCache = new Map<string, JarvisOhlcvBundle>();
    const markets: Array<{
      candidate: JarvisMarketCandidate;
      candles_15m: OhlcvCandle[];
      candles_1m: OhlcvCandle[];
      order_book_up: Awaited<ReturnType<JarvisDataService['getOrderBook']>>;
      order_book_down: Awaited<ReturnType<JarvisDataService['getOrderBook']>>;
    }> = [];

    for (const candidate of candidates) {
      markets.push(await this.enrichMarketCandidate(candidate, ohlcvCache));
    }

    return markets;
  }

  private async buildMarketCandidates(): Promise<JarvisMarketCandidate[]> {
    const oracles = await this.fetchLiveOracles();
    const now = Date.now();
    const endingSoon = oracles
      .filter((row) => {
        const expiry = row.expiry ?? 0;
        const hoursLeft = (expiry - now) / (60 * 60 * 1000);
        return expiry > now && hoursLeft <= 72;
      })
      .sort((a, b) => (a.expiry ?? 0) - (b.expiry ?? 0))
      .slice(0, this.cfg.marketsLimit);

    const candidates: JarvisMarketCandidate[] = [];
    for (const row of endingSoon) {
      const candidate = await this.buildMarketCandidate(row, now);
      if (candidate) candidates.push(candidate);
    }

    return candidates.map((row) => JarvisMarketCandidateSchema.parse(row));
  }

  async getMarketCandles(underlying: string): Promise<JarvisOhlcvBundle> {
    return this.fetchOhlcvBundle(underlying);
  }

  async getOrderBook(args: {
    oracleId: string;
    expiryMs: number;
    strike: number;
    isUp?: boolean;
  }) {
    try {
      return await this.indexer.fetchOrderBook({
        oracleId: args.oracleId,
        expiryMs: args.expiryMs,
        strike: args.strike,
        isUp: args.isUp ?? true,
      });
    } catch (err) {
      logKeeperWarn(this.logger, `jarvis order book ${args.oracleId}`, err);
      return null;
    }
  }

  async getMarketDetail(
    oracleId: string,
    candidates?: JarvisMarketCandidate[],
  ) {
    const resolved =
      candidates ?? (await this.buildMarketCandidates());
    const candidate =
      resolved.find((c) => c.oracle_id === oracleId.toLowerCase()) ?? null;
    if (!candidate) {
      return JarvisMarketDetailSchema.parse({
        candidate: null,
        candles_15m: [],
        candles_1m: [],
        order_book_up: null,
        order_book_down: null,
      });
    }

    const enriched = await this.enrichMarketCandidate(candidate, new Map());
    return JarvisMarketDetailSchema.parse({
      candidate: enriched.candidate,
      candles_15m: enriched.candles_15m,
      candles_1m: enriched.candles_1m,
      order_book_up: enriched.order_book_up,
      order_book_down: enriched.order_book_down,
    });
  }

  async getPositionQuotes(positionId: string, owner: string, accountId: string) {
    const snapshot = await this.getAccountSnapshot(owner, accountId);
    const position = this.findPosition(snapshot, positionId);
    if (!position) {
      return { error: 'position_not_found' as const, position_id: positionId };
    }
    return {
      position_key: position.position_key,
      redeem: position.quotes.redeem,
      partial_repay: position.quotes.partial_repay,
    };
  }

  async getOracleQuotes(
    oracleId: string,
    marginUsd?: number,
    leverage?: number,
  ) {
    const normalized = oracleId.trim().toLowerCase();
    const oracleState = await this.markets.fetchOracleState(normalized);
    if (!oracleState) {
      return { error: 'oracle_not_found' as const, oracle_id: normalized };
    }

    const spotUsd = scaleSpotUsd(oracleState.spot_price);
    const minStrikeRaw = toOracleStrikeRaw(oracleState.min_strike);
    const tickSizeRaw = toOracleStrikeRaw(oracleState.tick_size) || minStrikeRaw;

    const quotes = await this.trade.fetchOracleMintQuotes({
      oracleId: normalized,
      expiryMs: oracleState.expiry ?? 0,
      spotUsd,
      minStrikeRaw,
      tickSizeRaw,
      marginUsd,
      leverage,
    });

    return {
      oracle_id: normalized,
      ...quotes,
    };
  }

  findPosition(
    snapshot: JarvisAccountSnapshot,
    positionId: string,
  ): JarvisPositionSnapshot | undefined {
    const key = positionId.trim().toLowerCase();
    return snapshot.open_positions.find(
      (p) =>
        p.position_key.toLowerCase() === key ||
        p.oracle_id.toLowerCase() === key,
    );
  }

  private async enrichPosition(position: LeveragedPosition): Promise<JarvisPositionSnapshot> {
    const now = Date.now();
    const liquidatable = await this.trade.isLiquidatable(position);
    const leverage = Number(position.leverage_bps) / 10_000;
    const marketType = position.is_range ? 'RANGE' : position.is_up ? 'UP' : 'DOWN';

    const redeemQuote = await this.trade.fetchPositionRedeemQuote(position);
    const partialRepayQuote = await this.trade.fetchPositionPartialRepayQuote(position);

    const liveBid = redeemQuote?.price_per_share_raw
      ? coerceAtoms(redeemQuote.price_per_share_raw)
      : null;
    const entryPremium = entryPremiumRaw(position);
    const closingPremium = closingPremiumRaw(position, liveBid);

    const expectedPayoutAtoms = redeemQuote?.quote_out_atoms
      ? coerceAtoms(redeemQuote.quote_out_atoms)
      : 0n;
    const pnl =
      expectedPayoutAtoms > 0n
        ? computePositionPnl({ position, expectedPayoutAtoms })
        : { unrealized_pnl_usd: null as number | null, unrealized_pnl_pct: null as number | null };

    const liquidationBps = this.sui.getLiquidationBps() ?? 10_200;
    const finalWindowMs = this.sui.getFinalWindowMs();
    const finalWindow = computeFinalWindowContext(position.expiry_ms, now, finalWindowMs);
    const hasVaultBorrow = BigInt(position.borrow_quote || 0) > 0n;
    const atRiskOfForceDeleverage =
      finalWindow.in_final_window && leverage > 1 && hasVaultBorrow && liquidatable !== true;
    const health =
      expectedPayoutAtoms > 0n
        ? computeHealthMetrics({
            position,
            expectedPayoutAtoms,
            liquidationBps,
          })
        : {
            health_bps: null as number | null,
            health_label: 'unknown' as const,
            distance_to_liquidation_bps: null as number | null,
            liquidation_threshold_bps: liquidationBps,
          };

    return JarvisPositionSnapshotSchema.parse({
      position_key: position.position_key,
      oracle_id: position.oracle_id,
      market_type: marketType,
      direction: position.is_range ? null : position.is_up ? 'UP' : 'DOWN',
      open_quantity: Number(position.open_quantity),
      open_quantity_unit: 'contracts',
      margin_quote_usd: scaleQuoteUsd(position.margin_quote),
      margin_quote_atoms: coerceAtoms(position.margin_quote).toString(),
      borrow_quote_usd: scaleQuoteUsd(position.borrow_quote),
      borrow_quote_atoms: coerceAtoms(position.borrow_quote).toString(),
      mint_cost_usd: scaleQuoteUsd(position.mint_cost),
      leverage,
      leverage_unit: 'x_multiplier',
      entry_premium_cents: entryPremium != null ? premiumRawToCents(entryPremium) : null,
      closing_premium_cents: closingPremium != null ? premiumRawToCents(closingPremium) : null,
      entry_mark_raw: entryPremium?.toString() ?? null,
      closing_mark_raw: closingPremium?.toString() ?? null,
      mark_pnl_pct: estimateMarkPnlPct(position),
      unrealized_pnl_usd: pnl.unrealized_pnl_usd,
      unrealized_pnl_pct: pnl.unrealized_pnl_pct,
      liquidatable,
      health_bps: health.health_bps,
      health_label: health.health_label,
      distance_to_liquidation_bps: health.distance_to_liquidation_bps,
      liquidation_threshold_bps: health.liquidation_threshold_bps,
      expiry_ms: position.expiry_ms,
      time_to_expiry_ms: finalWindow.time_to_expiry_ms,
      time_to_expiry_hours: finalWindow.time_to_expiry_hours,
      final_window_ms: finalWindow.final_window_ms,
      in_final_window: finalWindow.in_final_window,
      hours_until_final_window: finalWindow.hours_until_final_window,
      has_vault_borrow: hasVaultBorrow,
      at_risk_of_force_deleverage: atRiskOfForceDeleverage,
      leveraged_mint_blocked: finalWindow.leveraged_mint_blocked,
      strike_usd: strikeRawToUsd(position.strike),
      strike_raw: position.strike,
      higher_strike_usd: strikeRawToUsd(position.higher_strike),
      higher_strike_raw: position.higher_strike,
      opened_at_ms: position.opened_at_ms,
      status: position.status,
      quotes: {
        redeem: redeemQuote,
        partial_repay: partialRepayQuote,
      },
    });
  }

  private async enrichMarketCandidate(
    candidate: JarvisMarketCandidate,
    ohlcvCache: Map<string, JarvisOhlcvBundle>,
  ) {
    const underlying = candidate.underlying;
    let ohlcv = ohlcvCache.get(underlying);
    if (!ohlcv) {
      ohlcv = await this.fetchOhlcvBundle(underlying);
      ohlcvCache.set(underlying, ohlcv);
    }

    const orderBookUp = await this.getOrderBook({
      oracleId: candidate.oracle_id,
      expiryMs: candidate.expiry_ms,
      strike: candidate.atm_strike_raw,
      isUp: true,
    });
    const orderBookDown = await this.getOrderBook({
      oracleId: candidate.oracle_id,
      expiryMs: candidate.expiry_ms,
      strike: candidate.atm_strike_raw,
      isUp: false,
    });

    return {
      candidate,
      candles_15m: ohlcv.candles_15m,
      candles_1m: ohlcv.candles_1m,
      order_book_up: orderBookUp,
      order_book_down: orderBookDown,
    };
  }

  private async buildMarketCandidate(
    row: { oracle_id: string; underlying_asset: string; expiry?: number; status?: string },
    now: number,
  ): Promise<JarvisMarketCandidate | null> {
    const oracleId = row.oracle_id.toLowerCase();
    const oracleState = await this.markets.fetchOracleState(oracleId);
    if (!oracleState) return null;

    const spotUsd = scaleSpotUsd(oracleState.spot_price);
    const minStrikeRaw = toOracleStrikeRaw(oracleState.min_strike);
    const tickSizeRaw = toOracleStrikeRaw(oracleState.tick_size) || minStrikeRaw;
    const atmStrike = atmStrikeRaw(spotUsd, minStrikeRaw, tickSizeRaw);
    const expiryMs = row.expiry ?? oracleState.expiry ?? 0;

    const mintQuotes = await this.trade.fetchOracleMintQuotes({
      oracleId,
      expiryMs,
      spotUsd,
      minStrikeRaw,
      tickSizeRaw,
    });

    const finalWindowMs = this.sui.getFinalWindowMs();
    const finalWindow = computeFinalWindowContext(expiryMs, now, finalWindowMs);

    return {
      oracle_id: oracleId,
      underlying: baseFromUnderlying(row.underlying_asset),
      expiry_ms: expiryMs,
      time_to_expiry_ms: finalWindow.time_to_expiry_ms,
      time_to_expiry_hours: finalWindow.time_to_expiry_hours,
      final_window_ms: finalWindow.final_window_ms,
      in_final_window: finalWindow.in_final_window,
      hours_until_final_window: finalWindow.hours_until_final_window,
      leveraged_mint_blocked: finalWindow.leveraged_mint_blocked,
      spot_usd: spotUsd,
      spot_unit: 'USD',
      min_strike_usd: strikeRawToUsd(minStrikeRaw),
      min_strike_raw: minStrikeRaw,
      atm_strike_usd: strikeRawToUsd(atmStrike),
      atm_strike_raw: atmStrike,
      tick_size_usd: strikeRawToUsd(tickSizeRaw),
      tick_size_raw: tickSizeRaw,
      strike_unit: 'USD_on_chain_1e9',
      status: String(oracleState.status ?? row.status ?? 'unknown'),
      is_settled:
        oracleState.is_settled ||
        String(oracleState.status ?? '').toLowerCase() === 'settled',
      quotes: mintQuotes,
    };
  }

  private async fetchLiveOracles(): Promise<
    Array<{ oracle_id: string; underlying_asset: string; expiry?: number; status?: string }>
  > {
    const cfg = this.sui.getConfig();
    const url = `${cfg.predictServerUrl}/predicts/${cfg.predictId}/oracles`;
    try {
      const res = await fetch(url);
      if (!res.ok) return [];
      const body = (await res.json()) as
        | Array<{ oracle_id: string; underlying_asset: string; expiry?: number; status?: string }>
        | { oracles?: Array<{ oracle_id: string; underlying_asset: string; expiry?: number; status?: string }> };
      if (Array.isArray(body)) return body;
      return body.oracles ?? [];
    } catch (err) {
      logKeeperWarn(this.logger, 'jarvis oracle list fetch failed', err);
      return [];
    }
  }

  private async fetchOhlcvBundle(underlying: string): Promise<JarvisOhlcvBundle> {
    const candles_15m = await this.fetchOhlcv(underlying, '15m');
    const candles_1m = await this.fetchOhlcv(underlying, '1m');
    return JarvisOhlcvBundleSchema.parse({ candles_15m, candles_1m });
  }

  private async fetchOhlcv(
    underlying: string,
    interval: OhlcvInterval,
  ): Promise<OhlcvCandle[]> {
    const pair = DEEPBOOK_PAIRS[underlying.toUpperCase()];
    if (!pair) return [];

    const lookbackMs =
      interval === '15m' ? OHLCV_15M_LOOKBACK_MS : OHLCV_1M_LOOKBACK_MS;
    const end = Date.now();
    const start = end - lookbackMs;
    const url = `${this.cfg.deepbookIndexerUrl}/ohlcv/${pair}?interval=${interval}&start_time=${start}&end_time=${end}`;
    try {
      const res = await fetch(url);
      if (!res.ok) return [];
      const body = (await res.json()) as
        | OhlcvCandle[]
        | { data?: OhlcvCandle[]; candles?: OhlcvCandle[] };
      if (Array.isArray(body)) return body;
      return body.data ?? body.candles ?? [];
    } catch (err) {
      logKeeperWarn(this.logger, `jarvis ohlcv fetch failed for ${pair} ${interval}`, err);
      return [];
    }
  }
}

function estimateMarkPnlPct(position: LeveragedPosition): number | null {
  const entry = position.entry_mark;
  if (entry == null || !Number.isFinite(entry) || entry <= 0) return null;
  const closing = position.closing_mark ?? entry;
  const pnl = ((closing - entry) / entry) * 100;
  return position.is_up ? pnl : -pnl;
}

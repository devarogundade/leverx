import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Transaction } from '@mysten/sui/transactions';
import type { JarvisConfig } from '../config/jarvis.config';
import {
  isLeveragedMintAllowed,
  minPayoutAfterSlippage,
  redeemPayoutFromBid,
} from '../config/trade-math';
import type { PositionKeyArgs } from '../keeper/keeper.types';
import { IndexerService } from '../indexer/indexer.service';
import type { LeveragedPosition } from '../indexer/indexer.types';
import { logKeeperError } from '../lib/keeper-log';
import { PredictQuoteService } from '../sui/predict-quote.service';
import { PtbBuilderService } from '../sui/ptb-builder.service';
import { SuiService } from '../sui/sui.service';
import { TelegramMarketsService } from '../telegram/telegram-markets.service';
import {
  applySlippageBps,
  atmStrikeRaw,
  costFromPremiumPerUnit,
  estimateQuantity,
  leverageMultiplierToBps,
  marginUsdToQuoteAtoms,
  QUOTE_UNIT,
  toOracleStrikeRaw,
} from '../telegram/telegram-trade-math';
import {
  buildMintQuotePayload,
  buildRedeemQuotePayload,
  coerceAtoms,
  estimateMintQuantity,
  JARVIS_PARTIAL_REPAY_FRACTION_BPS,
  JARVIS_REFERENCE_LEVERAGE,
  JARVIS_REFERENCE_MARGIN_USD,
  type OnChainQuotePayload,
  positionKeyFromLeveragedPosition,
} from './jarvis-units';

export type JarvisOpenTradeParams = {
  accountId: string;
  oracleId: string;
  side: 'up' | 'down';
  marginUsd: number;
  leverage: number;
};

export type JarvisTradeResult = {
  digest: string;
  side: 'up' | 'down';
  marginUsd: number;
  leverage: number;
  quantity: string;
  oracleId: string;
};

@Injectable()
export class JarvisTradeService {
  private readonly logger = new Logger(JarvisTradeService.name);
  private readonly cfg: JarvisConfig;

  constructor(
    config: ConfigService,
    private readonly sui: SuiService,
    private readonly ptb: PtbBuilderService,
    private readonly quotes: PredictQuoteService,
    private readonly indexer: IndexerService,
    private readonly markets: TelegramMarketsService,
  ) {
    this.cfg = config.get<JarvisConfig>('jarvis')!;
  }

  async fetchTradingBalanceAtoms(accountId: string): Promise<bigint> {
    const cfg = this.sui.getConfig();
    const tx = this.ptb.buildReadWithdrawableTradingQuote(cfg, accountId);
    const value = await this.sui.devInspectU64(tx);
    return value ?? 0n;
  }

  formatBalanceUsd(atoms: bigint): number {
    return Number(atoms) / Number(QUOTE_UNIT);
  }

  /** Re-fetch on-chain mint quote at execution size before opening. */
  async validateOpenQuote(params: {
    oracleId: string;
    side: 'up' | 'down';
    marginUsd: number;
    leverage: number;
  }): Promise<{ ok: true } | { ok: false; reason: string }> {
    const oracleState = await this.markets.fetchOracleState(params.oracleId);
    if (!oracleState) {
      return { ok: false, reason: 'oracle_unavailable' };
    }
    if (oracleState.is_settled || String(oracleState.status ?? '').toLowerCase() === 'settled') {
      return { ok: false, reason: 'oracle_settled' };
    }

    const minStrikeRaw = toOracleStrikeRaw(oracleState.min_strike);
    const tickSizeRaw = toOracleStrikeRaw(oracleState.tick_size) || minStrikeRaw;
    const spotUsd = normalizeSpotUsd(oracleState.spot_price);

    const quotes = await this.fetchOracleMintQuotes({
      oracleId: params.oracleId,
      expiryMs: oracleState.expiry ?? 0,
      spotUsd,
      minStrikeRaw,
      tickSizeRaw,
      marginUsd: params.marginUsd,
      leverage: params.leverage,
    });

    const quote = params.side === 'up' ? quotes.mint_up : quotes.mint_down;
    if (!quote) {
      return { ok: false, reason: 'quote_unavailable' };
    }
    if (quote.slippage_bps > this.cfg.marketSlippageBps) {
      return { ok: false, reason: 'slippage_too_high' };
    }
    return { ok: true };
  }

  async openTrade(params: JarvisOpenTradeParams): Promise<JarvisTradeResult> {
    const leverageBps = leverageMultiplierToBps(params.leverage);
    const marginAtoms = marginUsdToQuoteAtoms(params.marginUsd);
    if (marginAtoms <= 0n) {
      throw new BadRequestException('invalid_margin');
    }

    const balance = await this.fetchTradingBalanceAtoms(params.accountId);
    if (balance < marginAtoms) {
      throw new BadRequestException('insufficient_trading_balance');
    }

    const oracleState = await this.markets.fetchOracleState(params.oracleId);
    if (!oracleState) {
      throw new BadRequestException('oracle_unavailable');
    }
    if (oracleState.is_settled || String(oracleState.status ?? '').toLowerCase() === 'settled') {
      throw new BadRequestException('oracle_settled');
    }

    const expiryMs = oracleState.expiry ?? 0;
    const now = Date.now();
    if (!isLeveragedMintAllowed(expiryMs, Number(leverageBps), now, this.sui.getFinalWindowMs())) {
      throw new BadRequestException('leverage_blocked_final_window');
    }

    const minStrikeRaw = toOracleStrikeRaw(oracleState.min_strike);
    const tickSizeRaw = toOracleStrikeRaw(oracleState.tick_size) || minStrikeRaw;
    const spotUsd = normalizeSpotUsd(oracleState.spot_price);
    const strike = atmStrikeRaw(spotUsd, minStrikeRaw, tickSizeRaw);

    const key: PositionKeyArgs = {
      oracleId: params.oracleId,
      expiryMs,
      strike,
      higherStrike: 0,
      isUp: params.side === 'up',
      isRange: false,
    };

    const predictManagerId = await this.quotes.fetchPredictManagerId(params.accountId);
    if (!predictManagerId) {
      throw new BadRequestException('missing_predict_manager');
    }

    await this.assertKeeperIsExecutor(params.accountId);

    const ask = await this.quotes.fetchMarketAskPerUnit(key);
    if (!ask || ask <= 0n) {
      throw new BadRequestException('market_unavailable');
    }

    const quantity = estimateQuantity(marginAtoms, leverageBps, ask);
    const mintCost = costFromPremiumPerUnit(ask, quantity);
    const maxMintCost = applySlippageBps(mintCost, this.cfg.marketSlippageBps);

    const cfg = this.sui.getConfig();
    const tx = this.ptb.buildLeveragedMint(
      cfg,
      params.accountId,
      predictManagerId,
      {
        key,
        marginQuoteAtoms: marginAtoms,
        leverageBps,
        quantity,
        maxMintCost,
        marketSlippageBps: this.cfg.marketSlippageBps,
        remintAfterDeleverage: true,
        orderKind: 'market',
        limitPremiumPerUnit: 0n,
        placementSlippageBps: 0,
      },
    );

    const digest = await this.simulateAndExecute(tx, `jarvis mint ${params.accountId}`);
    return {
      digest,
      side: params.side,
      marginUsd: params.marginUsd,
      leverage: params.leverage,
      quantity: quantity.toString(),
      oracleId: params.oracleId,
    };
  }

  async closePosition(position: LeveragedPosition): Promise<string> {
    const predictManagerId = await this.quotes.fetchPredictManagerId(position.account_id);
    if (!predictManagerId) {
      throw new BadRequestException('missing_predict_manager');
    }

    await this.assertKeeperIsExecutor(position.account_id);

    const quantity = BigInt(position.open_quantity || 0);
    if (quantity <= 0n) {
      throw new BadRequestException('zero_quantity');
    }

    const key: PositionKeyArgs = {
      oracleId: position.oracle_id,
      expiryMs: position.expiry_ms,
      strike: position.strike,
      higherStrike: position.higher_strike,
      isUp: position.is_up,
      isRange: position.is_range,
    };

    const bid = await this.quotes.fetchMarketBidPerUnit(key, quantity);
    if (!bid || bid <= 0n) {
      throw new BadRequestException('market_unavailable');
    }

    const expectedPayout = redeemPayoutFromBid(bid, quantity);
    const minPayout = minPayoutAfterSlippage(expectedPayout, this.cfg.redeemSlippageBps);

    const cfg = this.sui.getConfig();
    const tx = this.ptb.buildLeveragedRedeem(cfg, {
      key,
      accountId: position.account_id,
      predictManagerId,
      quantity,
      minPayout,
      redeemMode: 'market',
      minPremiumPerUnit: 0n,
    });

    return this.simulateAndExecute(tx, `jarvis close ${position.account_id}`);
  }

  async partialRepay(position: LeveragedPosition, fractionBps = 4000): Promise<string> {
    const predictManagerId = await this.quotes.fetchPredictManagerId(position.account_id);
    if (!predictManagerId) {
      throw new BadRequestException('missing_predict_manager');
    }

    await this.assertKeeperIsExecutor(position.account_id);

    const openQty = BigInt(position.open_quantity || 0);
    const quantity = (openQty * BigInt(fractionBps)) / 10_000n;
    if (quantity <= 0n) {
      throw new BadRequestException('zero_quantity');
    }

    const key: PositionKeyArgs = {
      oracleId: position.oracle_id,
      expiryMs: position.expiry_ms,
      strike: position.strike,
      higherStrike: position.higher_strike,
      isUp: position.is_up,
      isRange: position.is_range,
    };

    const bid = await this.quotes.fetchMarketBidPerUnit(key, quantity);
    if (!bid || bid <= 0n) {
      throw new BadRequestException('market_unavailable');
    }

    const expectedPayout = redeemPayoutFromBid(bid, quantity);
    const minPayout = minPayoutAfterSlippage(expectedPayout, this.cfg.redeemSlippageBps);

    const cfg = this.sui.getConfig();
    const tx = this.ptb.buildLeveragedRedeem(cfg, {
      key,
      accountId: position.account_id,
      predictManagerId,
      quantity,
      minPayout,
      redeemMode: 'market',
      minPremiumPerUnit: 0n,
    });

    return this.simulateAndExecute(tx, `jarvis repay ${position.account_id}`);
  }

  async isLiquidatable(position: LeveragedPosition): Promise<boolean | null> {
    const cfg = this.sui.getConfig();
    const tx = this.ptb.buildIsLiquidatable(cfg, position);
    return this.sui.devInspectBool(tx);
  }

  async isKeeperRegisteredExecutor(accountId: string): Promise<boolean> {
    const keeper = this.sui.getKeeperAddress()?.toLowerCase();
    if (!keeper) return false;
    const { items } = await this.indexer.fetchExecutors({ accountId, limit: 20 });
    return items.some((row) => row.executor?.trim().toLowerCase() === keeper);
  }

  /** On-chain redeem quote for an open position at full quantity. */
  async fetchPositionRedeemQuote(
    position: LeveragedPosition,
  ): Promise<OnChainQuotePayload | null> {
    const quantity = coerceAtoms(position.open_quantity);
    if (quantity <= 0n) return null;

    const key = positionKeyFromLeveragedPosition(position);
    const bid = await this.quotes.fetchMarketBidPerUnit(key, quantity);
    if (!bid || bid <= 0n) return null;

    return buildRedeemQuotePayload({
      kind: 'redeem',
      quantity,
      bidPerUnit: bid,
      slippageBps: this.cfg.redeemSlippageBps,
    });
  }

  /** On-chain partial redeem quote (keeper default ~40% of open quantity). */
  async fetchPositionPartialRepayQuote(
    position: LeveragedPosition,
    fractionBps = JARVIS_PARTIAL_REPAY_FRACTION_BPS,
  ): Promise<OnChainQuotePayload | null> {
    const openQty = coerceAtoms(position.open_quantity);
    const quantity = (openQty * BigInt(fractionBps)) / 10_000n;
    if (quantity <= 0n) return null;

    const key = positionKeyFromLeveragedPosition(position);
    const bid = await this.quotes.fetchMarketBidPerUnit(key, quantity);
    if (!bid || bid <= 0n) return null;

    return buildRedeemQuotePayload({
      kind: 'partial_repay',
      quantity,
      bidPerUnit: bid,
      slippageBps: this.cfg.redeemSlippageBps,
    });
  }

  /** On-chain mint quotes for UP and DOWN at ATM strike. */
  async fetchOracleMintQuotes(args: {
    oracleId: string;
    expiryMs: number;
    spotUsd: number;
    minStrikeRaw: number;
    tickSizeRaw: number;
    marginUsd?: number;
    leverage?: number;
  }): Promise<{
    mint_up: OnChainQuotePayload | null;
    mint_down: OnChainQuotePayload | null;
    reference_sizing: {
      margin_usd: number;
      leverage: number;
      note: string;
    };
  }> {
    const marginUsd = args.marginUsd ?? JARVIS_REFERENCE_MARGIN_USD;
    const leverage = args.leverage ?? JARVIS_REFERENCE_LEVERAGE;
    const strike = atmStrikeRaw(args.spotUsd, args.minStrikeRaw, args.tickSizeRaw);
    const referenceSizing = {
      margin_usd: marginUsd,
      leverage,
      note: 'Reference mint quotes at ATM strike using on-chain ask dev-inspect.',
    };

    const mintUp = await this.fetchMintQuoteForSide({
      oracleId: args.oracleId,
      expiryMs: args.expiryMs,
      strike,
      isUp: true,
      marginUsd,
      leverage,
    });
    const mintDown = await this.fetchMintQuoteForSide({
      oracleId: args.oracleId,
      expiryMs: args.expiryMs,
      strike,
      isUp: false,
      marginUsd,
      leverage,
    });

    return {
      mint_up: mintUp,
      mint_down: mintDown,
      reference_sizing: referenceSizing,
    };
  }

  private async fetchMintQuoteForSide(args: {
    oracleId: string;
    expiryMs: number;
    strike: number;
    isUp: boolean;
    marginUsd: number;
    leverage: number;
  }): Promise<OnChainQuotePayload | null> {
    const key: PositionKeyArgs = {
      oracleId: args.oracleId,
      expiryMs: args.expiryMs,
      strike: args.strike,
      higherStrike: 0,
      isUp: args.isUp,
      isRange: false,
    };

    const ask = await this.quotes.fetchMarketAskPerUnit(key);
    if (!ask || ask <= 0n) return null;

    const quantity = estimateMintQuantity(args.marginUsd, args.leverage, ask);
    const askAtQty = await this.quotes.fetchMarketAskPerUnit(key, quantity);
    const finalAsk = askAtQty && askAtQty > 0n ? askAtQty : ask;
    const finalQty = estimateMintQuantity(args.marginUsd, args.leverage, finalAsk);

    return buildMintQuotePayload({
      marginUsd: args.marginUsd,
      leverage: args.leverage,
      askPerUnit: finalAsk,
      quantity: finalQty,
      slippageBps: this.cfg.marketSlippageBps,
    });
  }

  private async assertKeeperIsExecutor(accountId: string): Promise<void> {
    if (!(await this.isKeeperRegisteredExecutor(accountId))) {
      throw new ForbiddenException('keeper_not_registered_executor');
    }
  }

  private async simulateAndExecute(tx: Transaction, label: string): Promise<string> {
    const readiness = this.sui.getTaskReadiness();
    if (!readiness.txReady) {
      throw new ServiceUnavailableException({
        error: 'keeper_not_configured',
        missing: readiness.missing,
      });
    }
    if (this.sui.isTradingPaused()) {
      throw new ServiceUnavailableException('trading_paused');
    }

    if (!(await this.sui.devInspect(tx))) {
      throw new BadRequestException('simulation_failed');
    }

    try {
      const digest = await this.sui.execute(tx);
      this.logger.log(`jarvis trade ${label} digest=${digest}`);
      return digest;
    } catch (err) {
      logKeeperError(this.logger, `jarvis trade ${label}`, err);
      throw new ServiceUnavailableException('trade_failed');
    }
  }
}

function normalizeSpotUsd(spot: number | undefined): number {
  if (spot == null || !Number.isFinite(spot)) return 0;
  if (spot > 1_000_000) return spot / 1_000_000_000;
  return spot;
}

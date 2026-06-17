import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Transaction } from '@mysten/sui/transactions';
import type { TelegramConfig } from '../config/telegram.config';
import { isLeveragedMintAllowed } from '../config/trade-math';
import type { PositionKeyArgs } from '../keeper/keeper.types';
import { IndexerService } from '../indexer/indexer.service';
import { logKeeperError } from '../lib/keeper-log';
import { simulationFailureMessage } from '../lib/move-abort';
import { PredictQuoteService } from '../sui/predict-quote.service';
import { PtbBuilderService } from '../sui/ptb-builder.service';
import { SuiService } from '../sui/sui.service';
import type { TelegramTradingSession } from './telegram-session.types';
import {
  applySlippageBps,
  atmStrikeRaw,
  costFromPremiumPerUnit,
  estimateQuantity,
  leverageMultiplierToBps,
  marginUsdToQuoteAtoms,
  MAX_MARGIN_USD,
  MIN_MARGIN_USD,
  parseLeverageMultiplier,
  QUOTE_UNIT,
  toOracleStrikeRaw,
} from './telegram-trade-math';
import { TelegramMarketsService } from './telegram-markets.service';

export type TelegramTradeSide = 'up' | 'down' | 'range';

export type TelegramOpenTradeResult = {
  digest: string;
  side: TelegramTradeSide;
  marginUsd: number;
  leverage: number;
  quantity: string;
  oracleId: string;
};

@Injectable()
export class TelegramTradeService {
  private readonly logger = new Logger(TelegramTradeService.name);
  private readonly cfg: TelegramConfig;

  constructor(
    config: ConfigService,
    private readonly sui: SuiService,
    private readonly ptb: PtbBuilderService,
    private readonly quotes: PredictQuoteService,
    private readonly indexer: IndexerService,
    private readonly markets: TelegramMarketsService,
  ) {
    this.cfg = config.get<TelegramConfig>('telegram')!;
  }

  async fetchTradingBalanceAtoms(accountId: string): Promise<bigint> {
    const cfg = this.sui.getConfig();
    const tx = this.ptb.buildReadWithdrawableTradingQuote(cfg, accountId);
    const value = await this.sui.devInspectU64(tx);
    return value ?? 0n;
  }

  formatBalanceMessage(atoms: bigint): string {
    const usd = Number(atoms) / Number(QUOTE_UNIT);
    return `${usd.toFixed(2)} dUSDC available in your trading account.`;
  }

  async openTrade(
    session: TelegramTradingSession,
    side: TelegramTradeSide,
    marginUsd: number,
    leverageRaw: string,
  ): Promise<TelegramOpenTradeResult> {
    if (!session.active_oracle_id) {
      throw new BadRequestException('no_active_market');
    }
    if (marginUsd < MIN_MARGIN_USD || marginUsd > MAX_MARGIN_USD) {
      throw new BadRequestException('margin_out_of_bounds');
    }

    const leverage = parseLeverageMultiplier(leverageRaw);
    if (leverage == null) {
      throw new BadRequestException('invalid_leverage');
    }
    const leverageBps = leverageMultiplierToBps(leverage);
    const marginAtoms = marginUsdToQuoteAtoms(marginUsd);
    if (marginAtoms <= 0n) {
      throw new BadRequestException('invalid_margin');
    }

    const balance = await this.fetchTradingBalanceAtoms(session.account_id);
    if (balance < marginAtoms) {
      throw new BadRequestException('insufficient_trading_balance');
    }

    const oracleState = await this.markets.fetchOracleState(session.active_oracle_id);
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
      oracleId: session.active_oracle_id,
      expiryMs,
      strike,
      higherStrike: side === 'range' ? strike + tickSizeRaw : 0,
      isUp: side !== 'down',
      isRange: side === 'range',
    };

    const predictManagerId = await this.quotes.fetchPredictManagerId(session.account_id);
    if (!predictManagerId) {
      throw new BadRequestException('missing_predict_manager');
    }

    await this.assertKeeperIsExecutor(session.account_id);

    const ask = await this.quotes.fetchMarketAskPerUnit(key);
    if (!ask || ask <= 0n) {
      throw new BadRequestException('market_unavailable');
    }

    const quantity = estimateQuantity(marginAtoms, leverageBps, ask);
    const mintCost = costFromPremiumPerUnit(ask, quantity);
    const maxMintCost = applySlippageBps(mintCost, this.cfg.defaultMarketSlippageBps);

    const cfg = this.sui.getConfig();
    const tx = this.ptb.buildLeveragedMint(
      cfg,
      session.account_id,
      predictManagerId,
      {
        key,
        marginQuoteAtoms: marginAtoms,
        leverageBps,
        quantity,
        maxMintCost,
        marketSlippageBps: this.cfg.defaultMarketSlippageBps,
        remintAfterDeleverage: true,
        orderKind: 'market',
        limitPremiumPerUnit: 0n,
        placementSlippageBps: 0,
      },
    );

    const digest = await this.simulateAndExecute(tx, `telegram mint ${session.account_id}`);
    return {
      digest,
      side,
      marginUsd,
      leverage,
      quantity: quantity.toString(),
      oracleId: session.active_oracle_id,
    };
  }

  private async assertKeeperIsExecutor(accountId: string): Promise<void> {
    const keeper = this.sui.getKeeperAddress()?.toLowerCase();
    if (!keeper) {
      throw new ServiceUnavailableException('keeper_not_configured');
    }
    const { items } = await this.indexer.fetchExecutors({ accountId, limit: 20 });
    const registered = items.some(
      (row) => row.executor?.trim().toLowerCase() === keeper,
    );
    if (!registered) {
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

    const simulation = await this.sui.tryDevInspect(tx);
    if (!simulation.ok) {
      throw new BadRequestException(simulationFailureMessage(simulation.error));
    }

    try {
      const digest = await this.sui.execute(tx);
      this.logger.log(`telegram trade ${label} digest=${digest}`);
      return digest;
    } catch (err) {
      logKeeperError(this.logger, `telegram trade ${label}`, err);
      throw new ServiceUnavailableException('trade_failed');
    }
  }
}

function normalizeSpotUsd(spot: number | undefined): number {
  if (spot == null || !Number.isFinite(spot)) return 0;
  if (spot > 1_000_000) return spot / 1_000_000_000;
  return spot;
}

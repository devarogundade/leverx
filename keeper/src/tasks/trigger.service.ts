import { Injectable, Logger } from '@nestjs/common';
import {
  DEFAULT_TRIGGER_SLIPPAGE_BPS,
  TRIGGER_REDEEM_SLIPPAGE_BPS,
} from '../config/constants';
import {
  minPayoutAfterSlippage,
  redeemPayoutFromBid,
} from '../config/trade-math';
import { IndexerService } from '../indexer/indexer.service';
import type { LeveragedPosition } from '../indexer/indexer.types';
import type { TaskResult } from '../keeper/keeper.types';
import { logKeeperError } from '../lib/keeper-log';
import { PredictQuoteService } from '../sui/predict-quote.service';
import { PtbBuilderService } from '../sui/ptb-builder.service';
import { SuiService } from '../sui/sui.service';

type OnChainTriggers = {
  takeProfitPremium: bigint;
  stopLossPremium: bigint;
  takeProfitSlippageBps: number;
  stopLossSlippageBps: number;
};

@Injectable()
export class TriggerService {
  private readonly logger = new Logger(TriggerService.name);

  constructor(
    private readonly indexer: IndexerService,
    private readonly sui: SuiService,
    private readonly ptb: PtbBuilderService,
    private readonly quotes: PredictQuoteService,
  ) {}

  async run(limit: number): Promise<TaskResult[]> {
    const readiness = this.sui.getTaskReadiness();
    if (!readiness.tasks.trigger) {
      return [
        {
          kind: 'trigger',
          target: '-',
          success: false,
          error: 'keeper_not_configured',
          missing: readiness.missing,
        },
      ];
    }

    const cfg = this.sui.getConfig();
    const positions = await this.indexer.fetchAllPages((offset, pageSize) =>
      this.indexer.fetchPositions({
        status: 'open',
        minOpenQuantity: 1,
        hasPredictManager: true,
        limit: pageSize,
        offset,
      }),
    );

    const results: TaskResult[] = [];
    for (const position of positions) {
      if (results.filter((r) => r.success).length >= limit) break;

      const target = `${position.account_id}:${position.position_key}`;
      try {
        const triggers = await this.readOnChainTriggers(position);
        if (!triggers) continue;

        if (
          triggers.takeProfitPremium <= 0n &&
          triggers.stopLossPremium <= 0n
        ) {
          continue;
        }

        const action = await this.resolveTriggerAction(position, triggers);
        if (!action) continue;

        const slippageBps = this.slippageBpsForAction(triggers, action.kind);
        const minPayout = this.computeTriggerMinPayout(
          position,
          action.bid,
          slippageBps,
        );
        const tx = this.ptb.buildTriggerRedeem(cfg, position, minPayout);
        if (!(await this.sui.devInspect(tx))) {
          results.push({
            kind: 'trigger',
            target,
            success: false,
            error: 'simulation_failed',
          });
          continue;
        }

        const digest = await this.sui.execute(tx);
        this.logger.log(`trigger ${action.kind} ${target} digest=${digest}`);
        results.push({ kind: 'trigger', target, success: true, digest });
      } catch (err) {
        const error = logKeeperError(this.logger, `trigger ${target}`, err);
        results.push({ kind: 'trigger', target, success: false, error });
      }
    }
    return results;
  }

  private async readOnChainTriggers(
    position: LeveragedPosition,
  ): Promise<OnChainTriggers | null> {
    const cfg = this.sui.getConfig();
    const tx = this.ptb.buildGetTriggers(cfg, position);
    const values = await this.sui.devInspectU64Quad(tx);
    if (!values) return null;

    const [
      takeProfitPremium,
      stopLossPremium,
      takeProfitSlippageBps,
      stopLossSlippageBps,
    ] = values;

    return {
      takeProfitPremium,
      stopLossPremium,
      takeProfitSlippageBps: Number(takeProfitSlippageBps),
      stopLossSlippageBps: Number(stopLossSlippageBps),
    };
  }

  private slippageBpsForAction(
    triggers: OnChainTriggers,
    kind: 'take_profit' | 'stop_loss',
  ): number {
    const configured =
      kind === 'take_profit'
        ? triggers.takeProfitSlippageBps
        : triggers.stopLossSlippageBps;
    if (configured > 0) return configured;
    return TRIGGER_REDEEM_SLIPPAGE_BPS || DEFAULT_TRIGGER_SLIPPAGE_BPS;
  }

  private computeTriggerMinPayout(
    position: LeveragedPosition,
    bidPerUnit: bigint,
    slippageBps: number,
  ): bigint {
    const expected = redeemPayoutFromBid(
      bidPerUnit,
      BigInt(position.open_quantity),
    );
    return minPayoutAfterSlippage(expected, slippageBps);
  }

  private async resolveTriggerAction(
    position: LeveragedPosition,
    trigger: OnChainTriggers,
  ): Promise<{ kind: 'take_profit' | 'stop_loss'; bid: bigint } | null> {
    const key = this.ptb.keyFromPosition(position);
    const quantity = BigInt(position.open_quantity || 0);
    const bid = await this.quotes.fetchMarketBidPerUnit(
      key,
      quantity > 0n ? quantity : undefined,
    );
    if (bid === null || bid <= 0n) return null;

    const takeProfitPremium = trigger.takeProfitPremium;
    const stopLossPremium = trigger.stopLossPremium;

    if (takeProfitPremium > 0n && bid >= takeProfitPremium) {
      return { kind: 'take_profit', bid };
    }
    if (stopLossPremium > 0n && bid <= stopLossPremium) {
      return { kind: 'stop_loss', bid };
    }
    return null;
  }
}

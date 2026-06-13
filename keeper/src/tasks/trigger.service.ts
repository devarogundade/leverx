import { Injectable, Logger } from '@nestjs/common';
import { TRIGGER_REDEEM_SLIPPAGE_BPS } from '../config/constants';
import {
  minPayoutAfterSlippage,
  redeemPayoutFromBid,
} from '../config/trade-math';
import { IndexerService } from '../indexer/indexer.service';
import type { LeveragedPosition } from '../indexer/indexer.types';
import type { TaskResult } from '../keeper/keeper.types';
import { PtbBuilderService } from '../sui/ptb-builder.service';
import { SuiService } from '../sui/sui.service';

@Injectable()
export class TriggerService {
  private readonly logger = new Logger(TriggerService.name);

  constructor(
    private readonly indexer: IndexerService,
    private readonly sui: SuiService,
    private readonly ptb: PtbBuilderService,
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

        const [takeProfitPremium, stopLossPremium] = triggers;
        if (takeProfitPremium <= 0n && stopLossPremium <= 0n) continue;

        const action = await this.resolveTriggerAction(position, {
          take_profit_premium: Number(takeProfitPremium),
          stop_loss_premium: Number(stopLossPremium),
        });
        if (!action) continue;

        const minPayout = this.computeTriggerMinPayout(position, action.bid);
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
        const error = String(err);
        this.logger.warn(`trigger ${target}: ${error}`);
        results.push({ kind: 'trigger', target, success: false, error });
      }
    }
    return results;
  }

  private async readOnChainTriggers(
    position: LeveragedPosition,
  ): Promise<[bigint, bigint] | null> {
    const cfg = this.sui.getConfig();
    const tx = this.ptb.buildGetTriggers(cfg, position);
    return this.sui.devInspectU64Pair(tx);
  }

  private computeTriggerMinPayout(
    position: LeveragedPosition,
    bidPerUnit: number,
  ): bigint {
    const expected = redeemPayoutFromBid(
      BigInt(bidPerUnit),
      BigInt(position.open_quantity),
    );
    return minPayoutAfterSlippage(expected, TRIGGER_REDEEM_SLIPPAGE_BPS);
  }

  private async resolveTriggerAction(
    position: LeveragedPosition,
    trigger: {
      take_profit_premium: number;
      stop_loss_premium: number;
    },
  ): Promise<{ kind: 'take_profit' | 'stop_loss'; bid: number } | null> {
    const book = await this.indexer.fetchOrderBook({
      oracleId: position.oracle_id,
      expiryMs: position.expiry_ms,
      strike: position.strike,
      higherStrike: position.higher_strike,
      isUp: position.is_up,
      isRange: position.is_range,
    });

    const bid = book.bids[0]?.price;
    if (bid === undefined) return null;

    if (
      trigger.take_profit_premium > 0 &&
      bid >= trigger.take_profit_premium
    ) {
      return { kind: 'take_profit', bid };
    }
    if (trigger.stop_loss_premium > 0 && bid <= trigger.stop_loss_premium) {
      return { kind: 'stop_loss', bid };
    }
    return null;
  }
}

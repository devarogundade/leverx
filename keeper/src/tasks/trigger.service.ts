import { Injectable, Logger } from '@nestjs/common';
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
    const { items: triggers } = await this.indexer.fetchActiveTriggers();
    if (triggers.length === 0) return [];

    const { items: positions } = await this.indexer.fetchPositions({
      status: 'open',
      limit: 500,
    });

    const results: TaskResult[] = [];
    for (const trigger of triggers) {
      if (results.filter((r) => r.success).length >= limit) break;

      const matches = positions.filter(
        (p) =>
          p.account_id === trigger.account_id &&
          p.oracle_id === trigger.oracle_id &&
          p.is_range === trigger.is_range &&
          p.open_quantity > 0 &&
          p.predict_manager_id,
      );

      for (const position of matches) {
        const target = `${position.account_id}:${position.position_key}`;
        try {
          const action = await this.resolveTriggerAction(position, trigger);
          if (!action) continue;

          const tx = this.ptb.buildTriggerRedeem(cfg, position, 0n);
          if (!(await this.sui.devInspect(tx))) {
            continue;
          }

          const digest = await this.sui.execute(tx);
          this.logger.log(`trigger ${action} ${target} digest=${digest}`);
          results.push({ kind: 'trigger', target, success: true, digest });
        } catch (err) {
          this.logger.debug(`trigger skip ${target}: ${String(err)}`);
        }
      }
    }
    return results;
  }

  private async resolveTriggerAction(
    position: LeveragedPosition,
    trigger: {
      take_profit_premium: number;
      stop_loss_premium: number;
    },
  ): Promise<'take_profit' | 'stop_loss' | null> {
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
      return 'take_profit';
    }
    if (trigger.stop_loss_premium > 0 && bid <= trigger.stop_loss_premium) {
      return 'stop_loss';
    }
    return null;
  }
}

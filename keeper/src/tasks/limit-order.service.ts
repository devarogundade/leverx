import { Injectable, Logger } from '@nestjs/common';
import { IndexerService } from '../indexer/indexer.service';
import type { LimitMintOrder } from '../indexer/indexer.types';
import type { TaskResult } from '../keeper/keeper.types';
import { PtbBuilderService } from '../sui/ptb-builder.service';
import { SuiService } from '../sui/sui.service';

@Injectable()
export class LimitOrderService {
  private readonly logger = new Logger(LimitOrderService.name);

  constructor(
    private readonly indexer: IndexerService,
    private readonly sui: SuiService,
    private readonly ptb: PtbBuilderService,
  ) {}

  async run(limit: number): Promise<TaskResult[]> {
    const cfg = this.sui.getConfig();
    const readiness = this.sui.getTaskReadiness();
    if (!readiness.tasks.limit_order) {
      return [
        {
          kind: 'limit_order',
          target: '-',
          success: false,
          error: 'keeper_not_configured',
          missing: readiness.missing,
        },
      ];
    }

    const now = Date.now();
    const fillable = await this.indexer.fetchAllPages((offset, pageSize) =>
      this.indexer.fetchLimitOrders({
        status: 'open',
        minOrderExpiresMs: now,
        limit: pageSize,
        offset,
      }),
    );

    const results: TaskResult[] = [];
    for (const order of fillable.slice(0, limit * 3)) {
      if (results.filter((r) => r.success).length >= limit) break;

      const target = `${order.account_id}:${order.position_key}`;
      try {
        if (!(await this.isFillable(order))) {
          continue;
        }

        const account = await this.indexer.fetchAccount(order.account_id);
        const managerId = account.account?.predict_manager_id;
        if (!managerId) {
          results.push({
            kind: 'limit_order',
            target,
            success: false,
            error: 'missing_predict_manager',
          });
          continue;
        }

        const tx = this.ptb.buildExecuteLimitMint(cfg, order, managerId);
        if (!(await this.sui.devInspect(tx))) {
          results.push({
            kind: 'limit_order',
            target,
            success: false,
            error: 'simulation_failed',
          });
          continue;
        }

        const digest = await this.sui.execute(tx);
        this.logger.log(`filled limit ${target} digest=${digest}`);
        results.push({ kind: 'limit_order', target, success: true, digest });
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        this.logger.warn(`limit fill failed ${target}: ${message}`);
        results.push({ kind: 'limit_order', target, success: false, error: message });
      }
    }

    return results;
  }

  private async isFillable(order: LimitMintOrder): Promise<boolean> {
    const book = await this.indexer.fetchOrderBook({
      oracleId: order.oracle_id,
      expiryMs: order.expiry_ms,
      strike: order.strike,
      higherStrike: order.higher_strike,
      isUp: order.is_up,
      isRange: order.is_range,
    });

    const bestAsk = book.asks[0]?.price;
    if (bestAsk === undefined) return false;

    const maxPremium =
      order.limit_premium_per_unit +
      Math.floor((order.limit_premium_per_unit * order.slippage_bps) / 10_000);
    return bestAsk <= maxPremium;
  }
}

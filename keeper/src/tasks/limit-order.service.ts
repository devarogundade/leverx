import { Injectable, Logger } from '@nestjs/common';
import { isLeveragedMintAllowed } from '../config/trade-math';
import { IndexerService } from '../indexer/indexer.service';
import type { LimitMintOrder } from '../indexer/indexer.types';
import type { TaskResult } from '../keeper/keeper.types';
import { logKeeperError } from '../lib/keeper-log';
import { PredictQuoteService } from '../sui/predict-quote.service';
import { PtbBuilderService } from '../sui/ptb-builder.service';
import { SuiService } from '../sui/sui.service';

@Injectable()
export class LimitOrderService {
  private readonly logger = new Logger(LimitOrderService.name);

  constructor(
    private readonly indexer: IndexerService,
    private readonly sui: SuiService,
    private readonly ptb: PtbBuilderService,
    private readonly quotes: PredictQuoteService,
  ) {}

  async run(
    limit: number,
    options?: { allowFills?: boolean },
  ): Promise<TaskResult[]> {
    const allowFills = options?.allowFills ?? true;
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
    const results: TaskResult[] = [];

    // Leveraged limit fills need vault + predict wiring (same as settlement/liquidation).
    if (readiness.txReady && allowFills) {
      const fillable = await this.indexer.fetchAllPages((offset, pageSize) =>
        this.indexer.fetchLimitOrders({
          status: 'open',
          minOrderExpiresMs: now,
          limit: pageSize,
          offset,
        }),
      );

      for (const order of fillable.slice(0, limit * 3)) {
        if (results.filter((r) => r.success && r.kind === 'limit_order').length >= limit) {
          break;
        }

        const target = `${order.account_id}:${order.position_key}`;
        try {
          if (!this.canFillLeveragedOrder(order, now)) {
            continue;
          }
          if (!(await this.isFillable(order))) {
            continue;
          }

          const managerId =
            (await this.quotes.fetchPredictManagerId(order.account_id)) ??
            (await this.indexer.fetchAccount(order.account_id)).account
              ?.predict_manager_id;
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
          const message = logKeeperError(this.logger, `limit fill failed ${target}`, err);
          results.push({ kind: 'limit_order', target, success: false, error: message });
        }
      }
    }

    const expired = await this.indexer.fetchAllPages((offset, pageSize) =>
      this.indexer.fetchLimitOrders({
        status: 'open',
        maxOrderExpiresMs: now,
        limit: pageSize,
        offset,
      }),
    );

    let expiredCount = 0;
    for (const order of expired) {
      if (expiredCount >= limit) break;

      const target = `${order.account_id}:${order.position_key}`;
      try {
        const tx = this.ptb.buildExpireLimitMint(cfg, order);
        if (!(await this.sui.devInspect(tx))) {
          results.push({
            kind: 'limit_order_expire',
            target,
            success: false,
            error: 'simulation_failed',
          });
          continue;
        }

        const digest = await this.sui.execute(tx);
        this.logger.log(`expired limit ${target} digest=${digest}`);
        results.push({ kind: 'limit_order_expire', target, success: true, digest });
        expiredCount += 1;
      } catch (err) {
        const message = logKeeperError(this.logger, `limit expire failed ${target}`, err);
        results.push({
          kind: 'limit_order_expire',
          target,
          success: false,
          error: message,
        });
      }
    }

    return results;
  }

  /** Skip leveraged resting fills during the final window (on-chain mint window closed). */
  private canFillLeveragedOrder(order: LimitMintOrder, now: number): boolean {
    return isLeveragedMintAllowed(
      order.expiry_ms,
      order.leverage_bps,
      now,
      this.sui.getFinalWindowMs(),
    );
  }

  private async isFillable(order: LimitMintOrder): Promise<boolean> {
    const key = this.ptb.keyFromLimitOrder(order);
    const quantity = BigInt(order.quantity || 0);
    const bestAsk = await this.quotes.fetchMarketAskPerUnit(
      key,
      quantity > 0n ? quantity : undefined,
    );
    if (bestAsk === null) return false;

    const maxPremium =
      BigInt(order.limit_premium_per_unit) +
      (BigInt(order.limit_premium_per_unit) * BigInt(order.slippage_bps)) /
        10_000n;
    return bestAsk <= maxPremium;
  }
}

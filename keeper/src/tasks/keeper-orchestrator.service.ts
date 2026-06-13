import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { KeeperConfig } from '../config/keeper.config';
import { formatError } from '../lib/format-error';
import type { KeeperRunSummary, TaskResult } from '../keeper/keeper.types';
import { SuiService } from '../sui/sui.service';
import { LimitOrderService } from './limit-order.service';
import { LiquidationService } from './liquidation.service';
import { ForceCloseService } from './force-close.service';
import { SettlementService } from './settlement.service';
import { TriggerService } from './trigger.service';

export type KeeperTaskKind =
  | 'settlement'
  | 'limit_order'
  | 'liquidation'
  | 'trigger'
  | 'force_close'
  | 'all';

@Injectable()
export class KeeperOrchestratorService {
  private readonly logger = new Logger(KeeperOrchestratorService.name);
  private readonly cfg: KeeperConfig;
  private running = false;

  constructor(
    config: ConfigService,
    private readonly sui: SuiService,
    private readonly settlement: SettlementService,
    private readonly limitOrders: LimitOrderService,
    private readonly liquidation: LiquidationService,
    private readonly triggers: TriggerService,
    private readonly forceClose: ForceCloseService,
  ) {
    this.cfg = config.get<KeeperConfig>('keeper')!;
  }

  isEnabled(): boolean {
    return this.cfg.enabled;
  }

  isRunning(): boolean {
    return this.running;
  }

  async run(kind: KeeperTaskKind = 'all'): Promise<KeeperRunSummary> {
    if (this.running) {
      this.logger.debug(`keeper run skipped (${kind}): already_running`);
      return {
        startedAt: new Date().toISOString(),
        finishedAt: new Date().toISOString(),
        results: [{ kind, target: '-', success: false, error: 'already_running' }],
      };
    }

    this.running = true;
    const startedAt = new Date().toISOString();
    const results: TaskResult[] = [];

    try {
      await this.sui.refreshProtocolState();
      const tradingPaused = this.sui.isTradingPaused();

      if (kind === 'all' || kind === 'limit_order') {
        results.push(
          ...(await this.limitOrders.run(this.cfg.limits.limitFills, {
            allowFills: !tradingPaused,
          })),
        );
      }
      // Liquidation and limit expiry are not gated by trading_paused on-chain.
      if (kind === 'all' || kind === 'liquidation') {
        results.push(...(await this.liquidation.run(this.cfg.limits.liquidations)));
      }
      if (!tradingPaused) {
        if (kind === 'all' || kind === 'force_close') {
          results.push(...(await this.forceClose.run(this.cfg.limits.forceCloses)));
        }
        if (kind === 'all' || kind === 'settlement') {
          results.push(...(await this.settlement.run(this.cfg.limits.settlements)));
        }
        if (kind === 'all' || kind === 'trigger') {
          results.push(...(await this.triggers.run(this.cfg.limits.triggers)));
        }
      } else if (
        kind === 'force_close' ||
        kind === 'settlement' ||
        kind === 'trigger'
      ) {
        results.push({
          kind,
          target: '-',
          success: false,
          error: 'trading_paused',
        });
      }
    } catch (err) {
      this.logger.error(formatError(`keeper run failed (${kind})`, err));
      results.push({
        kind,
        target: '-',
        success: false,
        error: formatError('keeper run failed', err),
      });
    } finally {
      this.running = false;
    }

    for (const result of results) {
      if (result.success) continue;
      this.logger.warn(
        `task failed | kind=${result.kind} target=${result.target} error=${result.error ?? 'unknown'}`,
      );
    }

    const summary: KeeperRunSummary = {
      startedAt,
      finishedAt: new Date().toISOString(),
      results,
    };
    this.logger.log(
      `run ${kind}: ${results.filter((r) => r.success).length}/${results.length} succeeded`,
    );
    return summary;
  }
}

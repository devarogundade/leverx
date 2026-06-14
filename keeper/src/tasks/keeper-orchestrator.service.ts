import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { KeeperConfig } from '../config/keeper.config';
import { formatError } from '../lib/format-error';
import { logKeeperError, logTaskFailure } from '../lib/keeper-log';
import type { KeeperRunSummary, TaskResult } from '../keeper/keeper.types';
import { SuiService } from '../sui/sui.service';
import { LimitOrderService } from './limit-order.service';
import { LiquidationService } from './liquidation.service';
import { ForceCloseService } from './force-close.service';
import { TriggerService } from './trigger.service';

export type KeeperTaskKind =
  | 'limit_order'
  | 'liquidation'
  | 'trigger'
  | 'force_close'
  | 'all';

@Injectable()
export class KeeperOrchestratorService {
  private readonly logger = new Logger(KeeperOrchestratorService.name);
  private readonly cfg: KeeperConfig;
  /** Per-kind locks so staggered crons do not starve each other. */
  private readonly runningKinds = new Set<KeeperTaskKind>();

  constructor(
    config: ConfigService,
    private readonly sui: SuiService,
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
    return this.runningKinds.size > 0;
  }

  private isLocked(kind: KeeperTaskKind): boolean {
    if (this.runningKinds.has('all')) return true;
    if (kind === 'all') return this.runningKinds.size > 0;
    return this.runningKinds.has(kind);
  }

  async run(kind: KeeperTaskKind = 'all'): Promise<KeeperRunSummary> {
    if (this.isLocked(kind)) {
      this.logger.debug(`keeper run skipped (${kind}): already_running`);
      return {
        startedAt: new Date().toISOString(),
        finishedAt: new Date().toISOString(),
        results: [{ kind, target: '-', success: false, error: 'already_running' }],
      };
    }

    this.runningKinds.add(kind);
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
      // Maintenance paths are not gated by trading_paused on-chain or off-chain.
      if (kind === 'all' || kind === 'liquidation') {
        results.push(...(await this.liquidation.run(this.cfg.limits.liquidations)));
      }
      if (kind === 'all' || kind === 'force_close') {
        results.push(...(await this.forceClose.run(this.cfg.limits.forceCloses)));
      }
      if (!tradingPaused) {
        if (kind === 'all' || kind === 'trigger') {
          results.push(...(await this.triggers.run(this.cfg.limits.triggers)));
        }
      } else if (kind === 'trigger') {
        results.push({
          kind,
          target: '-',
          success: false,
          error: 'trading_paused',
        });
      }
    } catch (err) {
      logKeeperError(this.logger, `keeper run failed (${kind})`, err);
      results.push({
        kind,
        target: '-',
        success: false,
        error: formatError('keeper run failed', err),
      });
    } finally {
      this.runningKinds.delete(kind);
    }

    for (const result of results) {
      if (result.success) continue;
      logTaskFailure(
        this.logger,
        result.kind,
        result.target,
        result.error ?? 'unknown',
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

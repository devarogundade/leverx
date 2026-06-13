import { Injectable, Logger } from '@nestjs/common';
import { logKeeperError, logKeeperWarn } from '../lib/keeper-log';
import { IndexerService } from '../indexer/indexer.service';
import type { LeveragedPosition } from '../indexer/indexer.types';
import type { TaskResult } from '../keeper/keeper.types';
import { PtbBuilderService } from '../sui/ptb-builder.service';
import { SuiService } from '../sui/sui.service';

type OracleState = {
  is_settled?: boolean;
  status?: string;
};

@Injectable()
export class SettlementService {
  private readonly logger = new Logger(SettlementService.name);

  constructor(
    private readonly indexer: IndexerService,
    private readonly sui: SuiService,
    private readonly ptb: PtbBuilderService,
  ) {}

  async run(limit: number): Promise<TaskResult[]> {
    const readiness = this.sui.getTaskReadiness();
    if (!readiness.tasks.settlement) {
      return [
        {
          kind: 'settlement',
          target: '-',
          success: false,
          error: 'keeper_not_configured',
          missing: readiness.missing,
        },
      ];
    }

    const cfg = this.sui.getConfig();
    const now = Date.now();
    const expired = await this.indexer.fetchAllPages((offset, pageSize) =>
      this.indexer.fetchPositions({
        status: 'open',
        maxExpiryMs: now,
        minOpenQuantity: 1,
        hasPredictManager: true,
        limit: pageSize,
        offset,
      }),
    );

    const results: TaskResult[] = [];
    for (const position of expired.slice(0, limit)) {
      const target = `${position.account_id}:${position.position_key}`;
      try {
        const settled = await this.isOracleSettled(position.oracle_id);
        if (settled === 'unreachable') {
          results.push({
            kind: 'settlement',
            target,
            success: false,
            error: 'oracle_state_unreachable',
          });
          continue;
        }
        if (!settled) {
          results.push({
            kind: 'settlement',
            target,
            success: false,
            error: 'oracle_not_settled',
          });
          continue;
        }

        const tx = position.is_range
          ? this.ptb.buildSettleRange(cfg, position)
          : this.ptb.buildSettleBinary(cfg, position);

        if (!(await this.sui.devInspect(tx))) {
          results.push({
            kind: 'settlement',
            target,
            success: false,
            error: 'simulation_failed',
          });
          continue;
        }

        const digest = await this.sui.execute(tx);
        this.logger.log(`settled ${target} digest=${digest}`);
        results.push({ kind: 'settlement', target, success: true, digest });
      } catch (err) {
        const error = logKeeperError(this.logger, `settlement ${target}`, err);
        results.push({ kind: 'settlement', target, success: false, error });
      }
    }
    return results;
  }

  private async isOracleSettled(
    oracleId: string,
  ): Promise<boolean | 'unreachable'> {
    const url = `${this.sui.getConfig().predictServerUrl}/oracles/${oracleId}/state`;
    try {
      const res = await fetch(url);
      if (!res.ok) return false;
      const state = (await res.json()) as OracleState;
      if (state.is_settled === true) return true;
      return String(state.status ?? '').toLowerCase() === 'settled';
    } catch (err) {
      logKeeperWarn(
        this.logger,
        `oracle state fetch failed for ${oracleId}`,
        err,
        { url },
      );
      return 'unreachable';
    }
  }
}

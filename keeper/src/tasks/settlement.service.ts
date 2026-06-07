import { Injectable, Logger } from '@nestjs/common';
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
    const { items } = await this.indexer.fetchPositions({ status: 'open', limit: 500 });
    const expired = items.filter(
      (p) => p.expiry_ms <= now && p.open_quantity > 0 && p.predict_manager_id,
    );

    const results: TaskResult[] = [];
    for (const position of expired.slice(0, limit)) {
      const target = `${position.account_id}:${position.position_key}`;
      try {
        const settled = await this.isOracleSettled(position.oracle_id);
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
        const error = String(err);
        this.logger.warn(`settlement ${target}: ${error}`);
        results.push({ kind: 'settlement', target, success: false, error });
      }
    }
    return results;
  }

  private async isOracleSettled(oracleId: string): Promise<boolean> {
    const url = `${this.sui.getConfig().predictServerUrl}/oracles/${oracleId}/state`;
    const res = await fetch(url);
    if (!res.ok) return false;
    const state = (await res.json()) as OracleState;
    if (state.is_settled === true) return true;
    return String(state.status ?? '').toLowerCase() === 'settled';
  }
}

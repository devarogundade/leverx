import { Injectable, Logger } from '@nestjs/common';
import { LEVERAGED_MINT_WINDOW_MS } from '../config/constants';
import { isFinalHourBeforeExpiry } from '../config/trade-math';
import { formatError } from '../lib/format-error';
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
export class ForceCloseService {
  private readonly logger = new Logger(ForceCloseService.name);

  constructor(
    private readonly indexer: IndexerService,
    private readonly sui: SuiService,
    private readonly ptb: PtbBuilderService,
  ) {}

  /**
   * Two keeper paths for borrowed positions:
   * 1. Final hour before expiry: force-deleverage (redeem → repay → remint 1x)
   * 2. After expiry until oracle settles: force-repay (redeem live → repay, no remint)
   */
  async run(limit: number): Promise<TaskResult[]> {
    const readiness = this.sui.getTaskReadiness();
    if (!readiness.tasks.force_close) {
      return [
        {
          kind: 'force_close',
          target: '-',
          success: false,
          error: 'keeper_not_configured',
          missing: readiness.missing,
        },
      ];
    }

    const cfg = this.sui.getConfig();
    const now = Date.now();
    const results: TaskResult[] = [];
    let remaining = limit;

    const preExpiryCandidates = await this.indexer.fetchAllPages((offset, pageSize) =>
      this.indexer.fetchPositions({
        status: 'open',
        minBorrowQuote: 1,
        maxExpiryMs: now + LEVERAGED_MINT_WINDOW_MS,
        minOpenQuantity: 1,
        hasPredictManager: true,
        limit: pageSize,
        offset,
      }),
    );
    const inForceWindow = preExpiryCandidates.filter((position) =>
      isFinalHourBeforeExpiry(position.expiry_ms, now),
    );

    for (const position of inForceWindow) {
      if (remaining <= 0) break;
      const result = await this.tryForceDeleverage(position, now);
      results.push(result);
      if (result.success) remaining -= 1;
    }

    if (remaining <= 0) return results;

    const postExpiryCandidates = await this.indexer.fetchAllPages((offset, pageSize) =>
      this.indexer.fetchPositions({
        status: 'open',
        minBorrowQuote: 1,
        maxExpiryMs: now,
        minOpenQuantity: 1,
        hasPredictManager: true,
        limit: pageSize,
        offset,
      }),
    );

    for (const position of postExpiryCandidates) {
      if (remaining <= 0) break;
      const result = await this.tryForceRepayPostExpiry(position);
      results.push(result);
      if (result.success) remaining -= 1;
    }

    return results;
  }

  private async tryForceDeleverage(
    position: LeveragedPosition,
    now: number,
  ): Promise<TaskResult> {
    const target = `${position.account_id}:${position.position_key}`;
    const cfg = this.sui.getConfig();

    try {
      if (!isFinalHourBeforeExpiry(position.expiry_ms, now)) {
        return { kind: 'force_close', target, success: false, error: 'outside_force_window' };
      }

      const settled = await this.isOracleSettled(position.oracle_id);
      if (settled === 'unreachable') {
        return { kind: 'force_close', target, success: false, error: 'oracle_state_unreachable' };
      }
      if (settled) {
        return { kind: 'force_close', target, success: false, error: 'oracle_already_settled' };
      }

      const liquidatable = await this.isLiquidatable(position);
      if (liquidatable === null) {
        return { kind: 'force_close', target, success: false, error: 'liquidation_check_unreachable' };
      }
      if (liquidatable) {
        return { kind: 'force_close', target, success: false, error: 'skipped_liquidatable' };
      }

      const tx = position.is_range
        ? this.ptb.buildForceDeleverageRange(cfg, position)
        : this.ptb.buildForceDeleverageBinary(cfg, position);

      if (!(await this.sui.devInspect(tx))) {
        return { kind: 'force_close', target, success: false, error: 'simulation_failed' };
      }

      const digest = await this.sui.execute(tx);
      this.logger.log(`force-deleveraged ${target} digest=${digest}`);
      return { kind: 'force_close', target, success: true, digest };
    } catch (err) {
      const error = String(err);
      this.logger.warn(`force_close ${target}: ${error}`);
      return { kind: 'force_close', target, success: false, error };
    }
  }

  private async tryForceRepayPostExpiry(position: LeveragedPosition): Promise<TaskResult> {
    const target = `${position.account_id}:${position.position_key}`;
    const cfg = this.sui.getConfig();

    try {
      const settled = await this.isOracleSettled(position.oracle_id);
      if (settled === 'unreachable') {
        return { kind: 'force_close', target, success: false, error: 'oracle_state_unreachable' };
      }
      if (settled) {
        return { kind: 'force_close', target, success: false, error: 'oracle_already_settled' };
      }

      const tx = position.is_range
        ? this.ptb.buildForceRepayRangePostExpiry(cfg, position)
        : this.ptb.buildForceRepayBinaryPostExpiry(cfg, position);

      if (!(await this.sui.devInspect(tx))) {
        return { kind: 'force_close', target, success: false, error: 'simulation_failed' };
      }

      const digest = await this.sui.execute(tx);
      this.logger.log(`force-repay post-expiry ${target} digest=${digest}`);
      return { kind: 'force_close', target, success: true, digest };
    } catch (err) {
      const error = String(err);
      this.logger.warn(`force_repay ${target}: ${error}`);
      return { kind: 'force_close', target, success: false, error };
    }
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
      this.logger.warn(
        formatError(`oracle state fetch failed for ${oracleId}`, err, { url }),
      );
      return 'unreachable';
    }
  }

  private async isLiquidatable(
    position: LeveragedPosition,
  ): Promise<boolean | null> {
    const cfg = this.sui.getConfig();
    const tx = this.ptb.buildIsLiquidatable(cfg, position);
    return this.sui.devInspectBool(tx);
  }
}

import { Injectable, Logger } from '@nestjs/common';
import { Transaction } from '@mysten/sui/transactions';
import { FLASH_BORROW_BUFFER_BPS } from '../config/constants';
import {
  flashBorrowAmountForLiquidation,
  hasLiquidationDebt,
} from '../config/trade-math';
import { IndexerService } from '../indexer/indexer.service';
import type { LeveragedPosition } from '../indexer/indexer.types';
import type { TaskResult } from '../keeper/keeper.types';
import { PtbBuilderService } from '../sui/ptb-builder.service';
import { SuiService } from '../sui/sui.service';

@Injectable()
export class LiquidationService {
  private readonly logger = new Logger(LiquidationService.name);

  constructor(
    private readonly indexer: IndexerService,
    private readonly sui: SuiService,
    private readonly ptb: PtbBuilderService,
  ) {}

  async run(limit: number): Promise<TaskResult[]> {
    const cfg = this.sui.getConfig();
    const readiness = this.sui.getTaskReadiness();
    if (!readiness.tasks.liquidation) {
      return [
        {
          kind: 'liquidation',
          target: '-',
          success: false,
          error: 'keeper_not_configured',
          missing: readiness.missing,
        },
      ];
    }

    const candidates = await this.indexer.fetchLiquidationCandidates();
    const results: TaskResult[] = [];

    for (const position of candidates) {
      if (results.filter((r) => r.success).length >= limit) break;

      const target = `${position.account_id}:${position.position_key}`;
      try {
        if (!hasLiquidationDebt(position.borrow_quote, position.margin_quote)) {
          continue;
        }

        const liquidatable = await this.isLiquidatable(position);
        if (liquidatable === null) {
          results.push({
            kind: 'liquidation',
            target,
            success: false,
            error: 'liquidation_check_unreachable',
          });
          continue;
        }
        if (!liquidatable) {
          continue;
        }

        const borrowAmount = flashBorrowAmountForLiquidation(
          position.borrow_quote,
          position.margin_quote,
          FLASH_BORROW_BUFFER_BPS,
        );

        const tx = new Transaction();
        this.ptb.buildLiquidation(tx, cfg, position, borrowAmount);
        if (!(await this.sui.devInspect(tx))) {
          this.logger.warn(
            `liquidation simulation failed ${target} (flash_liquidate abort — redeem may not cover vault debt)`,
          );
          results.push({
            kind: 'liquidation',
            target,
            success: false,
            error: 'simulation_failed',
          });
          continue;
        }

        const digest = await this.sui.execute(tx);
        this.logger.log(`liquidated ${target} digest=${digest}`);
        results.push({ kind: 'liquidation', target, success: true, digest });
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        this.logger.warn(`liquidation failed ${target}: ${message}`);
        results.push({ kind: 'liquidation', target, success: false, error: message });
      }
    }

    return results;
  }

  private async isLiquidatable(
    position: LeveragedPosition,
  ): Promise<boolean | null> {
    const cfg = this.sui.getConfig();
    const tx = this.ptb.buildIsLiquidatable(cfg, position);
    return this.sui.devInspectBool(tx);
  }
}

import { Injectable, Logger } from '@nestjs/common';
import { Transaction } from '@mysten/sui/transactions';
import { FLASH_BORROW_BUFFER_BPS } from '../config/constants';
import { IndexerService } from '../indexer/indexer.service';
import type { LeveragedPosition } from '../indexer/indexer.types';
import type { TaskResult } from '../keeper/keeper.types';
import { PtbBuilderService } from '../sui/ptb-builder.service';
import { SuiService } from '../sui/sui.service';

function flashBorrowAmount(borrowQuote: number | string, bufferBps: number): bigint {
  const principal = BigInt(borrowQuote || 0);
  if (principal === 0n) return 0n;
  return principal + (principal * BigInt(bufferBps)) / 10_000n;
}

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

    const candidates = await this.indexer.fetchAllPages((offset, pageSize) =>
      this.indexer.fetchPositions({
        status: 'all',
        minBorrowQuote: 1,
        hasPredictManager: true,
        excludeStatus: 'liquidated',
        limit: pageSize,
        offset,
      }),
    );

    const results: TaskResult[] = [];
    for (const position of candidates) {
      if (results.filter((r) => r.success).length >= limit) break;

      const target = `${position.account_id}:${position.position_key}`;
      try {
        if (!(await this.isLiquidatable(position))) {
          continue;
        }

        const borrowAmount = flashBorrowAmount(
          position.borrow_quote,
          FLASH_BORROW_BUFFER_BPS,
        );

        const tx = new Transaction();
        this.ptb.buildLiquidation(tx, cfg, position, borrowAmount);
        if (!(await this.sui.devInspect(tx))) {
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

  private async isLiquidatable(position: LeveragedPosition): Promise<boolean> {
    const cfg = this.sui.getConfig();
    const tx = this.ptb.buildIsLiquidatable(cfg, position);
    const result = await this.sui.devInspectBool(tx);
    return result === true;
  }
}

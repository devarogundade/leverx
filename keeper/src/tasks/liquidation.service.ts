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
import { logKeeperError, logKeeperWarn } from '../lib/keeper-log';
import { describeMoveAbort } from '../lib/move-abort';
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

        const openQty = BigInt(position.open_quantity || 0);
        if (openQty === 0n) {
          const writeOff = await this.tryWriteOffFlat(position);
          if (writeOff) {
            results.push(writeOff);
          }
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

        const borrowAmount = await this.resolveFlashBorrowAmount(position);
        const tx = new Transaction();
        this.ptb.buildLiquidation(tx, cfg, position, borrowAmount);
        const simulation = await this.sui.tryDevInspect(tx);
        if (!simulation.ok) {
          const hint =
            describeMoveAbort(simulation.error) ??
            'liquidation PTB simulation failed';
          logKeeperWarn(
            this.logger,
            `liquidation simulation failed ${target} (${hint})`,
          );
          const writeOff = await this.tryWriteOffFlat(position);
          if (writeOff?.success) {
            results.push(writeOff);
            continue;
          }
          results.push({
            kind: 'liquidation',
            target,
            success: false,
            error:
              hint === 'vault idle liquidity too low for flash loan'
                ? 'insufficient_vault_liquidity'
                : 'simulation_failed',
          });
          continue;
        }

        const digest = await this.sui.execute(tx);
        this.logger.log(`liquidated ${target} digest=${digest}`);
        results.push({ kind: 'liquidation', target, success: true, digest });
      } catch (err) {
        const message = logKeeperError(this.logger, `liquidation failed ${target}`, err);
        results.push({ kind: 'liquidation', target, success: false, error: message });
      }
    }

    return results;
  }

  private async resolveFlashBorrowAmount(
    position: LeveragedPosition,
  ): Promise<bigint> {
    const cfg = this.sui.getConfig();
    const quoteTx = this.ptb.buildQuoteLiquidationFlashBorrow(
      cfg,
      position,
      FLASH_BORROW_BUFFER_BPS,
    );
    const quoted = await this.sui.devInspectU64(quoteTx);
    if (quoted != null && quoted > 0n) {
      return quoted;
    }
    return flashBorrowAmountForLiquidation(
      position.borrow_quote,
      position.margin_quote,
      FLASH_BORROW_BUFFER_BPS,
    );
  }

  private async tryWriteOffFlat(
    position: LeveragedPosition,
  ): Promise<TaskResult | null> {
    const target = `${position.account_id}:${position.position_key}`;
    const now = Date.now();
    if (position.expiry_ms > now) {
      return null;
    }
    if (!position.predict_manager_id) {
      return null;
    }

    const cfg = this.sui.getConfig();
    const tx = new Transaction();
    this.ptb.buildWriteOffFlatBorrow(tx, cfg, position);
    if (!(await this.sui.devInspect(tx))) {
      return null;
    }

    try {
      const digest = await this.sui.execute(tx);
      this.logger.log(`bad debt write-off ${target} digest=${digest}`);
      return { kind: 'liquidation', target, success: true, digest };
    } catch (err) {
      const message = logKeeperError(this.logger, `bad debt write-off failed ${target}`, err);
      return {
        kind: 'liquidation',
        target,
        success: false,
        error: message,
      };
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

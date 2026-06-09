import { Injectable, Logger } from '@nestjs/common';
import {
  FLASH_BORROW_BUFFER_BPS,
  LIQUIDATION_SWAP_SLIPPAGE_BPS,
} from '../config/constants';
import {
  flashBorrowAmount,
  hasSpotLiquidationRoute,
  liquidationMinQuoteOut,
  resolveCollateralRoute,
} from '../config/collateral-routing';
import { IndexerService } from '../indexer/indexer.service';
import type { LeveragedPosition } from '../indexer/indexer.types';
import type { CollateralRoute } from '../config/collateral-routing';
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

    const keeper = this.sui.getKeypair()?.getPublicKey().toSuiAddress();
    if (!keeper) {
      return [{ kind: 'liquidation', target: '-', success: false, error: 'missing_signer' }];
    }

    const items = await this.indexer.fetchAllPages((offset, pageSize) =>
      this.indexer.fetchPositions({
        status: 'all',
        minBorrowQuote: 1,
        limit: pageSize,
        offset,
      }),
    );
    const candidates = items.filter(
      (p) =>
        p.borrow_quote > 0 &&
        p.predict_manager_id &&
        p.collateral_asset &&
        p.status !== 'liquidated',
    );

    const results: TaskResult[] = [];
    for (const position of candidates) {
      if (results.filter((r) => r.success).length >= limit) break;

      const target = `${position.account_id}:${position.position_key}`;
      const route = resolveCollateralRoute(cfg, position.collateral_asset);
      if (!route) {
        this.logger.debug(`liquidation skip ${target}: missing Pyth oracle route`);
        continue;
      }

      if (!route.quoteNative && !hasSpotLiquidationRoute(route)) {
        this.logger.debug(
          `liquidation skip ${target}: no spot pool for ${route.coinType}`,
        );
        continue;
      }

      try {
        if (!(await this.isLiquidatable(position, route))) {
          continue;
        }

        const borrowAmount = flashBorrowAmount(
          position.borrow_quote,
          FLASH_BORROW_BUFFER_BPS,
        );
        const minQuoteOut = route.quoteNative
          ? 0n
          : liquidationMinQuoteOut(borrowAmount, LIQUIDATION_SWAP_SLIPPAGE_BPS);

        const tx = this.ptb.buildLiquidation(
          cfg,
          position,
          route,
          borrowAmount,
          minQuoteOut,
          keeper,
        );
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
        const error = String(err);
        this.logger.warn(`liquidation ${target}: ${error}`);
        results.push({ kind: 'liquidation', target, success: false, error });
      }
    }
    return results;
  }

  private async isLiquidatable(
    position: LeveragedPosition,
    route: CollateralRoute,
  ): Promise<boolean> {
    const cfg = this.sui.getConfig();
    const tx = this.ptb.buildIsLiquidatable(cfg, position, route);
    const liquidatable = await this.sui.devInspectBool(tx);
    return liquidatable === true;
  }
}

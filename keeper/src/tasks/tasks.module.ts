import { Module } from '@nestjs/common';
import { IndexerModule } from '../indexer/indexer.module';
import { SuiModule } from '../sui/sui.module';
import { KeeperOrchestratorService } from './keeper-orchestrator.service';
import { KeeperScheduler } from './keeper.scheduler';
import { LimitOrderService } from './limit-order.service';
import { LiquidationService } from './liquidation.service';
import { ForceCloseService } from './force-close.service';
import { SettlementService } from './settlement.service';
import { TriggerService } from './trigger.service';

@Module({
  imports: [IndexerModule, SuiModule],
  providers: [
    SettlementService,
    LimitOrderService,
    LiquidationService,
    TriggerService,
    ForceCloseService,
    KeeperOrchestratorService,
    KeeperScheduler,
  ],
  exports: [KeeperOrchestratorService],
})
export class TasksModule {}

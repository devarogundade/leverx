import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { IndexerModule } from '../indexer/indexer.module';
import { QueueModule } from '../queue/queue.module';
import { SuiModule } from '../sui/sui.module';
import { TelegramModule } from '../telegram/telegram.module';
import { KeeperOrchestratorService } from './keeper-orchestrator.service';
import { KeeperTaskProcessor } from './keeper-task.processor';
import { KeeperTaskScheduler } from './keeper-task.scheduler';
import { KEEPER_TASKS_QUEUE } from './keeper-tasks.constants';
import { LimitOrderService } from './limit-order.service';
import { LiquidationService } from './liquidation.service';
import { ForceCloseService } from './force-close.service';
import { TriggerService } from './trigger.service';

@Module({
  imports: [
    IndexerModule,
    SuiModule,
    TelegramModule,
    QueueModule,
    BullModule.registerQueue({ name: KEEPER_TASKS_QUEUE }),
  ],
  providers: [
    LimitOrderService,
    LiquidationService,
    TriggerService,
    ForceCloseService,
    KeeperOrchestratorService,
    KeeperTaskScheduler,
    KeeperTaskProcessor,
  ],
  exports: [KeeperOrchestratorService],
})
export class TasksModule {}

import { Module } from '@nestjs/common';
import { IndexerModule } from '../src/indexer/indexer.module';
import { SuiModule } from '../src/sui/sui.module';
import { TelegramNotificationQueueService } from '../src/telegram/telegram-notification.queue.service';
import { ForceCloseService } from '../src/tasks/force-close.service';
import { KeeperOrchestratorService } from '../src/tasks/keeper-orchestrator.service';
import { LimitOrderService } from '../src/tasks/limit-order.service';
import { LiquidationService } from '../src/tasks/liquidation.service';
import { TriggerService } from '../src/tasks/trigger.service';

const noopTelegramQueue: Pick<
  TelegramNotificationQueueService,
  'isEnabled' | 'enqueueTaskResults' | 'enqueueLiquidationScan'
> = {
  isEnabled: () => false,
  enqueueTaskResults: async () => {},
  enqueueLiquidationScan: async () => {},
};

/** Tasks without BullMQ — e2e tests do not require Redis. */
@Module({
  imports: [IndexerModule, SuiModule],
  providers: [
    LimitOrderService,
    LiquidationService,
    TriggerService,
    ForceCloseService,
    KeeperOrchestratorService,
    {
      provide: TelegramNotificationQueueService,
      useValue: noopTelegramQueue,
    },
  ],
  exports: [KeeperOrchestratorService],
})
export class TasksModuleWithoutQueue {}

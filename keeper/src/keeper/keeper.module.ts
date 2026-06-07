import { Module } from '@nestjs/common';
import { IndexerModule } from '../indexer/indexer.module';
import { SuiModule } from '../sui/sui.module';
import { TasksModule } from '../tasks/tasks.module';
import { HealthController } from './health.controller';
import { HealthService } from './health.service';
import { KeeperController } from './keeper.controller';

@Module({
  imports: [IndexerModule, SuiModule, TasksModule],
  controllers: [KeeperController, HealthController],
  providers: [HealthService],
  exports: [HealthService],
})
export class KeeperModule {}

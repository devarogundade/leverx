import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { AppConfigModule } from './config/config.module';
import { IndexerModule } from './indexer/indexer.module';
import { KeeperModule } from './keeper/keeper.module';
import { SuiModule } from './sui/sui.module';
import { TasksModule } from './tasks/tasks.module';

@Module({
  imports: [
    AppConfigModule,
    ScheduleModule.forRoot(),
    IndexerModule,
    SuiModule,
    TasksModule,
    KeeperModule,
  ],
})
export class AppModule {}

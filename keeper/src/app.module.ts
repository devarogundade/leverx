import { Module } from '@nestjs/common';
import { AppConfigModule } from './config/config.module';
import { AuthModule } from './auth/auth.module';
import { DatabaseModule } from './database/database.module';
import { IndexerModule } from './indexer/indexer.module';
import { KeeperModule } from './keeper/keeper.module';
import { ManagerModule } from './manager/manager.module';
import { QueueModule } from './queue/queue.module';
import { SuiModule } from './sui/sui.module';
import { TasksModule } from './tasks/tasks.module';
import { TelegramModule } from './telegram/telegram.module';
import { TradeModule } from './trade/trade.module';

@Module({
  imports: [
    AppConfigModule,
    AuthModule,
    DatabaseModule,
    QueueModule,
    IndexerModule,
    SuiModule,
    TasksModule,
    ManagerModule,
    TradeModule,
    TelegramModule,
    KeeperModule,
  ],
})
export class AppModule {}

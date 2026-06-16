import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { DatabaseModule } from '../database/database.module';
import { IndexerModule } from '../indexer/indexer.module';
import { SuiModule } from '../sui/sui.module';
import { SubscriptionService } from './subscription.service';
import { AlertCooldownService } from './alert-cooldown.service';
import { TelegramApiService } from './telegram-api.service';
import { TelegramAuthService } from './telegram-auth.service';
import { TelegramBotService } from './telegram-bot.service';
import { TelegramCommandService } from './telegram-command.service';
import { TelegramController } from './telegram.controller';
import { TelegramMarketsService } from './telegram-markets.service';
import { TelegramTradeService } from './telegram-trade.service';
import { TelegramNotificationProcessor } from './telegram-notification.processor';
import { TelegramNotificationQueueService } from './telegram-notification.queue.service';
import { TelegramNotificationService } from './telegram-notification.service';
import { TELEGRAM_NOTIFICATIONS_QUEUE } from './telegram-notifications.constants';

@Module({
  imports: [
    DatabaseModule,
    IndexerModule,
    SuiModule,
    BullModule.registerQueue({ name: TELEGRAM_NOTIFICATIONS_QUEUE }),
  ],
  controllers: [TelegramController],
  providers: [
    SubscriptionService,
    AlertCooldownService,
    TelegramApiService,
    TelegramAuthService,
    TelegramMarketsService,
    TelegramTradeService,
    TelegramCommandService,
    TelegramBotService,
    TelegramNotificationService,
    TelegramNotificationQueueService,
    TelegramNotificationProcessor,
  ],
  exports: [
    TelegramBotService,
    TelegramNotificationService,
    TelegramNotificationQueueService,
    SubscriptionService,
  ],
})
export class TelegramModule {}

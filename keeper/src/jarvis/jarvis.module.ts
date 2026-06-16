import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { DatabaseModule } from '../database/database.module';
import { IndexerModule } from '../indexer/indexer.module';
import { SuiModule } from '../sui/sui.module';
import { TelegramMarketsService } from '../telegram/telegram-markets.service';
import { JARVIS_QUEUE } from './jarvis.constants';
import { JarvisAiService } from './jarvis-ai.service';
import { JarvisController } from './jarvis.controller';
import { JarvisDataService } from './jarvis-data.service';
import { JarvisGateway } from './jarvis.gateway';
import { JarvisProcessor, JarvisScheduler } from './jarvis.processor';
import { JarvisService } from './jarvis.service';
import { JarvisTradeService } from './jarvis-trade.service';

@Module({
  imports: [
    DatabaseModule,
    IndexerModule,
    SuiModule,
    BullModule.registerQueue({ name: JARVIS_QUEUE }),
  ],
  controllers: [JarvisController],
  providers: [
    JarvisDataService,
    JarvisAiService,
    JarvisTradeService,
    JarvisService,
    JarvisProcessor,
    JarvisScheduler,
    JarvisGateway,
    TelegramMarketsService,
  ],
  exports: [JarvisService],
})
export class JarvisModule {}

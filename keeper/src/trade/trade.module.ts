import { Module } from '@nestjs/common';
import { IndexerModule } from '../indexer/indexer.module';
import { SuiModule } from '../sui/sui.module';
import { TradeController } from './trade.controller';
import { TradeReplayStore } from './trade-replay.store';
import { TradeService } from './trade.service';

@Module({
  imports: [SuiModule, IndexerModule],
  controllers: [TradeController],
  providers: [TradeService, TradeReplayStore],
})
export class TradeModule {}

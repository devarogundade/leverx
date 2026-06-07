import { Module } from '@nestjs/common';
import { IndexerProxyController } from './indexer-proxy.controller';
import { IndexerService } from './indexer.service';

@Module({
  controllers: [IndexerProxyController],
  providers: [IndexerService],
  exports: [IndexerService],
})
export class IndexerModule {}

import { Module } from '@nestjs/common';
import { IndexerModule } from '../indexer/indexer.module';
import { EnokiSponsorService } from './enoki-sponsor.service';
import { PredictQuoteService } from './predict-quote.service';
import { PtbBuilderService } from './ptb-builder.service';
import { SuiService } from './sui.service';

@Module({
  imports: [IndexerModule],
  providers: [SuiService, PtbBuilderService, PredictQuoteService, EnokiSponsorService],
  exports: [SuiService, PtbBuilderService, PredictQuoteService, EnokiSponsorService],
})
export class SuiModule {}

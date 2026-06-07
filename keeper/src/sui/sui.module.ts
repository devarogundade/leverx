import { Module } from '@nestjs/common';
import { PtbBuilderService } from './ptb-builder.service';
import { SuiService } from './sui.service';

@Module({
  providers: [SuiService, PtbBuilderService],
  exports: [SuiService, PtbBuilderService],
})
export class SuiModule {}

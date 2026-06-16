import { Module } from '@nestjs/common';
import { SuiModule } from '../sui/sui.module';
import { GasController } from './gas.controller';
import { GasService } from './gas.service';

@Module({
  imports: [SuiModule],
  controllers: [GasController],
  providers: [GasService],
})
export class GasModule {}

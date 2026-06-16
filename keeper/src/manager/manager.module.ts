import { Module } from '@nestjs/common';
import { DatabaseModule } from '../database/database.module';
import { IndexerModule } from '../indexer/indexer.module';
import { SuiModule } from '../sui/sui.module';
import { ManagerController } from './manager.controller';
import { ManagerService } from './manager.service';
import { UserManagerRepository } from './user-manager.repository';

@Module({
  imports: [DatabaseModule, SuiModule, IndexerModule],
  controllers: [ManagerController],
  providers: [ManagerService, UserManagerRepository],
  exports: [ManagerService],
})
export class ManagerModule {}

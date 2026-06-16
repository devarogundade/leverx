import { Controller, Get, Post, Query, UseGuards } from '@nestjs/common';
import { KeeperAdminGuard } from '../auth/keeper-api-key.guard';
import {
  KeeperOrchestratorService,
  type KeeperTaskKind,
} from '../tasks/keeper-orchestrator.service';
import { HealthService } from './health.service';

@Controller('keeper')
export class KeeperController {
  constructor(
    private readonly orchestrator: KeeperOrchestratorService,
    private readonly health: HealthService,
  ) {}

  @Get('status')
  async status() {
    const report = await this.health.readiness();
    return {
      ...report,
      running: report.orchestratorRunning,
    };
  }

  @Post('run')
  @UseGuards(KeeperAdminGuard)
  run(@Query('task') task?: string) {
    const kind = (task ?? 'all') as KeeperTaskKind;
    return this.orchestrator.run(kind);
  }
}

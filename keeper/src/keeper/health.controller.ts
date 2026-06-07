import {
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  ServiceUnavailableException,
} from '@nestjs/common';
import { HealthService } from './health.service';

@Controller()
export class HealthController {
  constructor(private readonly health: HealthService) {}

  /** Process liveness — always 200 when the Nest app is running. */
  @Get('health')
  @HttpCode(HttpStatus.OK)
  liveness() {
    return this.health.liveness();
  }

  /** Readiness — 200 when signer, RPC, indexer, and core config are ready for keeper tasks. */
  @Get('health/ready')
  async readiness() {
    const report = await this.health.readiness();
    if (!report.ok) {
      throw new ServiceUnavailableException(report);
    }
    return report;
  }

  /** Detailed status without failing HTTP status (for dashboards / ops). */
  @Get('health/status')
  async status() {
    return this.health.readiness();
  }
}

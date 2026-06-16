import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { logKeeperError } from '../lib/keeper-log';
import type { KeeperTaskKind } from './keeper-orchestrator.service';
import { KeeperOrchestratorService } from './keeper-orchestrator.service';
import { KEEPER_TASKS_QUEUE } from './keeper-tasks.constants';

type KeeperTaskJobData = {
  kind: Exclude<KeeperTaskKind, 'all'>;
};

@Processor(KEEPER_TASKS_QUEUE)
export class KeeperTaskProcessor extends WorkerHost {
  private readonly logger = new Logger(KeeperTaskProcessor.name);

  constructor(private readonly orchestrator: KeeperOrchestratorService) {
    super();
  }

  async process(job: Job<KeeperTaskJobData>): Promise<void> {
    const kind = job.data.kind;
    try {
      await this.orchestrator.run(kind);
    } catch (err) {
      logKeeperError(this.logger, `job "${kind}" failed`, err);
      throw err;
    }
  }
}

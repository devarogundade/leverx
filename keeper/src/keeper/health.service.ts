import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { CollateralCatalogEntry } from '../config/collateral-catalog';
import type { KeeperConfig } from '../config/keeper.config';
import { IndexerService } from '../indexer/indexer.service';
import { KeeperOrchestratorService } from '../tasks/keeper-orchestrator.service';
import { SuiService } from '../sui/sui.service';

export type KeeperTaskKind =
  | 'settlement'
  | 'limit_order'
  | 'liquidation'
  | 'trigger';

export const KEEPER_CONTRACT_CALLS: Record<KeeperTaskKind, string[]> = {
  settlement: [
    'trade::settle_expired_proxy_position',
    'trade::settle_expired_proxy_range',
  ],
  limit_order: [
    'trade::execute_binary_limit_mint_order',
    'trade::execute_range_limit_mint_order',
  ],
  liquidation: [
    'deepbook_flash::borrow_flash_loan_quote',
    'liquidation::flash_liquidate_with_spot_swap_and_redeem',
    'deepbook_flash::return_flash_loan_quote',
  ],
  trigger: [
    'trade::leveraged_redeem_binary_market',
    'trade::leveraged_redeem_range_market',
  ],
};

export type HealthReport = {
  ok: boolean;
  service: 'keeper';
  enabled: boolean;
  orchestratorRunning: boolean;
  signer: string | null;
  txReady: boolean;
  rpcOk: boolean;
  chain: string | null;
  indexer: { ok: boolean; service?: string };
  tasks: Record<KeeperTaskKind, boolean>;
  missing: string[];
  supportedCollaterals: CollateralCatalogEntry[];
  contractCalls: typeof KEEPER_CONTRACT_CALLS;
};

@Injectable()
export class HealthService {
  constructor(
    private readonly sui: SuiService,
    private readonly indexer: IndexerService,
    private readonly orchestrator: KeeperOrchestratorService,
    private readonly config: ConfigService,
  ) {}

  liveness() {
    return {
      ok: true,
      service: 'keeper' as const,
      uptimeSec: Math.floor(process.uptime()),
    };
  }

  async readiness(): Promise<HealthReport> {
    const cfg = this.config.get<KeeperConfig>('keeper')!;
    const taskReadiness = this.sui.getTaskReadiness();
    const indexer = await this.indexer.health();

    let chain: string | null = null;
    let rpcOk = false;
    try {
      chain = await this.sui.getClient().getChainIdentifier();
      rpcOk = true;
    } catch {
      chain = null;
    }

    const signer = this.sui.getKeypair()?.getPublicKey().toSuiAddress() ?? null;
    const ok =
      cfg.enabled &&
      taskReadiness.txReady &&
      rpcOk &&
      indexer.ok &&
      Boolean(signer);

    return {
      ok,
      service: 'keeper',
      enabled: cfg.enabled,
      orchestratorRunning: this.orchestrator.isRunning(),
      signer,
      txReady: taskReadiness.txReady,
      rpcOk,
      chain,
      indexer,
      tasks: taskReadiness.tasks,
      missing: taskReadiness.missing,
      supportedCollaterals: cfg.supportedCollaterals,
      contractCalls: KEEPER_CONTRACT_CALLS,
    };
  }
}

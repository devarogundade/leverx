import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { KeeperConfig } from '../config/keeper.config';
import { logKeeperError } from '../lib/keeper-log';
import { IndexerService } from '../indexer/indexer.service';
import { KeeperOrchestratorService } from '../tasks/keeper-orchestrator.service';
import { SuiService } from '../sui/sui.service';

export type KeeperTaskKind =
  | 'limit_order'
  | 'liquidation'
  | 'trigger'
  | 'force_close';

export const KEEPER_CONTRACT_CALLS: Record<KeeperTaskKind, string[]> = {
  limit_order: [
    'trade::execute_binary_limit_mint_order',
    'trade::execute_range_limit_mint_order',
    'trade::expire_binary_limit_mint_order',
    'trade::expire_range_limit_mint_order',
  ],
  liquidation: [
    'vault_flash::borrow_flash_liquidity',
    'vault_flash::repay_flash_liquidity',
    'liquidation::flash_liquidate_with_redeem_permissionless',
    'liquidation::flash_liquidate_range_with_redeem_permissionless',
    'trade::is_binary_position_liquidatable_with_open_position',
    'trade::is_range_position_liquidatable_with_open_position',
  ],
  trigger: [
    'trade::leveraged_redeem_binary_market',
    'trade::leveraged_redeem_range_market',
    'triggers::get_triggers',
    'triggers::get_range_triggers',
  ],
  force_close: [
    'trade::force_deleverage_binary_at_expiry',
    'trade::force_deleverage_range_at_expiry',
    'trade::force_repay_binary_post_expiry',
    'trade::force_repay_range_post_expiry',
    'trade::is_binary_position_liquidatable_with_open_position',
    'trade::is_range_position_liquidatable_with_open_position',
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
  quoteType: string;
  protocol: {
    tradingPaused: boolean;
    liquidationBps: number | null;
  };
  contractCalls: typeof KEEPER_CONTRACT_CALLS;
};

@Injectable()
export class HealthService {
  private readonly logger = new Logger(HealthService.name);

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
    await this.sui.refreshProtocolState();
    const taskReadiness = this.sui.getTaskReadiness();
    const indexer = await this.indexer.health();

    let chain: string | null = null;
    let rpcOk = false;
    try {
      chain = await this.sui.getClient().getChainIdentifier();
      rpcOk = true;
    } catch (err) {
      logKeeperError(this.logger, 'RPC chain identifier check failed', err);
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
      quoteType: cfg.quoteType,
      protocol: this.sui.getProtocolState(),
      contractCalls: KEEPER_CONTRACT_CALLS,
    };
  }
}

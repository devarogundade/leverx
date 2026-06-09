import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';
import { SuiJsonRpcClient, getJsonRpcFullnodeUrl } from '@mysten/sui/jsonRpc';
import { Transaction } from '@mysten/sui/transactions';
import {
  liquidationRoutesReady,
  resolveQuoteOracleId,
} from '../config/collateral-routing';
import type { KeeperConfig } from '../config/keeper.config';

type ProtocolSettingsResponse = {
  registry_id?: string;
  vault_id?: string | null;
  predict_id?: string | null;
  fee_collector_id?: string | null;
  trading_paused?: boolean;
};

@Injectable()
export class SuiService implements OnModuleInit {
  private readonly logger = new Logger(SuiService.name);
  private client!: SuiJsonRpcClient;
  private keypair: Ed25519Keypair | null = null;
  private readonly cfg: KeeperConfig;
  private runtimeOverrides: Partial<KeeperConfig> = {};
  private tradingPaused = false;

  constructor(config: ConfigService) {
    this.cfg = config.get<KeeperConfig>('keeper')!;
  }

  async onModuleInit() {
    const network = this.cfg.suiNetwork as
      | 'mainnet'
      | 'testnet'
      | 'devnet'
      | 'localnet';
    const url =
      this.cfg.suiRpcUrl || getJsonRpcFullnodeUrl(network);
    this.client = new SuiJsonRpcClient({ url, network });

    if (this.cfg.privateKey) {
      try {
        this.keypair = Ed25519Keypair.fromSecretKey(this.cfg.privateKey);
        this.logger.log(`keeper signer: ${this.keypair.getPublicKey().toSuiAddress()}`);
      } catch (err) {
        this.logger.error(`invalid KEEPER_PRIVATE_KEY: ${String(err)}`);
      }
    } else {
      this.logger.warn('KEEPER_PRIVATE_KEY not set — on-chain tasks will be skipped');
    }

    await this.loadIndexerProtocol();
  }

  private async loadIndexerProtocol(): Promise<void> {
    try {
      const res = await fetch(`${this.cfg.indexerUrl}/v1/protocol`);
      if (!res.ok) return;
      const settings = (await res.json()) as ProtocolSettingsResponse | null;
      if (!settings) return;

      if (settings.registry_id?.trim()) {
        this.runtimeOverrides.registryId = settings.registry_id;
      }
      if (settings.vault_id?.trim()) {
        this.runtimeOverrides.vaultId = settings.vault_id;
      }
      if (settings.fee_collector_id?.trim()) {
        this.runtimeOverrides.feeCollectorId = settings.fee_collector_id;
      }
      if (settings.predict_id?.trim()) {
        this.runtimeOverrides.predictId = settings.predict_id;
      }
      this.tradingPaused = settings.trading_paused === true;

      const merged = this.getConfig();
      this.logger.log(
        `indexer protocol: registry=${merged.registryId || 'unset'} vault=${merged.vaultId || 'unset'} paused=${this.tradingPaused}`,
      );
    } catch (err) {
      this.logger.warn(`indexer protocol load failed: ${String(err)}`);
    }
  }

  isTradingPaused(): boolean {
    return this.tradingPaused;
  }

  async refreshProtocolState(): Promise<void> {
    await this.loadIndexerProtocol();
  }

  getClient(): SuiJsonRpcClient {
    return this.client;
  }

  getKeypair(): Ed25519Keypair | null {
    return this.keypair;
  }

  getConfig(): KeeperConfig {
    const merged = { ...this.cfg, ...this.runtimeOverrides };
    const pythQuoteOracleId = resolveQuoteOracleId(merged);
    if (pythQuoteOracleId && pythQuoteOracleId !== merged.pythQuoteOracleId) {
      return { ...merged, pythQuoteOracleId };
    }
    return merged;
  }

  isReadyForTx(): boolean {
    return this.getTaskReadiness().txReady;
  }

  getTaskReadiness(): {
    txReady: boolean;
    tasks: {
      settlement: boolean;
      limit_order: boolean;
      liquidation: boolean;
      trigger: boolean;
    };
    missing: string[];
  } {
    const missing: string[] = [];
    const cfg = this.getConfig();
    const require = (key: keyof KeeperConfig, label: string) => {
      const value = cfg[key];
      if (!value || (typeof value === 'string' && !value.trim())) {
        missing.push(label);
        return false;
      }
      return true;
    };

    if (!this.keypair) missing.push('KEEPER_PRIVATE_KEY');

    const core =
      require('packageId', 'packageId') &&
      require('registryId', 'registryId') &&
      require('vaultId', 'vaultId') &&
      require('feeCollectorId', 'feeCollectorId') &&
      require('predictId', 'predictId') &&
      require('predictPackageId', 'predictPackageId') &&
      require('quoteType', 'quoteType');

    const settlement = core;
    const trigger = core;

    const quoteOracleId = resolveQuoteOracleId(cfg);
    if (!quoteOracleId) {
      missing.push('PYTH_QUOTE_ORACLE_ID');
    }
    const hasQuoteOracle = Boolean(quoteOracleId);
    const hasCatalogRoutes = liquidationRoutesReady(cfg);
    if (!hasCatalogRoutes) {
      missing.push(
        'LAUNCH_COLLATERAL_CATALOG (pythOracleId per asset; spotPoolId + deepCoinId for non-quote collateral)',
      );
    }

    const limit_order = core && hasQuoteOracle && hasCatalogRoutes;

    const liquidation = core && hasQuoteOracle && hasCatalogRoutes;

    const txReady = settlement && Boolean(this.keypair);

    return {
      txReady,
      tasks: {
        settlement,
        limit_order,
        liquidation,
        trigger,
      },
      missing,
    };
  }

  async devInspectBool(tx: Transaction, sender?: string): Promise<boolean | null> {
    const address = sender ?? this.keypair?.getPublicKey().toSuiAddress();
    if (!address) return null;

    const result = await this.client.devInspectTransactionBlock({
      transactionBlock: tx,
      sender: address,
    });
    if (result.effects?.status?.status !== 'success') {
      return null;
    }

    const returnValues = result.results?.at(-1)?.returnValues;
    const first = returnValues?.[0];
    if (!first) return null;

    const [bytes] = first;
    return Buffer.from(bytes).readUInt8(0) === 1;
  }

  async devInspect(tx: Transaction, sender?: string): Promise<boolean> {
    const address = sender ?? this.keypair?.getPublicKey().toSuiAddress();
    if (!address) return false;

    const result = await this.client.devInspectTransactionBlock({
      transactionBlock: tx,
      sender: address,
    });
    const status = result.effects?.status?.status;
    if (status !== 'success') {
      const err =
        result.error ??
        result.effects?.status?.error ??
        JSON.stringify(result.effects?.status);
      this.logger.debug(`devInspect failed: ${err}`);
      return false;
    }
    return true;
  }

  async execute(tx: Transaction): Promise<string> {
    if (!this.keypair) {
      throw new Error('keeper signer not configured');
    }
    tx.setSender(this.keypair.getPublicKey().toSuiAddress());

    const bytes = await tx.build({ client: this.client });
    const result = await this.client.signAndExecuteTransaction({
      transaction: bytes,
      signer: this.keypair,
      options: { showEffects: true },
    });

    const status = result.effects?.status?.status;
    if (status !== 'success') {
      throw new Error(
        result.effects?.status?.error ?? 'transaction failed',
      );
    }
    return result.digest;
  }
}

import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';
import { SuiJsonRpcClient, getJsonRpcFullnodeUrl } from '@mysten/sui/jsonRpc';
import { Transaction } from '@mysten/sui/transactions';
import type { KeeperConfig } from '../config/keeper.config';
import {
  DEFAULT_FINAL_WINDOW_MS,
  MAX_FINAL_WINDOW_MS,
  MAX_LIQUIDATION_BPS,
  MIN_FINAL_WINDOW_MS,
  READONLY_DEVINSPECT_SENDER,
} from '../config/constants';
import { logKeeperError, logKeeperWarn } from '../lib/keeper-log';
import { EnokiSponsorService } from './enoki-sponsor.service';
import { keeperAllowedMoveCallTargets } from './move-targets';
import { PtbBuilderService } from './ptb-builder.service';

export type ExecuteOptions = {
  /** Extra transfer recipients to allow when gas is sponsored via Enoki. */
  allowedAddresses?: string[];
};

@Injectable()
export class SuiService implements OnModuleInit {
  private readonly logger = new Logger(SuiService.name);
  private client!: SuiJsonRpcClient;
  private keypair: Ed25519Keypair | null = null;
  private readonly cfg: KeeperConfig;
  private runtimeOverrides: Partial<KeeperConfig> = {};
  private tradingPaused = false;
  private liquidationBps: number | null = null;
  private finalWindowMs: number = DEFAULT_FINAL_WINDOW_MS;
  private keeperAddress: string | null = null;

  constructor(
    config: ConfigService,
    private readonly enoki: EnokiSponsorService,
    private readonly ptb: PtbBuilderService,
  ) {
    this.cfg = config.get<KeeperConfig>('keeper')!;
  }

  async onModuleInit() {
    const network = this.cfg.suiNetwork as
      | 'mainnet'
      | 'testnet'
      | 'devnet'
      | 'localnet';
    const url = this.cfg.suiRpcUrl || getJsonRpcFullnodeUrl(network);
    this.client = new SuiJsonRpcClient({ url, network });

    this.logger.log(`indexer: ${this.cfg.indexerUrl}`);

    if (this.cfg.privateKey) {
      try {
        this.keypair = Ed25519Keypair.fromSecretKey(this.cfg.privateKey);
        this.logger.log(
          `keeper signer: ${this.keypair.getPublicKey().toSuiAddress()}`,
        );
      } catch (err) {
        logKeeperError(this.logger, 'invalid KEEPER_PRIVATE_KEY', err);
      }
    } else {
      this.logger.warn(
        'KEEPER_PRIVATE_KEY not set — on-chain tasks will be skipped',
      );
    }

    await this.loadOnChainProtocol();
  }

  private async loadOnChainProtocol(): Promise<void> {
    const cfg = this.getConfig();
    if (!cfg.registryId?.trim() || !cfg.packageId?.trim()) {
      logKeeperWarn(this.logger, 'registry/package unset — skipping on-chain protocol load');
      return;
    }

    try {
      const pausedTx = this.ptb.buildReadRegistryBool(cfg, 'trading_paused');
      const liquidationTx = this.ptb.buildReadRegistryU64(cfg, 'liquidation_bps');
      const windowTx = this.ptb.buildReadRegistryU64(cfg, 'final_window_ms');
      const keeperTx = this.ptb.buildReadKeeperAddress(cfg);

      const [paused, liquidationRaw, windowRaw, keeper] = await Promise.all([
        this.devInspectBool(pausedTx),
        this.devInspectU64(liquidationTx),
        this.devInspectU64(windowTx),
        this.devInspectAddress(keeperTx),
      ]);

      if (paused !== null) {
        this.tradingPaused = paused;
      }

      if (liquidationRaw !== null) {
        this.liquidationBps = Math.min(Number(liquidationRaw), MAX_LIQUIDATION_BPS);
      }

      if (windowRaw !== null) {
        this.finalWindowMs = Math.min(
          MAX_FINAL_WINDOW_MS,
          Math.max(MIN_FINAL_WINDOW_MS, Number(windowRaw)),
        );
      }

      this.keeperAddress =
        keeper && keeper !== '0x0' && !/^0x0+$/i.test(keeper) ? keeper : null;

      const merged = this.getConfig();
      this.logger.log(
        `on-chain protocol: package=${merged.packageId || 'unset'} registry=${merged.registryId || 'unset'} vault=${merged.vaultId || 'unset'} paused=${this.tradingPaused} liquidation_bps=${this.liquidationBps ?? 'unset'} final_window_ms=${this.finalWindowMs} keeper=${this.keeperAddress ?? 'unset'}`,
      );
    } catch (err) {
      logKeeperError(this.logger, 'on-chain protocol load failed', err);
    }
  }

  isTradingPaused(): boolean {
    return this.tradingPaused;
  }

  getLiquidationBps(): number | null {
    return this.liquidationBps;
  }

  getFinalWindowMs(): number {
    return this.finalWindowMs;
  }

  getProtocolState(): {
    tradingPaused: boolean;
    liquidationBps: number | null;
    finalWindowMs: number;
  } {
    return {
      tradingPaused: this.tradingPaused,
      liquidationBps: this.liquidationBps,
      finalWindowMs: this.finalWindowMs,
    };
  }

  async refreshProtocolState(): Promise<void> {
    await this.loadOnChainProtocol();
  }

  getClient(): SuiJsonRpcClient {
    return this.client;
  }

  getKeypair(): Ed25519Keypair | null {
    return this.keypair;
  }

  getKeeperAddress(): string | null {
    return this.keeperAddress;
  }

  private devInspectSender(explicit?: string): string {
    return (
      explicit ??
      this.keypair?.getPublicKey().toSuiAddress() ??
      READONLY_DEVINSPECT_SENDER
    );
  }

  async getCreatedObjectIdFromDigest(
    digest: string,
    typeFragment: string,
  ): Promise<string | null> {
    const tx = await this.client.waitForTransaction({
      digest,
      options: { showObjectChanges: true },
    });
    for (const change of tx.objectChanges ?? []) {
      if (
        change.type === 'created' &&
        change.objectType?.includes(typeFragment) &&
        'objectId' in change
      ) {
        return change.objectId;
      }
    }
    return null;
  }

  getConfig(): KeeperConfig {
    return { ...this.cfg, ...this.runtimeOverrides };
  }

  isReadyForTx(): boolean {
    return this.getTaskReadiness().txReady;
  }

  getTaskReadiness(): {
    txReady: boolean;
    tasks: {
      limit_order: boolean;
      liquidation: boolean;
      trigger: boolean;
      force_close: boolean;
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

    const limit_order =
      require('packageId', 'packageId') && Boolean(this.keypair);
    const trigger = core;
    const liquidation = core;
    const force_close = core;

    const txReady = core && Boolean(this.keypair);

    return {
      txReady,
      tasks: {
        limit_order,
        liquidation,
        trigger,
        force_close,
      },
      missing,
    };
  }

  /** Read a Move `address` return value from the last PTB command. */
  async devInspectAddress(
    tx: Transaction,
    sender?: string,
  ): Promise<string | null> {
    const address = this.devInspectSender(sender);

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
    if (bytes.length < 32) return null;
    return `0x${Buffer.from(bytes).toString('hex')}`;
  }

  /** Read a Move `ID` return value from the last PTB command. */
  async devInspectId(tx: Transaction, sender?: string): Promise<string | null> {
    return this.devInspectAddress(tx, sender);
  }

  async devInspectBool(
    tx: Transaction,
    sender?: string,
  ): Promise<boolean | null> {
    const address = this.devInspectSender(sender);

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

  /** Read a Move `u64` return value from the last PTB command. */
  async devInspectU64(
    tx: Transaction,
    sender?: string,
  ): Promise<bigint | null> {
    const address = this.devInspectSender(sender);

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
    if (bytes.length < 8) return null;
    return Buffer.from(bytes).readBigUInt64LE(0);
  }

  /** Read a Move `(u64, u64)` return tuple from the last PTB command. */
  async devInspectU64Pair(
    tx: Transaction,
    sender?: string,
  ): Promise<[bigint, bigint] | null> {
    const address = this.devInspectSender(sender);

    const result = await this.client.devInspectTransactionBlock({
      transactionBlock: tx,
      sender: address,
    });
    if (result.effects?.status?.status !== 'success') {
      return null;
    }

    const returnValues = result.results?.at(-1)?.returnValues;
    if (!returnValues || returnValues.length < 2) return null;

    const readU64 = (index: number): bigint | null => {
      const entry = returnValues[index];
      if (!entry) return null;
      const [bytes] = entry;
      if (bytes.length < 8) return null;
      return Buffer.from(bytes).readBigUInt64LE(0);
    };

    const first = readU64(0);
    const second = readU64(1);
    if (first === null || second === null) return null;
    return [first, second];
  }

  /** Read a Move `(u64, u64, u64, u64)` return tuple from the last PTB command. */
  async devInspectU64Quad(
    tx: Transaction,
    sender?: string,
  ): Promise<[bigint, bigint, bigint, bigint] | null> {
    const address = this.devInspectSender(sender);

    const result = await this.client.devInspectTransactionBlock({
      transactionBlock: tx,
      sender: address,
    });
    if (result.effects?.status?.status !== 'success') {
      return null;
    }

    const returnValues = result.results?.at(-1)?.returnValues;
    if (!returnValues || returnValues.length < 4) return null;

    const readU64 = (index: number): bigint | null => {
      const entry = returnValues[index];
      if (!entry) return null;
      const [bytes] = entry;
      if (bytes.length < 8) return null;
      return Buffer.from(bytes).readBigUInt64LE(0);
    };

    const a = readU64(0);
    const b = readU64(1);
    const c = readU64(2);
    const d = readU64(3);
    if (a === null || b === null || c === null || d === null) return null;
    return [a, b, c, d];
  }

  async devInspect(tx: Transaction, sender?: string): Promise<boolean> {
    const address = this.devInspectSender(sender);

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
      logKeeperWarn(this.logger, `devInspect failed: ${err}`);
      return false;
    }
    return true;
  }

  async execute(tx: Transaction, options?: ExecuteOptions): Promise<string> {
    if (!this.keypair) {
      throw new Error('keeper signer not configured');
    }
    const sender = this.keypair.getPublicKey().toSuiAddress();
    tx.setSender(sender);

    // Enoki sponsors gas while the keeper still signs (sender stays the keeper,
    // so every on-chain owner/keeper/executor auth gate is preserved).
    if (this.enoki.isEnabled()) {
      return this.enoki.sponsorAndExecute({
        tx,
        sender,
        signer: this.keypair,
        client: this.client,
        allowedMoveCallTargets: keeperAllowedMoveCallTargets(this.getConfig()),
        allowedAddresses: options?.allowedAddresses,
      });
    }

    const bytes = await tx.build({ client: this.client });
    const result = await this.client.signAndExecuteTransaction({
      transaction: bytes,
      signer: this.keypair,
      options: { showEffects: true },
    });

    const status = result.effects?.status?.status;
    if (status !== 'success') {
      throw new Error(result.effects?.status?.error ?? 'transaction failed');
    }
    return result.digest;
  }
}

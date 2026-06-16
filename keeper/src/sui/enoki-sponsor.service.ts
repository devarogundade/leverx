import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EnokiClient } from '@mysten/enoki';
import type { Signer } from '@mysten/sui/cryptography';
import type { SuiJsonRpcClient } from '@mysten/sui/jsonRpc';
import { Transaction } from '@mysten/sui/transactions';
import { fromBase64, toBase64 } from '@mysten/sui/utils';
import type { KeeperConfig } from '../config/keeper.config';
import { logKeeperError } from '../lib/keeper-log';
import { userEnokiAllowedMoveCallTargets } from './enoki-move-targets';

type EnokiNetwork = 'mainnet' | 'testnet' | 'devnet';

export type SponsorParams = {
  tx: Transaction;
  /** Keeper address — stays the on-chain `ctx.sender()` so auth gates pass. */
  sender: string;
  /** Keeper Ed25519 signer — signs the sponsored bytes. */
  signer: Signer;
  client: SuiJsonRpcClient;
  /** Restrict the move calls the sponsor will pay for. */
  allowedMoveCallTargets?: string[];
  /** Restrict transfer recipients (e.g. the user wallet for a manager withdraw). */
  allowedAddresses?: string[];
};

/**
 * Wraps Enoki gas sponsorship around the keeper Ed25519 signer.
 *
 * The keeper still signs as the keeper, so `ctx.sender()` remains the keeper
 * address and every on-chain owner/keeper/executor auth gate is preserved.
 * Enoki only pays the gas, so the keeper does not need to hold SUI.
 *
 * Disabled (and the caller falls back to self-paid execution) when
 * `ENOKI_SECRET_KEY` is unset.
 */
@Injectable()
export class EnokiSponsorService implements OnModuleInit {
  private readonly logger = new Logger(EnokiSponsorService.name);
  private readonly cfg: KeeperConfig;
  private enoki: EnokiClient | null = null;

  constructor(config: ConfigService) {
    this.cfg = config.get<KeeperConfig>('keeper')!;
  }

  onModuleInit(): void {
    const secret = this.cfg.enokiSecretKey?.trim();
    if (!secret) {
      this.logger.log(
        'ENOKI_SECRET_KEY not set — keeper uses self-paid gas (keeper wallet must hold SUI)',
      );
      return;
    }
    try {
      this.enoki = new EnokiClient({ apiKey: secret });
      this.logger.log(
        `Enoki gas sponsorship enabled (network=${this.network()})`,
      );
    } catch (err) {
      logKeeperError(this.logger, 'failed to init EnokiClient', err);
      this.enoki = null;
    }
  }

  isEnabled(): boolean {
    return this.enoki !== null;
  }

  private network(): EnokiNetwork {
    const raw = (this.cfg.enokiNetwork || this.cfg.suiNetwork || 'testnet')
      .trim()
      .toLowerCase();
    if (raw === 'mainnet' || raw === 'devnet') return raw;
    return 'testnet';
  }

  /**
   * Sponsor, sign (as keeper), and execute a transaction via Enoki.
   * Returns the on-chain digest. Throws if sponsorship is not enabled.
   */
  async sponsorAndExecute(params: SponsorParams): Promise<string> {
    const enoki = this.enoki;
    if (!enoki) {
      throw new Error('enoki_not_configured');
    }

    // Serialize only the programmable transaction kind — Enoki adds gas data.
    const kindBytes = await params.tx.build({
      client: params.client,
      onlyTransactionKind: true,
    });

    const sponsored = await enoki.createSponsoredTransaction({
      network: this.network(),
      transactionKindBytes: toBase64(kindBytes),
      sender: params.sender,
      allowedMoveCallTargets: params.allowedMoveCallTargets,
      allowedAddresses: params.allowedAddresses,
    });

    // Keeper signs the fully-formed sponsored bytes (sender stays the keeper).
    const { signature } = await params.signer.signTransaction(
      fromBase64(sponsored.bytes),
    );

    const executed = await enoki.executeSponsoredTransaction({
      digest: sponsored.digest,
      signature,
    });

    return executed.digest;
  }

  /** Move targets passed to Enoki for user zkLogin sponsorship. */
  userAllowedMoveCallTargets(): string[] {
    return userEnokiAllowedMoveCallTargets(
      this.cfg.packageId,
      this.cfg.predictPackageId,
    );
  }

  /** Transfer recipients Enoki may allow when sponsoring a user PTB. */
  userAllowedAddresses(sender: string): string[] {
    const ids = [
      sender,
      this.cfg.vaultId,
      this.cfg.registryId,
      this.cfg.feeCollectorId,
      this.cfg.predictId,
    ];
    return [...new Set(ids.map((id) => id.trim()).filter(Boolean))];
  }

  /**
   * First step of user gas sponsorship — Enoki adds gas; user signs `bytes`.
   * Requires `ENOKI_SECRET_KEY` (private Enoki API key).
   */
  async createUserSponsoredTransaction(params: {
    sender: string;
    transactionKindBytes: string;
  }): Promise<{ bytes: string; digest: string }> {
    const enoki = this.enoki;
    if (!enoki) {
      throw new Error('enoki_not_configured');
    }

    return enoki.createSponsoredTransaction({
      network: this.network(),
      transactionKindBytes: params.transactionKindBytes,
      sender: params.sender,
      allowedMoveCallTargets: this.userAllowedMoveCallTargets(),
      allowedAddresses: this.userAllowedAddresses(params.sender),
    });
  }

  /** Second step — submit the user signature after they sign sponsored bytes. */
  async executeUserSponsoredTransaction(params: {
    digest: string;
    signature: string;
  }): Promise<{ digest: string }> {
    const enoki = this.enoki;
    if (!enoki) {
      throw new Error('enoki_not_configured');
    }

    return enoki.executeSponsoredTransaction({
      digest: params.digest,
      signature: params.signature,
    });
  }
}

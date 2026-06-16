import {
  BadRequestException,
  Injectable,
  Logger,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { Transaction } from '@mysten/sui/transactions';
import { IndexerService } from '../indexer/indexer.service';
import { logKeeperError } from '../lib/keeper-log';
import { PtbBuilderService } from '../sui/ptb-builder.service';
import { SuiService } from '../sui/sui.service';
import { verifyManagerCreateAuth } from './manager-auth';
import { UserManagerRepository } from './user-manager.repository';
import type { CreateManagerBody, ManagerResponse } from './manager.types';

const ADDRESS_RE = /^0x[a-fA-F0-9]{64}$/;

@Injectable()
export class ManagerService {
  private readonly logger = new Logger(ManagerService.name);
  private readonly creationLocks = new Map<string, Promise<ManagerResponse>>();

  constructor(
    private readonly sui: SuiService,
    private readonly ptb: PtbBuilderService,
    private readonly indexer: IndexerService,
    private readonly managers: UserManagerRepository,
  ) {}

  async getManager(userAddress: string): Promise<ManagerResponse> {
    const address = this.parseAddress(userAddress);
    const managerId = await this.resolveManagerId(address);
    return { address, manager_id: managerId };
  }

  async createOrGetManager(body: CreateManagerBody): Promise<ManagerResponse> {
    const address = this.parseAddress(body.address);
    const existing = await this.resolveManagerId(address);
    if (existing) {
      return { address, manager_id: existing, created: false };
    }

    try {
      await verifyManagerCreateAuth(body);
    } catch (err) {
      if (err instanceof UnauthorizedException) throw err;
      const code = err instanceof Error ? err.message : 'invalid_auth';
      throw new BadRequestException(code);
    }

    const inflight = this.creationLocks.get(address);
    if (inflight) return inflight;

    const work = this.createManagerForAddress(address);
    this.creationLocks.set(address, work);
    try {
      return await work;
    } finally {
      this.creationLocks.delete(address);
    }
  }

  private async createManagerForAddress(address: string): Promise<ManagerResponse> {
    const existing = await this.resolveManagerId(address);
    if (existing) {
      return { address, manager_id: existing, created: false };
    }

    this.assertKeeperReady();
    const cfg = this.sui.getConfig();
    const tx = new Transaction();
    this.ptb.buildCreatePredictManager(tx, cfg);

    try {
      const digest = await this.sui.execute(tx);
      const managerId = await this.sui.getCreatedObjectIdFromDigest(
        digest,
        'predict_manager::PredictManager',
      );
      if (!managerId) {
        throw new Error('PredictManager object not found in transaction effects');
      }

      await this.managers.set({
        user_address: address,
        manager_id: managerId,
        created_at_ms: Date.now(),
      });

      this.logger.log(`created manager ${managerId} for ${address} digest=${digest}`);
      return { address, manager_id: managerId, created: true };
    } catch (err) {
      logKeeperError(this.logger, `create manager failed for ${address}`, err);
      throw new ServiceUnavailableException('manager_creation_failed');
    }
  }

  private parseAddress(raw: string): string {
    const address = raw?.trim();
    if (!address || !ADDRESS_RE.test(address)) {
      throw new BadRequestException('invalid_address');
    }
    return address.toLowerCase();
  }

  private assertKeeperReady(): void {
    const readiness = this.sui.getTaskReadiness();
    if (!readiness.txReady) {
      throw new ServiceUnavailableException({
        error: 'keeper_not_configured',
        missing: readiness.missing,
      });
    }
    const signer = this.sui.getKeypair()?.getPublicKey().toSuiAddress();
    const onChainKeeper = this.sui.getKeeperAddress();
    if (onChainKeeper && signer && onChainKeeper.toLowerCase() !== signer.toLowerCase()) {
      throw new ServiceUnavailableException('keeper_signer_mismatch');
    }
  }

  private async resolveManagerId(userAddress: string): Promise<string | null> {
    const stored = await this.managers.get(userAddress);
    if (stored?.manager_id) {
      return stored.manager_id;
    }

    try {
      const { items } = await this.indexer.fetchAccounts({
        owner: userAddress,
        limit: 5,
      });
      const managerId = items.find((row) => row.predict_manager_id)?.predict_manager_id;
      if (managerId) {
        await this.managers.set({
          user_address: userAddress,
          manager_id: managerId,
          created_at_ms: Date.now(),
        });
        return managerId;
      }
    } catch (err) {
      logKeeperError(this.logger, `indexer lookup failed for ${userAddress}`, err);
    }

    return null;
  }
}

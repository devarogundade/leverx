import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { UserManagerEntity } from '../database/entities/user-manager.entity';
import type { UserManagerRecord } from '../manager/manager.types';

const OBJECT_ID_RE = /^0x[a-f0-9]{64}$/;

@Injectable()
export class UserManagerRepository {
  constructor(
    @InjectRepository(UserManagerEntity)
    private readonly repo: Repository<UserManagerEntity>,
  ) {}

  async get(userAddress: string): Promise<UserManagerRecord | undefined> {
    const row = await this.repo.findOne({
      where: { user_address: normalizeAddress(userAddress) },
    });
    if (!row) return undefined;
    return toRecord(row);
  }

  async set(record: UserManagerRecord): Promise<void> {
    const userAddress = normalizeAddress(record.user_address);
    const managerId = record.manager_id?.trim().toLowerCase();
    if (!managerId || !isValidObjectId(managerId)) return;

    await this.repo.save(
      this.repo.create({
        user_address: userAddress,
        manager_id: managerId,
        updated_at_ms: String(Date.now()),
      }),
    );
  }
}

function toRecord(row: UserManagerEntity): UserManagerRecord {
  return {
    user_address: row.user_address,
    manager_id: row.manager_id,
    created_at_ms: row.updated_at_ms ? Number(row.updated_at_ms) : Date.now(),
  };
}

function normalizeAddress(address: string): string {
  return address.trim().toLowerCase();
}

function isValidObjectId(id: string): boolean {
  return OBJECT_ID_RE.test(id.trim().toLowerCase());
}

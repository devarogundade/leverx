import {
  BadRequestException,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';
import { EnokiClientError } from '@mysten/enoki';
import { EnokiSponsorService } from '../sui/enoki-sponsor.service';
import type {
  GasExecuteBody,
  GasExecuteResponse,
  GasSponsorBody,
  GasSponsorResponse,
} from './gas.types';

const ADDRESS_RE = /^0x[a-fA-F0-9]{64}$/;
const DIGEST_RE = /^[A-Za-z0-9+/=_-]{20,128}$/;
const MAX_KIND_BYTES_B64 = 512_000;

@Injectable()
export class GasService {
  constructor(private readonly enoki: EnokiSponsorService) {}

  async sponsor(body: GasSponsorBody): Promise<GasSponsorResponse> {
    const sender = this.parseAddress(body.sender);
    const transactionKindBytes = this.parseKindBytes(body.transactionKindBytes);

    if (!this.enoki.isEnabled()) {
      throw new ServiceUnavailableException('enoki_not_configured');
    }

    try {
      return await this.enoki.createUserSponsoredTransaction({
        sender,
        transactionKindBytes,
      });
    } catch (err) {
      throw this.mapEnokiError(err);
    }
  }

  async execute(body: GasExecuteBody): Promise<GasExecuteResponse> {
    const digest = this.parseDigest(body.digest);
    const signature = this.parseSignature(body.signature);

    if (!this.enoki.isEnabled()) {
      throw new ServiceUnavailableException('enoki_not_configured');
    }

    try {
      return await this.enoki.executeUserSponsoredTransaction({
        digest,
        signature,
      });
    } catch (err) {
      throw this.mapEnokiError(err);
    }
  }

  private parseAddress(raw: unknown): string {
    if (typeof raw !== 'string' || !ADDRESS_RE.test(raw.trim())) {
      throw new BadRequestException('invalid_address');
    }
    return raw.trim();
  }

  private parseKindBytes(raw: unknown): string {
    if (typeof raw !== 'string') {
      throw new BadRequestException('invalid_transaction_kind_bytes');
    }
    const value = raw.trim();
    if (!value || value.length > MAX_KIND_BYTES_B64) {
      throw new BadRequestException('invalid_transaction_kind_bytes');
    }
    try {
      Buffer.from(value, 'base64');
    } catch {
      throw new BadRequestException('invalid_transaction_kind_bytes');
    }
    return value;
  }

  private parseDigest(raw: unknown): string {
    if (typeof raw !== 'string') {
      throw new BadRequestException('invalid_digest');
    }
    const value = raw.trim();
    if (!value || !DIGEST_RE.test(value)) {
      throw new BadRequestException('invalid_digest');
    }
    return value;
  }

  private parseSignature(raw: unknown): string {
    if (typeof raw !== 'string') {
      throw new BadRequestException('invalid_signature');
    }
    const value = raw.trim();
    if (!value || value.length > 2048) {
      throw new BadRequestException('invalid_signature');
    }
    return value;
  }

  private mapEnokiError(err: unknown): Error {
    if (err instanceof BadRequestException) throw err;
    if (err instanceof ServiceUnavailableException) throw err;
    if (err instanceof Error && err.message === 'enoki_not_configured') {
      return new ServiceUnavailableException('enoki_not_configured');
    }
    if (err instanceof EnokiClientError) {
      const detail = err.errors[0]?.message?.trim() || 'enoki_sponsor_failed';
      return new BadRequestException(detail);
    }
    return err instanceof Error ? err : new BadRequestException('enoki_sponsor_failed');
  }
}

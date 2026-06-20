import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHmac, timingSafeEqual } from 'node:crypto';
import type { KeeperConfig } from '../config/keeper.config';
import type { AppAuthResponse } from './app-auth.types';

export const APP_JWT_TTL_SEC = 3 * 24 * 60 * 60;

type JwtClaims = {
  sub: string;
  exp: number;
  iat: number;
};

@Injectable()
export class AppJwtService {
  private readonly secret: string;

  constructor(private readonly config: ConfigService) {
    const keeper = this.config.get<KeeperConfig>('keeper');
    const configured = keeper?.appJwtSecret?.trim();
    const fallback = keeper?.privateKey?.trim();
    this.secret = configured || (fallback ? `leverx-app-jwt:${fallback}` : '');
    if (!this.secret) {
      throw new Error('KEEPER_APP_JWT_SECRET or KEEPER_PRIVATE_KEY is required for app JWT auth');
    }
  }

  issue(address: string): AppAuthResponse {
    const normalized = address.trim().toLowerCase();
    const nowSec = Math.floor(Date.now() / 1000);
    const token = this.sign({
      sub: normalized,
      iat: nowSec,
      exp: nowSec + APP_JWT_TTL_SEC,
    });
    return { token, expiresIn: APP_JWT_TTL_SEC };
  }

  verifyAddress(token: string, expectedAddress: string): void {
    const claims = this.verify(token);
    const expected = expectedAddress.trim().toLowerCase();
    if (claims.sub !== expected) {
      throw new UnauthorizedException('address_mismatch');
    }
  }

  private verify(token: string): JwtClaims {
    const trimmed = token?.trim();
    if (!trimmed) {
      throw new UnauthorizedException('invalid_token');
    }

    const parts = trimmed.split('.');
    if (parts.length !== 3) {
      throw new UnauthorizedException('invalid_token');
    }

    const [headerPart, payloadPart, signaturePart] = parts;
    const signingInput = `${headerPart}.${payloadPart}`;
    const expectedSig = createHmac('sha256', this.secret)
      .update(signingInput)
      .digest('base64url');

    const actualBuf = Buffer.from(signaturePart, 'base64url');
    const expectedBuf = Buffer.from(expectedSig, 'base64url');
    if (
      actualBuf.length !== expectedBuf.length ||
      !timingSafeEqual(actualBuf, expectedBuf)
    ) {
      throw new UnauthorizedException('invalid_token');
    }

    let payload: JwtClaims;
    try {
      payload = JSON.parse(
        Buffer.from(payloadPart, 'base64url').toString('utf8'),
      ) as JwtClaims;
    } catch {
      throw new UnauthorizedException('invalid_token');
    }

    if (!payload.sub || !/^0x[a-f0-9]{64}$/.test(payload.sub)) {
      throw new UnauthorizedException('invalid_token');
    }

    const nowSec = Math.floor(Date.now() / 1000);
    if (!Number.isFinite(payload.exp) || payload.exp <= nowSec) {
      throw new UnauthorizedException('token_expired');
    }

    return payload;
  }

  private sign(claims: JwtClaims): string {
    const header = this.base64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
    const payload = this.base64url(JSON.stringify(claims));
    const signingInput = `${header}.${payload}`;
    const signature = createHmac('sha256', this.secret)
      .update(signingInput)
      .digest('base64url');
    return `${signingInput}.${signature}`;
  }

  private base64url(value: string): string {
    return Buffer.from(value, 'utf8').toString('base64url');
  }
}

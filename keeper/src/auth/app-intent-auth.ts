import { BadRequestException, UnauthorizedException } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { fromBase64 } from '@mysten/sui/utils';
import type { AppAuthPayload, IntentAuthResult } from './app-auth.types';
import { AppJwtService } from './app-jwt.service';

const ADDRESS_RE = /^0x[a-f0-9]{64}$/;

export type SignedIntentPayload = {
  address: string;
  expires_at_ms: number;
  message_bytes: string;
  signature: string;
};

type IntentWithAddress = {
  address: string;
  expiresAtMs: number;
};

export function intentReplayKey(payload: AppAuthPayload): string {
  if (payload.signature?.trim()) {
    return payload.signature.trim();
  }
  const digest = createHash('sha256')
    .update(`${payload.address.trim().toLowerCase()}\n${payload.message_bytes.trim()}`)
    .digest('hex');
  return `token:${digest}`;
}

export function parseIntentMessage<T extends IntentWithAddress>(
  payload: AppAuthPayload,
  parseMessage: (bytes: Uint8Array) => T,
  assertExpiry: (expiresAtMs: number) => void,
): T {
  const claimedAddress = payload.address?.trim().toLowerCase();
  if (!claimedAddress || !ADDRESS_RE.test(claimedAddress)) {
    throw new Error('invalid_address');
  }

  if (
    payload.expires_at_ms === undefined ||
    !Number.isFinite(payload.expires_at_ms) ||
    !Number.isInteger(payload.expires_at_ms)
  ) {
    throw new Error('invalid_expires_at_ms');
  }

  if (!payload.message_bytes?.trim()) {
    throw new Error('missing_message_bytes');
  }

  let messageBytes: Uint8Array;
  try {
    messageBytes = fromBase64(payload.message_bytes);
  } catch {
    throw new Error('invalid_message_bytes');
  }

  const parsed = parseMessage(messageBytes);
  if (parsed.address !== claimedAddress) {
    throw new Error('address_mismatch');
  }
  if (parsed.expiresAtMs !== payload.expires_at_ms) {
    throw new Error('expiry_mismatch');
  }

  assertExpiry(parsed.expiresAtMs);
  return parsed;
}

export async function resolveIntentAuth<T extends IntentWithAddress>(params: {
  payload: AppAuthPayload;
  bearerToken?: string;
  parseMessage: (bytes: Uint8Array) => T;
  assertExpiry: (expiresAtMs: number) => void;
  verifySigned: (
    payload: SignedIntentPayload,
    network: string,
  ) => Promise<T>;
  jwt: AppJwtService;
  network: string;
}): Promise<IntentAuthResult<T>> {
  const inlineToken = params.payload.token?.trim();
  const bearerToken = params.bearerToken?.trim();
  const token = inlineToken || bearerToken;

  if (token) {
    params.jwt.verifyAddress(token, params.payload.address);
    try {
      const intent = parseIntentMessage(
        params.payload,
        params.parseMessage,
        params.assertExpiry,
      );
      return { intent, authMethod: 'token' };
    } catch (err) {
      if (err instanceof UnauthorizedException) throw err;
      const code = err instanceof Error ? err.message : 'invalid_auth';
      throw new BadRequestException(code);
    }
  }

  if (!params.payload.signature?.trim()) {
    throw new BadRequestException('missing_auth');
  }

  try {
    const intent = await params.verifySigned(
      params.payload as SignedIntentPayload,
      params.network,
    );
    return { intent, authMethod: 'signed' };
  } catch (err) {
    if (err instanceof UnauthorizedException) throw err;
    const code = err instanceof Error ? err.message : 'invalid_auth';
    throw new BadRequestException(code);
  }
}

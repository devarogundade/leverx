import { UnauthorizedException } from '@nestjs/common';
import { fromBase64 } from '@mysten/sui/utils';
import { verifyIntentPersonalMessageSignature } from '../sui/verify-intent-signature';
import {
  assertManagerIntentExpiry,
  parseManagerCreateMessage,
  type ManagerCreateIntentFields,
} from './manager-message';

export type SignedManagerCreatePayload = {
  address: string;
  expires_at_ms: number;
  message_bytes: string;
  signature: string;
};

const ADDRESS_RE = /^0x[a-f0-9]{64}$/;

export async function verifyManagerCreateAuth(
  payload: SignedManagerCreatePayload,
  network = 'testnet',
): Promise<ManagerCreateIntentFields> {
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

  if (!payload.message_bytes?.trim() || !payload.signature?.trim()) {
    throw new Error('missing_signature');
  }

  let messageBytes: Uint8Array;
  try {
    messageBytes = fromBase64(payload.message_bytes);
  } catch {
    throw new Error('invalid_message_bytes');
  }

  const parsed = parseManagerCreateMessage(messageBytes);
  if (parsed.address !== claimedAddress) {
    throw new Error('address_mismatch');
  }
  if (parsed.expiresAtMs !== payload.expires_at_ms) {
    throw new Error('expiry_mismatch');
  }

  assertManagerIntentExpiry(parsed.expiresAtMs);

  try {
    await verifyIntentPersonalMessageSignature(
      messageBytes,
      payload.signature,
      claimedAddress,
      network,
    );
  } catch {
    throw new UnauthorizedException('invalid_signature');
  }

  return parsed;
}

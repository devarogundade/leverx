import { UnauthorizedException } from '@nestjs/common';
import { verifyPersonalMessageSignature } from '@mysten/sui/verify';
import { fromBase64 } from '@mysten/sui/utils';
import {
  assertTradeIntentExpiry,
  parseMintIntentMessage,
  parseRedeemIntentMessage,
  parseSettleIntentMessage,
  type MintIntentFields,
  type RedeemIntentFields,
  type SettleIntentFields,
} from './trade-message';

export type SignedTradeIntentPayload = {
  address: string;
  expires_at_ms: number;
  message_bytes: string;
  signature: string;
};

const ADDRESS_RE = /^0x[a-f0-9]{64}$/;

type AnyIntentFields = MintIntentFields | RedeemIntentFields | SettleIntentFields;

async function verifySignedIntent(
  payload: SignedTradeIntentPayload,
  parseMessage: (bytes: Uint8Array) => AnyIntentFields,
): Promise<AnyIntentFields> {
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

  const parsed = parseMessage(messageBytes);
  if (parsed.address !== claimedAddress) {
    throw new Error('address_mismatch');
  }
  if (parsed.expiresAtMs !== payload.expires_at_ms) {
    throw new Error('expiry_mismatch');
  }

  assertTradeIntentExpiry(parsed.expiresAtMs);

  try {
    await verifyPersonalMessageSignature(messageBytes, payload.signature, {
      address: claimedAddress,
    });
  } catch {
    throw new UnauthorizedException('invalid_signature');
  }

  return parsed;
}

export async function verifyMintIntentAuth(
  payload: SignedTradeIntentPayload,
): Promise<MintIntentFields> {
  return (await verifySignedIntent(payload, parseMintIntentMessage)) as MintIntentFields;
}

export async function verifyRedeemIntentAuth(
  payload: SignedTradeIntentPayload,
): Promise<RedeemIntentFields> {
  return (await verifySignedIntent(
    payload,
    parseRedeemIntentMessage,
  )) as RedeemIntentFields;
}

export async function verifySettleIntentAuth(
  payload: SignedTradeIntentPayload,
): Promise<SettleIntentFields> {
  return (await verifySignedIntent(
    payload,
    parseSettleIntentMessage,
  )) as SettleIntentFields;
}

export const MANAGER_CREATE_MESSAGE_PREFIX = 'leverx:manager:create:v1';

/** Max lifetime from signing time to expiry embedded in the message. */
export const MANAGER_MAX_TTL_MS = 5 * 60_000;

/** Allow wallets slightly ahead of keeper clock. */
export const MANAGER_CLOCK_SKEW_MS = 30_000;

export type ManagerCreateIntentFields = {
  address: string;
  expiresAtMs: number;
};

function parseKeyValueMessage(bytes: Uint8Array): Record<string, string> {
  const text = new TextDecoder().decode(bytes);
  const lines = text.split('\n');
  if (lines[0] !== MANAGER_CREATE_MESSAGE_PREFIX) {
    throw new Error('invalid_message_prefix');
  }

  const fields: Record<string, string> = {};
  for (const line of lines.slice(1)) {
    const eq = line.indexOf('=');
    if (eq <= 0) continue;
    fields[line.slice(0, eq)] = line.slice(eq + 1);
  }
  return fields;
}

function parseAddressField(fields: Record<string, string>, key: string): string {
  const value = fields[key]?.trim().toLowerCase();
  if (!value || !/^0x[a-f0-9]{64}$/.test(value)) {
    throw new Error(`invalid_${key}`);
  }
  return value;
}

function parseNumberField(fields: Record<string, string>, key: string): number {
  const raw = fields[key];
  const value = raw === undefined ? NaN : Number(raw);
  if (!Number.isFinite(value) || value < 0 || !Number.isInteger(value)) {
    throw new Error(`invalid_${key}`);
  }
  return value;
}

export function buildManagerCreateMessage(fields: ManagerCreateIntentFields): Uint8Array {
  const lines = [
    MANAGER_CREATE_MESSAGE_PREFIX,
    `address=${fields.address.trim().toLowerCase()}`,
    `expires_ms=${fields.expiresAtMs}`,
  ];
  return new TextEncoder().encode(lines.join('\n'));
}

export function parseManagerCreateMessage(bytes: Uint8Array): ManagerCreateIntentFields {
  const fields = parseKeyValueMessage(bytes);
  return {
    address: parseAddressField(fields, 'address'),
    expiresAtMs: parseNumberField(fields, 'expires_ms'),
  };
}

export function assertManagerIntentExpiry(
  expiresAtMs: number,
  nowMs = Date.now(),
): void {
  if (expiresAtMs < nowMs - MANAGER_CLOCK_SKEW_MS) {
    throw new Error('message_expired');
  }
  if (expiresAtMs > nowMs + MANAGER_MAX_TTL_MS + MANAGER_CLOCK_SKEW_MS) {
    throw new Error('message_expiry_too_far');
  }
}

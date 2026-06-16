import {
  assertManagerIntentExpiry,
  buildManagerCreateMessage,
  parseManagerCreateMessage,
} from './manager-message';

describe('manager-message', () => {
  const address = '0x' + 'a'.repeat(64);
  const nowMs = 1_700_000_000_000;

  it('round-trips create manager intent fields', () => {
    const fields = { address, expiresAtMs: nowMs + 60_000 };
    const parsed = parseManagerCreateMessage(buildManagerCreateMessage(fields));
    expect(parsed).toEqual(fields);
  });

  it('rejects expired intents', () => {
    expect(() => assertManagerIntentExpiry(nowMs - 60_000, nowMs)).toThrow('message_expired');
  });

  it('rejects intents with excessive ttl', () => {
    expect(() => assertManagerIntentExpiry(nowMs + 10 * 60_000, nowMs)).toThrow(
      'message_expiry_too_far',
    );
  });
});

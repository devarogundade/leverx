import {
  assertTradeIntentExpiry,
  buildMintIntentMessage,
  parseMintIntentMessage,
} from './trade-message';

describe('trade-message', () => {
  const address = '0x' + 'b'.repeat(64);
  const nowMs = 1_700_000_000_000;

  const baseMint = {
    address,
    accountId: '0x' + 'c'.repeat(64),
    predictManagerId: '0x' + 'd'.repeat(64),
    oracleId: '0x' + 'e'.repeat(64),
    expiryMs: nowMs + 86_400_000,
    strike: 100_000,
    higherStrike: 0,
    isUp: true,
    isRange: false,
    expiresAtMs: nowMs + 60_000,
    marginQuoteAtoms: 1_000_000n,
    leverageBps: 10_000n,
    quantity: 5n,
    maxMintCost: 2_000_000n,
    marketSlippageBps: 50,
    remintAfterDeleverage: true,
  };

  it('round-trips mint intent fields', () => {
    const parsed = parseMintIntentMessage(buildMintIntentMessage(baseMint));
    expect(parsed).toEqual(baseMint);
  });

  it('rejects tampered prefix', () => {
    const bytes = buildMintIntentMessage(baseMint);
    bytes[0] = bytes[0]! + 1;
    expect(() => parseMintIntentMessage(bytes)).toThrow('invalid_message_prefix');
  });

  it('rejects expired intents', () => {
    expect(() => assertTradeIntentExpiry(nowMs - 60_000, nowMs)).toThrow('message_expired');
  });
});

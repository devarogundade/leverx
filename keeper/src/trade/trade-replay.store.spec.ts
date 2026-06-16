import { TradeReplayStore } from './trade-replay.store';

describe('TradeReplayStore', () => {
  it('marks and detects replayed signatures until expiry', () => {
    const store = new TradeReplayStore();
    const sig = 'sig-abc';
    const expiresAt = Date.now() + 60_000;

    expect(store.isReplayed(sig)).toBe(false);
    store.markUsed(sig, expiresAt);
    expect(store.isReplayed(sig)).toBe(true);
  });

  it('forgets signatures after expiry', () => {
    const store = new TradeReplayStore();
    const sig = 'sig-old';
    const nowMs = 1_700_000_000_000;
    store.markUsed(sig, nowMs - 1);
    expect(store.isReplayed(sig, nowMs)).toBe(false);
  });
});

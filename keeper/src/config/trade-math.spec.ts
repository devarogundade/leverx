import {
  computeFinalWindowContext,
  maxLeverageForExpiry,
} from './trade-math';

describe('maxLeverageForExpiry', () => {
  const windowMs = 30 * 60_000; // 30 min
  const expiryMs = 1_000_000_000_000;

  it('returns 1× in the final window period', () => {
    const now = expiryMs - 20 * 60_000; // 20 min left
    expect(maxLeverageForExpiry(expiryMs, now, windowMs)).toBe(1);
  });

  it('returns 2× with two final-window periods remaining', () => {
    const now = expiryMs - 60 * 60_000; // 60 min left
    expect(maxLeverageForExpiry(expiryMs, now, windowMs)).toBe(2);
  });

  it('caps at 10× with many periods remaining', () => {
    const now = expiryMs - 6 * 60 * 60_000; // 6 hours
    expect(maxLeverageForExpiry(expiryMs, now, windowMs)).toBe(10);
  });
});

describe('computeFinalWindowContext', () => {
  it('includes time-graded leverage fields', () => {
    const windowMs = 1_800_000;
    const expiryMs = Date.now() + 90 * 60_000;
    const ctx = computeFinalWindowContext(expiryMs, Date.now(), windowMs);
    expect(ctx.max_leverage_for_time).toBe(3);
    expect(ctx.final_window_periods_remaining).toBe(3);
    expect(ctx.leverage_closes_at_ms).toBe(expiryMs - windowMs);
  });
});

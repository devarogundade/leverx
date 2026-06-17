import { SuiRpcFailover, isSuiRpcRateLimitError } from './sui-rpc-failover';

describe('isSuiRpcRateLimitError', () => {
  it('detects HTTP 429 messages', () => {
    expect(isSuiRpcRateLimitError(new Error('Unexpected status code: 429'))).toBe(true);
    expect(isSuiRpcRateLimitError(new Error('rate limit exceeded'))).toBe(true);
  });

  it('ignores other errors', () => {
    expect(isSuiRpcRateLimitError(new Error('timeout'))).toBe(false);
  });
});

describe('SuiRpcFailover', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('switches to fallback on primary 429 then back after rest', async () => {
    const failover = new SuiRpcFailover({
      network: 'testnet',
      primaryUrl: 'https://primary.example',
      fallbackUrl: 'https://fallback.example/v1/key',
      restMs: 60_000,
    });

    let calls = 0;
    const first = await failover.invoke(async () => {
      calls += 1;
      if (calls === 1) {
        throw new Error('Unexpected status code: 429');
      }
      return 'fallback-ok';
    });

    expect(first).toBe('fallback-ok');
    expect(failover.getState().active).toBe('fallback');

    const second = await failover.invoke(async () => 'still-fallback');
    expect(second).toBe('still-fallback');
    expect(failover.getState().active).toBe('fallback');

    jest.advanceTimersByTime(60_000);

    const third = await failover.invoke(async () => 'primary-ok');
    expect(third).toBe('primary-ok');
    expect(failover.getState().active).toBe('primary');
  });

  it('rethrows when fallback is not configured', async () => {
    const failover = new SuiRpcFailover({
      network: 'testnet',
      primaryUrl: 'https://primary.example',
    });

    await expect(
      failover.invoke(async () => {
        throw new Error('Unexpected status code: 429');
      }),
    ).rejects.toThrow('429');
  });
});

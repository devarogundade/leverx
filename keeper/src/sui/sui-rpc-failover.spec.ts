import {
  RpcRateLimiter,
  SuiRpcFailover,
  isSuiRpcRateLimitError,
} from './sui-rpc-failover';

describe('isSuiRpcRateLimitError', () => {
  it('detects HTTP 429 messages', () => {
    expect(isSuiRpcRateLimitError(new Error('Unexpected status code: 429'))).toBe(
      true,
    );
    expect(isSuiRpcRateLimitError(new Error('rate limit exceeded'))).toBe(true);
  });

  it('ignores other errors', () => {
    expect(isSuiRpcRateLimitError(new Error('timeout'))).toBe(false);
  });
});

describe('RpcRateLimiter', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('spaces calls by min interval', async () => {
    const limiter = new RpcRateLimiter(250);
    const acquire1 = limiter.acquire();
    jest.advanceTimersByTime(100);
    const acquire2 = limiter.acquire();

    await acquire1;
    jest.advanceTimersByTime(150);
    await acquire2;
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
      maxPerSecond: 100,
      maxRetries: 4,
      retryBaseMs: 10,
      retryMaxMs: 50,
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

    jest.advanceTimersByTime(60_000);

    const second = await failover.invoke(async () => 'primary-ok');
    expect(second).toBe('primary-ok');
    expect(failover.getState().active).toBe('primary');
  });

  it('rethrows when fallback is not configured', async () => {
    const failover = new SuiRpcFailover({
      network: 'testnet',
      primaryUrl: 'https://primary.example',
      maxRetries: 1,
    });

    await expect(
      failover.invoke(async () => {
        throw new Error('Unexpected status code: 429');
      }),
    ).rejects.toThrow('429');
  });
});

import {
  isSuiRpcRateLimitError,
  isSuiRpcTransientError,
} from './sui-rpc-errors';

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

describe('isSuiRpcTransientError', () => {
  it('includes rate limits and network failures', () => {
    expect(isSuiRpcTransientError(new Error('rate limit exceeded'))).toBe(true);
    expect(isSuiRpcTransientError(new Error('fetch failed'))).toBe(true);
    expect(isSuiRpcTransientError(new Error('ECONNRESET'))).toBe(true);
  });

  it('ignores validation errors', () => {
    expect(isSuiRpcTransientError(new Error('invalid argument'))).toBe(false);
  });
});

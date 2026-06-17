export function isSuiRpcRateLimitError(err: unknown): boolean {
  const message = String(err ?? '').toLowerCase();
  if (message.includes('429') || message.includes('rate limit')) return true;
  if (message.includes('too many requests')) return true;
  if (err && typeof err === 'object' && 'status' in err) {
    const status = Number((err as { status?: number }).status);
    if (status === 429) return true;
  }
  return false;
}

export function isSuiRpcTransientError(err: unknown): boolean {
  if (isSuiRpcRateLimitError(err)) return true;
  const message = String(err ?? '').toLowerCase();
  if (
    message.includes('econnreset') ||
    message.includes('etimedout') ||
    message.includes('enotfound') ||
    message.includes('fetch failed') ||
    message.includes('socket hang up') ||
    message.includes('network error')
  ) {
    return true;
  }
  if (message.includes('502') || message.includes('503') || message.includes('504')) {
    return true;
  }
  return false;
}

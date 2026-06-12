function formatCause(cause: unknown): string {
  if (cause instanceof Error) {
    const nested =
      cause.cause != null ? ` (cause: ${formatCause(cause.cause)})` : '';
    return `${cause.name}: ${cause.message}${nested}`;
  }
  return String(cause);
}

/** Single-line error for logs — includes optional context and fetch `cause` chains. */
export function formatError(
  context: string,
  err: unknown,
  extra?: Record<string, string | number | boolean | undefined>,
): string {
  const parts: string[] = [context];
  for (const [key, value] of Object.entries(extra ?? {})) {
    if (value !== undefined) parts.push(`${key}=${value}`);
  }
  if (err instanceof Error) {
    parts.push(err.message);
    if (err.cause != null) parts.push(`cause=${formatCause(err.cause)}`);
  } else {
    parts.push(String(err));
  }
  return parts.join(' | ');
}

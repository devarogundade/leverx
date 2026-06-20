/** Extract bearer token from `Authorization: Bearer <token>`. */
export function parseBearerToken(authorization?: string): string | undefined {
  const raw = authorization?.trim();
  if (!raw) return undefined;
  const match = /^Bearer\s+(.+)$/i.exec(raw);
  return match?.[1]?.trim() || undefined;
}

/** Optional auth block returned after a successful signed-message request. */
export type AppAuthResponse = {
  token: string;
  expiresIn: number;
};

/** Request body for keeper routes that accept wallet-signed intents or a session JWT. */
export type AppAuthPayload = {
  address: string;
  expires_at_ms: number;
  message_bytes: string;
  signature?: string;
  token?: string;
};

export type IntentAuthMethod = 'signed' | 'token';

export type IntentAuthResult<T> = {
  intent: T;
  authMethod: IntentAuthMethod;
};

export function withAppAuth<T extends Record<string, unknown>>(
  response: T,
  auth?: AppAuthResponse | null,
): T & { auth?: AppAuthResponse } {
  if (!auth) return response;
  return { ...response, auth };
}

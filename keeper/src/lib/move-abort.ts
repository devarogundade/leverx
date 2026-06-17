import { describeLeverxAbort } from './leverx-abort-messages.js';

/** Human-readable hint from Sui devInspect / execution Move abort strings. */
export function describeMoveAbort(error: string): string | null {
  return describeLeverxAbort(error);
}

/** Prefer a clear on-chain message; fall back to a generic simulation label. */
export function simulationFailureMessage(error: string): string {
  return describeLeverxAbort(error) ?? 'simulation_failed';
}

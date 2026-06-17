import type { ProtocolSettings } from '../indexer/indexer.types';
import {
  DEFAULT_FINAL_WINDOW_MS,
  DEFAULT_LIQUIDATION_BPS,
  MAX_FINAL_WINDOW_MS,
  MAX_LIQUIDATION_BPS,
  MIN_FINAL_WINDOW_MS,
} from './constants';

/** Mirrors app/src/lib/leverx/protocol.ts resolveLiquidationBps. */
export function resolveLiquidationBps(
  settings?: Pick<
    ProtocolSettings,
    'liquidation_bps' | 'effective_liquidation_bps' | 'max_liquidation_bps'
  > | null,
): number {
  const effective = settings?.effective_liquidation_bps;
  if (typeof effective === 'number' && effective > 0) {
    return Math.min(effective, MAX_LIQUIDATION_BPS);
  }
  const bps = settings?.liquidation_bps;
  if (typeof bps === 'number' && bps > 0) {
    return Math.min(bps, MAX_LIQUIDATION_BPS);
  }
  return DEFAULT_LIQUIDATION_BPS;
}

/** Mirrors app/src/lib/leverx/protocol.ts resolveFinalWindowMs. */
export function resolveFinalWindowMs(
  settings?: Pick<
    ProtocolSettings,
    'final_window_ms' | 'effective_final_window_ms' | 'max_final_window_ms'
  > | null,
): number {
  const effective = settings?.effective_final_window_ms;
  if (typeof effective === 'number' && effective > 0) {
    return Math.min(effective, MAX_FINAL_WINDOW_MS);
  }
  const ms = settings?.final_window_ms;
  if (typeof ms === 'number' && ms > 0) {
    return Math.min(ms, MAX_FINAL_WINDOW_MS);
  }
  return DEFAULT_FINAL_WINDOW_MS;
}

export function protocolConfigOverrides(
  protocol: ProtocolSettings,
): Partial<{
  packageId: string;
  registryId: string;
  vaultId: string;
  feeCollectorId: string;
  predictId: string;
  predictPackageId: string;
}> {
  const overrides: Partial<{
    packageId: string;
    registryId: string;
    vaultId: string;
    feeCollectorId: string;
    predictId: string;
    predictPackageId: string;
  }> = {};

  const set = (key: keyof typeof overrides, value: string | null | undefined) => {
    const trimmed = value?.trim();
    if (trimmed) overrides[key] = trimmed;
  };

  set('packageId', protocol.package_id);
  set('registryId', protocol.registry_id);
  set('vaultId', protocol.vault_id);
  set('feeCollectorId', protocol.fee_collector_id);
  set('predictId', protocol.predict_id);
  set('predictPackageId', protocol.predict_package_id);

  return overrides;
}

export function clampFinalWindowMs(ms: number): number {
  return Math.min(MAX_FINAL_WINDOW_MS, Math.max(MIN_FINAL_WINDOW_MS, ms));
}

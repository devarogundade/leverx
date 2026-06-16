/**
 * Jarvis unit conversions — mirrors app/src/lib/predict/scaling.ts and trade-math.
 * All on-chain reads use dev-inspect; human fields are derived for the LLM.
 */

import { DEFAULT_LIQUIDATION_BPS, PREDICT_PRICE_SCALE } from '../config/constants';
import {
  redeemPayoutFromBid,
  minPayoutAfterSlippage,
} from '../config/trade-math';
import type { PositionKeyArgs } from '../keeper/keeper.types';
import type { LeveragedPosition } from '../indexer/indexer.types';
import {
  FLOAT_SCALING,
  QUOTE_UNIT,
  applySlippageBps,
  costFromPremiumPerUnit,
  estimateQuantity,
  leverageMultiplierToBps,
  marginUsdToQuoteAtoms,
} from '../telegram/telegram-trade-math';

function premiumPerUnitFromMintCost(mintCost: bigint, quantity: bigint): bigint {
  if (mintCost <= 0n || quantity <= 0n) return 0n;
  return (mintCost * PREDICT_PRICE_SCALE + quantity - 1n) / quantity;
}

export const JARVIS_REFERENCE_MARGIN_USD = 10;
export const JARVIS_REFERENCE_LEVERAGE = 2;
/** Keeper default partial-repay fraction (~40% of open quantity). */
export const JARVIS_PARTIAL_REPAY_FRACTION_BPS = 4000;
export const HEALTHY_BAND_BUFFER_BPS = 500;

export type HealthLabel = 'healthy' | 'margin_call' | 'at_risk' | 'unknown';

export type OnChainQuotePayload = {
  kind: 'mint' | 'redeem' | 'partial_repay';
  source: 'on_chain_dev_inspect';
  shares_in: string | null;
  shares_out: string | null;
  quote_in_usd: number | null;
  quote_in_atoms: string | null;
  quote_out_usd: number | null;
  quote_out_atoms: string | null;
  price_per_share_cents: number | null;
  price_per_share_raw: string | null;
  slippage_bps: number;
  min_quote_out_usd: number | null;
  min_quote_out_atoms: string | null;
  unit_quote: 'dUSDC';
  unit_shares: 'contracts';
};

export function coerceAtoms(value: unknown): bigint {
  if (value == null) return 0n;
  if (typeof value === 'bigint') return value;
  if (typeof value === 'number' && Number.isFinite(value)) return BigInt(Math.trunc(value));
  if (typeof value === 'string') {
    try {
      return BigInt(value);
    } catch {
      return 0n;
    }
  }
  return 0n;
}

export function scaleQuoteUsd(atoms: bigint | number | string | null | undefined): number {
  const normalized = coerceAtoms(atoms);
  if (normalized <= 0n) return 0;
  return Number(normalized) / Number(QUOTE_UNIT);
}

export function scaleSpotUsd(value: number | undefined | null): number {
  if (value == null || !Number.isFinite(value) || value <= 0) return 0;
  if (value > 1_000_000) return value / Number(FLOAT_SCALING);
  return value;
}

export function strikeRawToUsd(raw: number): number {
  if (!raw || raw <= 0) return 0;
  return raw / Number(FLOAT_SCALING);
}

export function premiumRawToCents(premium: bigint): number {
  return (Number(premium) / Number(FLOAT_SCALING)) * 100;
}

export function resolveHealthLabel(
  healthBps: number | null,
  liquidationBps: number,
): HealthLabel {
  if (healthBps == null) return 'unknown';
  if (healthBps >= liquidationBps + HEALTHY_BAND_BUFFER_BPS) return 'healthy';
  if (healthBps >= liquidationBps) return 'margin_call';
  return 'at_risk';
}

export function buildRedeemQuotePayload(args: {
  kind: 'redeem' | 'partial_repay';
  quantity: bigint;
  bidPerUnit: bigint;
  slippageBps: number;
}): OnChainQuotePayload {
  const expectedPayout = redeemPayoutFromBid(args.bidPerUnit, args.quantity);
  const minPayout = minPayoutAfterSlippage(expectedPayout, args.slippageBps);

  return {
    kind: args.kind,
    source: 'on_chain_dev_inspect',
    shares_in: args.quantity.toString(),
    shares_out: null,
    quote_in_usd: null,
    quote_in_atoms: null,
    quote_out_usd: scaleQuoteUsd(expectedPayout),
    quote_out_atoms: expectedPayout.toString(),
    price_per_share_cents: premiumRawToCents(args.bidPerUnit),
    price_per_share_raw: args.bidPerUnit.toString(),
    slippage_bps: args.slippageBps,
    min_quote_out_usd: scaleQuoteUsd(minPayout),
    min_quote_out_atoms: minPayout.toString(),
    unit_quote: 'dUSDC',
    unit_shares: 'contracts',
  };
}

export function buildMintQuotePayload(args: {
  marginUsd: number;
  leverage: number;
  askPerUnit: bigint;
  quantity: bigint;
  slippageBps: number;
}): OnChainQuotePayload {
  const marginAtoms = marginUsdToQuoteAtoms(args.marginUsd);
  const mintCost = costFromPremiumPerUnit(args.askPerUnit, args.quantity);
  const maxMintCost = applySlippageBps(mintCost, args.slippageBps);

  return {
    kind: 'mint',
    source: 'on_chain_dev_inspect',
    shares_in: null,
    shares_out: args.quantity.toString(),
    quote_in_usd: scaleQuoteUsd(marginAtoms),
    quote_in_atoms: marginAtoms.toString(),
    quote_out_usd: scaleQuoteUsd(mintCost),
    quote_out_atoms: mintCost.toString(),
    price_per_share_cents: premiumRawToCents(args.askPerUnit),
    price_per_share_raw: args.askPerUnit.toString(),
    slippage_bps: args.slippageBps,
    min_quote_out_usd: null,
    min_quote_out_atoms: maxMintCost.toString(),
    unit_quote: 'dUSDC',
    unit_shares: 'contracts',
  };
}

export function positionKeyFromLeveragedPosition(position: LeveragedPosition): PositionKeyArgs {
  return {
    oracleId: position.oracle_id,
    expiryMs: position.expiry_ms,
    strike: position.strike,
    higherStrike: position.higher_strike,
    isUp: position.is_up,
    isRange: position.is_range,
  };
}

export function entryPremiumRaw(position: LeveragedPosition): bigint | null {
  const openQty = coerceAtoms(position.open_quantity);
  const mintCost = coerceAtoms(position.mint_cost);
  if (openQty > 0n && mintCost > 0n) {
    return premiumPerUnitFromMintCost(mintCost, openQty);
  }
  const entryMark = coerceAtoms(position.entry_mark);
  return entryMark > 0n ? entryMark : null;
}

export function closingPremiumRaw(
  position: LeveragedPosition,
  liveBidPerUnit?: bigint | null,
): bigint | null {
  if (liveBidPerUnit && liveBidPerUnit > 0n) return liveBidPerUnit;
  const closingMark = coerceAtoms(position.closing_mark);
  return closingMark > 0n ? closingMark : null;
}

export function computePositionPnl(args: {
  position: LeveragedPosition;
  expectedPayoutAtoms: bigint;
}): { unrealized_pnl_usd: number; unrealized_pnl_pct: number | null } {
  const marginUsd = scaleQuoteUsd(args.position.margin_quote);
  const borrowUsd = scaleQuoteUsd(args.position.borrow_quote);
  const markValueUsd = scaleQuoteUsd(args.expectedPayoutAtoms);
  const netEquityUsd = markValueUsd - borrowUsd;
  const unrealizedPnlUsd = netEquityUsd - marginUsd;
  const basisUsd = marginUsd > 0 ? marginUsd : scaleQuoteUsd(args.position.mint_cost);
  const unrealizedPnlPct =
    basisUsd > 0 ? (unrealizedPnlUsd / basisUsd) * 100 : null;
  return { unrealized_pnl_usd: unrealizedPnlUsd, unrealized_pnl_pct: unrealizedPnlPct };
}

export function computeHealthMetrics(args: {
  position: LeveragedPosition;
  expectedPayoutAtoms: bigint;
  liquidationBps: number;
}): {
  health_bps: number | null;
  health_label: HealthLabel;
  distance_to_liquidation_bps: number | null;
  liquidation_threshold_bps: number;
} {
  const liquidationBps = args.liquidationBps || DEFAULT_LIQUIDATION_BPS;
  const leverageBps = Number(args.position.leverage_bps);
  const marginUsd = scaleQuoteUsd(args.position.margin_quote);
  const borrowUsd = scaleQuoteUsd(args.position.borrow_quote);
  const markValueUsd = scaleQuoteUsd(args.expectedPayoutAtoms);
  const positionSizeUsd = marginUsd + borrowUsd;

  let healthDebtUsd = 0;
  if (leverageBps > 10_000) {
    healthDebtUsd = borrowUsd > 0 ? borrowUsd : marginUsd;
  }

  const healthBps =
    healthDebtUsd > 0
      ? Math.round((markValueUsd / healthDebtUsd) * 10_000)
      : positionSizeUsd > 0
        ? 100_000
        : null;

  const healthLabel = resolveHealthLabel(healthBps, liquidationBps);
  const distanceToLiquidationBps =
    healthBps != null && healthDebtUsd > 0 ? healthBps - liquidationBps : null;

  return {
    health_bps: healthBps,
    health_label: healthLabel,
    distance_to_liquidation_bps: distanceToLiquidationBps,
    liquidation_threshold_bps: liquidationBps,
  };
}

export function estimateMintQuantity(
  marginUsd: number,
  leverage: number,
  askPerUnit: bigint,
): bigint {
  const marginAtoms = marginUsdToQuoteAtoms(marginUsd);
  const leverageBps = leverageMultiplierToBps(leverage);
  return estimateQuantity(marginAtoms, leverageBps, askPerUnit);
}

export { QUOTE_UNIT, FLOAT_SCALING };

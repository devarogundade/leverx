/** Indexer custody / CTA helpers — mirrors app `position-indexer-hints.ts`. */

import type { LeveragedPosition, PositionActionHints } from './indexer.types';

export function positionActionHints(
  position: Pick<LeveragedPosition, 'action_hints'>,
): PositionActionHints | undefined {
  return position.action_hints;
}

export function positionCloseSource(
  position: Pick<LeveragedPosition, 'close_source' | 'action_hints'>,
): string | null {
  return position.close_source ?? position.action_hints?.close_source ?? null;
}

export function positionLeverxCustodyComplete(
  position: Pick<LeveragedPosition, 'leverx_custody_complete' | 'action_hints'>,
): boolean {
  return (
    position.leverx_custody_complete ??
    position.action_hints?.leverx_custody_complete ??
    false
  );
}

export function positionNeedsCustodyRecovery(
  position: Pick<
    LeveragedPosition,
    | 'action_hints'
    | 'close_source'
    | 'leverx_custody_complete'
    | 'external_redeem_payout_quote'
    | 'custody_recovered_quote'
  >,
): boolean {
  const hints = position.action_hints;
  if (hints?.needs_custody_recovery) return true;
  if (positionLeverxCustodyComplete(position)) return false;

  const payout =
    position.external_redeem_payout_quote ??
    hints?.external_redeem_payout_quote ??
    0;
  const recovered =
    position.custody_recovered_quote ?? hints?.custody_recovered_quote ?? 0;
  if (payout > 0 && recovered < payout) return true;

  const source = positionCloseSource(position);
  return source === 'predict_external' || source === 'manager_surplus_recovery';
}

export function positionShowsManageFromIndexer(
  position: Pick<
    LeveragedPosition,
    | 'status'
    | 'borrow_quote'
    | 'action_hints'
    | 'leverx_custody_complete'
    | 'close_surplus_quote'
    | 'close_source'
    | 'external_redeem_payout_quote'
    | 'custody_recovered_quote'
  >,
): boolean {
  if (position.status === 'open') return true;
  if (BigInt(position.borrow_quote || 0) > 0n) return true;
  if (positionNeedsCustodyRecovery(position)) return true;
  if (position.action_hints?.recommended_actions?.includes('withdraw_trading')) {
    return true;
  }
  if (
    positionLeverxCustodyComplete(position) &&
    BigInt(position.close_surplus_quote || 0) > 0n
  ) {
    return true;
  }
  return false;
}

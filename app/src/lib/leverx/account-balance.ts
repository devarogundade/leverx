/** Net account value: wallet + margin + manager pool, minus vault borrow. */
export function computeTotalBalanceUsd(params: {
  walletUsd: number;
  marginUsd: number;
  managerUsd: number;
  borrowedUsd: number;
}): number {
  return params.walletUsd + params.marginUsd + params.managerUsd - params.borrowedUsd;
}

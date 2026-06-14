/** Live contract quote failed or returned no tradable price. */
export function isContractQuotePaused(args: {
  enabled: boolean;
  isPending: boolean;
  isFetching: boolean;
  isError: boolean;
  isFetched: boolean;
  liveAskRaw?: bigint | null;
}): boolean {
  if (!args.enabled) return false;
  if (!args.isFetched && (args.isPending || args.isFetching)) return false;
  if (args.isError) return true;
  if (!args.isFetched) return false;
  return args.liveAskRaw == null || args.liveAskRaw <= 0n;
}

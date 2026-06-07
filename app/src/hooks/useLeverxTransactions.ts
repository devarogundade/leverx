import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useWallet } from "@/context/WalletContext";
import { indexerKeys } from "@/hooks/useIndexer";
import { useIndexerProtocol } from "@/hooks/useIndexer";
import type { LimitMintOrder, LeveragedPosition } from "@/lib/leverx/indexer-client";
import type { MarketKeyArgs } from "@/lib/leverx/market-keys";
import { resolveLeverxProtocol } from "@/lib/leverx/protocol";
import {
  executeCancelLimitOrder,
  executeClearTriggers,
  executeClosePosition,
  executeLinkManager,
  executeOpenTrade,
  executeRegisterExecutor,
  executeRepayDebt,
  executeRevokeExecutor,
  executeSettleExpired,
  executeVaultSupply,
  executeVaultWithdraw,
  type ClosePositionInput,
  type OpenTradeInput,
} from "@/lib/leverx/transactions";

function formatTxError(error: unknown): string {
  if (error instanceof Error) return error.message;
  return "Transaction failed.";
}

export function useLeverxProtocolConfig() {
  const { data: settings } = useIndexerProtocol();
  return resolveLeverxProtocol(settings ?? null);
}

export function useLeverxTransactions(owner?: string) {
  const queryClient = useQueryClient();
  const { client, wallet, account } = useWallet();
  const cfg = useLeverxProtocolConfig();

  const invalidate = async (accountId?: string) => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: indexerKeys.positions(owner) }),
      queryClient.invalidateQueries({ queryKey: indexerKeys.limitOrders(owner) }),
      queryClient.invalidateQueries({ queryKey: indexerKeys.accounts(owner) }),
      queryClient.invalidateQueries({ queryKey: ["wallet-coin-balance"] }),
      queryClient.invalidateQueries({ queryKey: indexerKeys.protocol }),
      queryClient.invalidateQueries({ queryKey: ["leverx-mint-quote"] }),
      queryClient.invalidateQueries({ queryKey: indexerKeys.triggers(accountId) }),
      queryClient.invalidateQueries({ queryKey: indexerKeys.executors(accountId) }),
      queryClient.invalidateQueries({
        queryKey: indexerKeys.collateralBalances(accountId),
      }),
      queryClient.invalidateQueries({ queryKey: indexerKeys.liquidations(owner) }),
    ]);
  };

  const requireReady = () => {
    if (!wallet || !account) {
      throw new Error("Connect your wallet to continue.");
    }
    if (!cfg) {
      throw new Error(
        "LeverX protocol is not fully configured. Set registry, vault, fee collector, and Pyth oracle IDs.",
      );
    }
    return { wallet, account, cfg };
  };

  const openTrade = useMutation({
    mutationFn: async (input: OpenTradeInput) => {
      const ready = requireReady();
      return executeOpenTrade({
        client,
        wallet: ready.wallet,
        account: ready.account,
        cfg: ready.cfg,
        input,
      });
    },
    onSuccess: () => invalidate(),
  });

  const closePosition = useMutation({
    mutationFn: async (input: ClosePositionInput) => {
      const ready = requireReady();
      return executeClosePosition({
        client,
        wallet: ready.wallet,
        account: ready.account,
        cfg: ready.cfg,
        input,
      });
    },
    onSuccess: () => invalidate(),
  });

  const settleExpired = useMutation({
    mutationFn: async (position: LeveragedPosition) => {
      const ready = requireReady();
      return executeSettleExpired({
        client,
        wallet: ready.wallet,
        account: ready.account,
        cfg: ready.cfg,
        position,
      });
    },
    onSuccess: () => invalidate(),
  });

  const repayDebt = useMutation({
    mutationFn: async (args: { position: LeveragedPosition; amountAtoms: bigint }) => {
      const ready = requireReady();
      return executeRepayDebt({
        client,
        wallet: ready.wallet,
        account: ready.account,
        cfg: ready.cfg,
        position: args.position,
        amountAtoms: args.amountAtoms,
      });
    },
    onSuccess: () => invalidate(),
  });

  const clearTriggers = useMutation({
    mutationFn: async (args: { accountId: string; key: MarketKeyArgs }) => {
      const ready = requireReady();
      return executeClearTriggers({
        client,
        wallet: ready.wallet,
        account: ready.account,
        cfg: ready.cfg,
        accountId: args.accountId,
        key: args.key,
      });
    },
    onSuccess: (_, vars) => invalidate(vars.accountId),
  });

  const registerExecutor = useMutation({
    mutationFn: async (args: { accountId: string; executor: string }) => {
      const ready = requireReady();
      return executeRegisterExecutor({
        client,
        wallet: ready.wallet,
        account: ready.account,
        cfg: ready.cfg,
        accountId: args.accountId,
        executor: args.executor,
      });
    },
    onSuccess: (_, vars) => invalidate(vars.accountId),
  });

  const revokeExecutor = useMutation({
    mutationFn: async (args: { accountId: string; executor: string }) => {
      const ready = requireReady();
      return executeRevokeExecutor({
        client,
        wallet: ready.wallet,
        account: ready.account,
        cfg: ready.cfg,
        accountId: args.accountId,
        executor: args.executor,
      });
    },
    onSuccess: (_, vars) => invalidate(vars.accountId),
  });

  const linkManager = useMutation({
    mutationFn: async (args: { accountId: string; managerId: string }) => {
      const ready = requireReady();
      return executeLinkManager({
        client,
        wallet: ready.wallet,
        account: ready.account,
        cfg: ready.cfg,
        accountId: args.accountId,
        managerId: args.managerId,
      });
    },
    onSuccess: (_, vars) => invalidate(vars.accountId),
  });

  const cancelLimitOrder = useMutation({
    mutationFn: async (order: LimitMintOrder) => {
      const ready = requireReady();
      return executeCancelLimitOrder({
        client,
        wallet: ready.wallet,
        account: ready.account,
        cfg: ready.cfg,
        order,
      });
    },
    onSuccess: () => invalidate(),
  });

  const vaultSupply = useMutation({
    mutationFn: async (amountAtoms: bigint) => {
      const ready = requireReady();
      return executeVaultSupply({
        client,
        wallet: ready.wallet,
        account: ready.account,
        cfg: ready.cfg,
        amountAtoms,
      });
    },
    onSuccess: () => invalidate(),
  });

  const vaultWithdraw = useMutation({
    mutationFn: async (lpAmountAtoms: bigint) => {
      const ready = requireReady();
      return executeVaultWithdraw({
        client,
        wallet: ready.wallet,
        account: ready.account,
        cfg: ready.cfg,
        lpAmountAtoms,
      });
    },
    onSuccess: () => invalidate(),
  });

  return {
    cfg,
    isProtocolReady: Boolean(cfg),
    openTrade,
    closePosition,
    settleExpired,
    repayDebt,
    clearTriggers,
    registerExecutor,
    revokeExecutor,
    linkManager,
    cancelLimitOrder,
    vaultSupply,
    vaultWithdraw,
    formatTxError,
  };
}

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo } from "react";
import { useWallet } from "@/context/WalletContext";
import { useIndexerProtocol } from "@/hooks/useIndexer";
import { appConfig } from "@/lib/config";
import { invalidateLeverxQueries } from "@/lib/leverx/invalidate-queries";
import { playSuccessSound, primeSuccessSound } from "@/lib/sounds";
import type { LimitMintOrder, LeveragedPosition } from "@/lib/leverx/indexer-client";
import type { MarketKeyArgs } from "@/lib/leverx/market-keys";
import {
  fetchPackageIdsForProtocol,
  fetchRegistryFields,
} from "@/lib/leverx/package-resolution";
import { resolveLeverxProtocol } from "@/lib/leverx/protocol";
import {
  executeCancelLimitOrder,
  executeClearTriggers,
  executeClosePosition,
  executeCreateMarginAccount,
  executeLinkManager,
  executeOpenTrade,
  executeRegisterExecutor,
  executeRepayDebt,
  executeRevokeExecutor,
  executeSettleExpired,
  executeVaultSupply,
  executeVaultWithdraw,
  executeWithdrawQuote,
  type ClosePositionInput,
  type OpenTradeInput,
  type WithdrawQuoteInput,
} from "@/lib/leverx/transactions";
import { formatTxError } from "@/lib/leverx/tx-errors";
import { suiClient } from "@/lib/sui/client";

const leverxPackageKeys = {
  ids: (registryId: string, predictId: string) =>
    ["leverx-package-ids", registryId, predictId] as const,
};

export function useLeverxProtocolConfig() {
  const { data: settings, isLoading: settingsLoading } = useIndexerProtocol();

  const registryId = settings?.registry_id?.trim() || appConfig.leverxRegistryId;
  const predictId = settings?.predict_id?.trim() || appConfig.predictId;

  const {
    data: packageIds,
    isLoading: packagesLoading,
    isError: packagesError,
  } = useQuery({
    queryKey: leverxPackageKeys.ids(registryId, predictId),
    queryFn: () =>
      fetchPackageIdsForProtocol(suiClient, {
        registryId,
        predictId,
      }),
    enabled: Boolean(registryId),
    staleTime: 10 * 60_000,
    retry: 2,
  });

  const { data: registryFields } = useQuery({
    queryKey: ["leverx-registry-fields", registryId] as const,
    queryFn: () => fetchRegistryFields(suiClient, registryId),
    enabled: Boolean(registryId),
    staleTime: 10 * 60_000,
    retry: 2,
  });

  const cfg = useMemo(() => {
    if (registryId && packagesLoading) {
      return null;
    }

    const base = resolveLeverxProtocol(settings ?? null, {
      packageId: packageIds?.leverxPackageId ?? settings?.package_id,
      predictPackageId: packageIds?.predictPackageId ?? settings?.predict_package_id,
      allowEnvPackageFallback: !registryId || packagesError,
    });
    if (!base) return null;

    return {
      ...base,
      predictId: registryFields?.predictId || base.predictId,
      vaultId: registryFields?.vaultId || base.vaultId,
      feeCollectorId: registryFields?.feeCollectorId || base.feeCollectorId,
    };
  }, [settings, packageIds, packagesLoading, packagesError, registryId, registryFields]);

  const isResolving = settingsLoading || (Boolean(registryId) && packagesLoading);

  return { cfg, isResolving };
}

export function useLeverxTransactions() {
  const queryClient = useQueryClient();
  const { client, wallet, account } = useWallet();
  const { cfg, isResolving } = useLeverxProtocolConfig();

  const invalidate = () => invalidateLeverxQueries(queryClient);

  const requireReady = () => {
    if (!wallet || !account) {
      throw new Error("Connect your wallet to continue.");
    }
    if (!cfg) {
      throw new Error(
        "LeverX protocol is not fully configured. Wait for deploy_and_share to be indexed, or set VITE_LEVERX_REGISTRY_ID / VAULT_ID / FEE_COLLECTOR_ID.",
      );
    }
    return { wallet, account, cfg };
  };

  const openTrade = useMutation({
    mutationFn: async (input: OpenTradeInput) => {
      primeSuccessSound();
      const ready = requireReady();
      return executeOpenTrade({
        client,
        wallet: ready.wallet,
        account: ready.account,
        cfg: ready.cfg,
        input,
      });
    },
    onSuccess: (_data, input) => {
      const positionMinted =
        input.orderType === "market" || input.limitExecution === "immediate";
      if (positionMinted) {
        playSuccessSound();
      }
      invalidate();
    },
  });

  const createMarginAccount = useMutation({
    mutationFn: async () => {
      const ready = requireReady();
      return executeCreateMarginAccount({
        client,
        wallet: ready.wallet,
        account: ready.account,
        cfg: ready.cfg,
      });
    },
    onSuccess: () => invalidate(),
  });

  const closePosition = useMutation({
    mutationFn: async (input: ClosePositionInput) => {
      primeSuccessSound();
      const ready = requireReady();
      return executeClosePosition({
        client,
        wallet: ready.wallet,
        account: ready.account,
        cfg: ready.cfg,
        input,
      });
    },
    onSuccess: () => {
      playSuccessSound();
      invalidate();
    },
  });

  const settleExpired = useMutation({
    mutationFn: async (position: LeveragedPosition) => {
      primeSuccessSound();
      const ready = requireReady();
      return executeSettleExpired({
        client,
        wallet: ready.wallet,
        account: ready.account,
        cfg: ready.cfg,
        position,
      });
    },
    onSuccess: () => {
      playSuccessSound();
      invalidate();
    },
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
    onSuccess: () => invalidate(),
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
    onSuccess: () => invalidate(),
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
    onSuccess: () => invalidate(),
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
    onSuccess: () => invalidate(),
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

  const withdrawQuote = useMutation({
    mutationFn: async (input: WithdrawQuoteInput) => {
      const ready = requireReady();
      return executeWithdrawQuote({
        client,
        wallet: ready.wallet,
        account: ready.account,
        cfg: ready.cfg,
        input,
      });
    },
    onSuccess: () => invalidate(),
  });

  return {
    cfg,
    isProtocolReady: Boolean(cfg) && !isResolving,
    openTrade,
    createMarginAccount,
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
    withdrawQuote,
    formatTxError,
  };
}

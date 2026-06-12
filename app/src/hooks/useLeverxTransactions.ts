import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useWallet } from "@/context/WalletContext";
import { useIndexerProtocol } from "@/hooks/useIndexer";
import { invalidateLeverxQueries } from "@/lib/leverx/invalidate-queries";
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

const PREMIUM_BOUNDS_MESSAGE =
  "Contract price is outside DeepBook Predict's tradable range (1¢–99¢). The market may be near expiry or temporarily unpriced — try another strike or wait for updated oracle prices.";

const MINT_COST_EXCEEDS_POSITION_MESSAGE =
  "Mint cost exceeds your leveraged position size. Try a smaller deposit, lower leverage, or wait for a better contract price.";

const SLIPPAGE_EXCEEDED_MESSAGE =
  "Market moved beyond your slippage tolerance before the trade executed. Try again or increase slippage.";

const LIMIT_PRICE_NOT_MET_MESSAGE =
  "Live contract price is above your limit. Raise the limit or switch to Resting.";

const PLACEMENT_PRICE_NOT_ALIGNED_MESSAGE =
  "Live contract price is outside your limit ± placement slippage. Adjust the limit or widen placement slippage.";

const SLIPPAGE_TOO_HIGH_MESSAGE =
  "Slippage exceeds the on-chain maximum (50%). Lower slippage and try again.";

function formatTxError(error: unknown): string {
  const raw =
    error instanceof Error
      ? error.message
      : typeof error === "string"
        ? error
        : "Transaction failed.";
  if (
    raw.includes("assert_premium_within_bounds") ||
    (raw.includes("predict_client") && raw.includes(", 27)"))
  ) {
    return PREMIUM_BOUNDS_MESSAGE;
  }
  if (
    raw.includes("mint_cost_exceeds_position") ||
    (raw.includes("trade") && raw.includes(", 23)"))
  ) {
    return MINT_COST_EXCEEDS_POSITION_MESSAGE;
  }
  if (raw.includes("slippage_exceeded") || (raw.includes("trade") && raw.includes(", 26)"))) {
    return SLIPPAGE_EXCEEDED_MESSAGE;
  }
  if (raw.includes("limit_price_not_met") || (raw.includes("trade") && raw.includes(", 25)"))) {
    return LIMIT_PRICE_NOT_MET_MESSAGE;
  }
  if (
    raw.includes("placement_price_not_aligned") ||
    (raw.includes("trade") && raw.includes(", 30)"))
  ) {
    return PLACEMENT_PRICE_NOT_ALIGNED_MESSAGE;
  }
  if (raw.includes("slippage_too_high") || (raw.includes("predict_client") && raw.includes(", 32)"))) {
    return SLIPPAGE_TOO_HIGH_MESSAGE;
  }
  if (raw.includes("Predict manager is not linked")) {
    return "Predict manager is not linked. Open Portfolio → Account to link your manager.";
  }
  if (raw.includes("LeverxOnboardingError") || raw.includes("Predict manager is not linked to your trading account")) {
    return "Trading account setup is incomplete. Open Portfolio → Account to link your Predict manager.";
  }
  if (
    raw.includes("InsufficientCoinBalanceError") ||
    (raw.includes("Insufficient") && raw.includes("balance"))
  ) {
    return "Insufficient dUSDC in your wallet for this transaction.";
  }
  return raw;
}

export function useLeverxProtocolConfig() {
  const { data: settings } = useIndexerProtocol();
  return resolveLeverxProtocol(settings ?? null);
}

export function useLeverxTransactions() {
  const queryClient = useQueryClient();
  const { client, wallet, account } = useWallet();
  const cfg = useLeverxProtocolConfig();

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

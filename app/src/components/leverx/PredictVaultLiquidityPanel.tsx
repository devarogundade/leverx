import { useEffect, useMemo, useState } from "react";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { InfoPopover, LabelWithInfo } from "@/components/leverx/InfoPopover";
import { TradeAmountInput, TradeQuickAmounts } from "@/components/leverx/TradeFormControls";
import { leverxInfo } from "@/lib/leverx/info-copy";
import { WalletConnectButton } from "@/components/WalletConnectButton";
import { useWalletCoinBalance } from "@/hooks/useWalletCoinBalance";
import { useWallet } from "@/context/WalletContext";
import { useLeverxTransactions } from "@/hooks/useLeverxTransactions";
import { appConfig } from "@/lib/config";
import { lxplpCoinType } from "@/lib/leverx/protocol";
import { formatCollateralAmount } from "@/lib/predict/quote-assets";
import { QUOTE_UNIT } from "@/lib/predict/constants";
import { ui } from "@/lib/copy";
import { formatUsdcOrPlaceholder } from "@/lib/leverx/placeholders";
import {
  btnTradeSignin,
  labelCaps,
  pillToggleActive,
  pillToggleBtn,
  pillToggleGroup,
  pillToggleIdle,
  tradeLeveragePanel,
} from "@/lib/leverx/tw";

type VaultAction = "supply" | "withdraw";

const QUICK_AMOUNTS = [
  { label: "10%", value: "100" },
  { label: "25%", value: "250" },
  { label: "50%", value: "500" },
  { label: "75%", value: "750" },
  { label: "MAX", value: "1000" },
] as const;

interface Props {
  vaultNav?: number | null;
  vaultId?: string;
  className?: string;
}

export function PredictVaultLiquidityPanel({ vaultNav, vaultId, className }: Props) {
  const [action, setAction] = useState<VaultAction>("supply");
  const [amount, setAmount] = useState("");
  const [txError, setTxError] = useState<string | null>(null);
  const { isWalletConnected, address } = useWallet();
  const { vaultSupply, vaultWithdraw, isProtocolReady, formatTxError, cfg } =
    useLeverxTransactions(address ?? undefined);

  const quoteType = appConfig.quoteType;
  const lxplpType = cfg ? lxplpCoinType(cfg.packageId) : null;

  const { data: quoteBalance, isLoading: quoteBalanceLoading } = useWalletCoinBalance(
    action === "supply" ? quoteType : null,
  );
  const { data: lxplpBalance, isLoading: lxplpBalanceLoading } = useWalletCoinBalance(
    action === "withdraw" ? lxplpType : null,
  );

  useEffect(() => {
    setAmount("");
    setTxError(null);
  }, [action]);

  const symbol = action === "supply" ? "DUSDC" : "lxPLP";
  const balanceLabel = useMemo(() => {
    if (action === "supply") {
      if (quoteBalanceLoading) return "…";
      if (quoteBalance == null) return "_";
      return formatCollateralAmount(quoteType, quoteBalance);
    }
    if (lxplpBalanceLoading) return "…";
    if (lxplpBalance == null) return "_";
    return formatCollateralAmount(lxplpType ?? quoteType, lxplpBalance);
  }, [
    action,
    quoteBalanceLoading,
    quoteBalance,
    lxplpBalanceLoading,
    lxplpBalance,
    quoteType,
    lxplpType,
  ]);

  const amountNum = parseFloat(amount) || 0;
  const pending = vaultSupply.isPending || vaultWithdraw.isPending;

  const handleSubmit = () => {
    if (amountNum <= 0 || !isProtocolReady) return;
    setTxError(null);
    const atoms = BigInt(Math.round(amountNum * Number(QUOTE_UNIT)));

    if (action === "supply") {
      vaultSupply.mutate(atoms, {
        onError: (err) => setTxError(formatTxError(err)),
        onSuccess: () => setAmount(""),
      });
    } else {
      vaultWithdraw.mutate(atoms, {
        onError: (err) => setTxError(formatTxError(err)),
        onSuccess: () => setAmount(""),
      });
    }
  };

  return (
    <div className={cn(tradeLeveragePanel, className)}>
      <div className="border-b border-border p-3">
        <div className="flex items-center justify-between gap-2">
          <div className={pillToggleGroup} role="group" aria-label="Vault action">
            <button
              type="button"
              className={cn(pillToggleBtn, action === "supply" ? pillToggleActive : pillToggleIdle)}
              onClick={() => setAction("supply")}
              aria-pressed={action === "supply"}
            >
              Supply
            </button>
            <button
              type="button"
              className={cn(pillToggleBtn, action === "withdraw" ? pillToggleActive : pillToggleIdle)}
              onClick={() => setAction("withdraw")}
              aria-pressed={action === "withdraw"}
            >
              Withdraw
            </button>
          </div>
          <InfoPopover title={action === "supply" ? "Supply" : "Withdraw"}>
            {action === "supply" ? leverxInfo.vaultSupply : leverxInfo.vaultWithdraw}
          </InfoPopover>
        </div>
      </div>

      <div className="space-y-4 p-3">
        <div className="text-xs text-muted-foreground">
          Pool NAV{" "}
          <span className="font-mono text-foreground">
            {formatUsdcOrPlaceholder(vaultNav ?? null)}
          </span>
          {vaultId ? (
            <>
              {" "}
              · vault <span className="font-mono">{vaultId.slice(0, 10)}…</span>
            </>
          ) : null}
        </div>

        <div>
          <div className="mb-2 flex items-center justify-between gap-2">
            <LabelWithInfo
              label="Amount"
              labelClassName={labelCaps}
              info={leverxInfo.vaultAmount}
            />
            <span className="text-xs text-muted-foreground">
              Bal. <span className="font-mono text-foreground">{balanceLabel}</span>
            </span>
          </div>
          <TradeAmountInput
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            suffix={<span className="text-sm text-muted-foreground">{symbol}</span>}
          />
          <TradeQuickAmounts
            className="mt-2"
            amounts={QUICK_AMOUNTS}
            onPick={(v) => setAmount(v)}
          />
        </div>

        {!isProtocolReady && isWalletConnected ? (
          <p className="flex items-center gap-1 text-xs text-muted-foreground">
            Vault transactions require deployed registry, vault, fee collector, and Pyth oracle IDs.
            <InfoPopover title="Protocol config">{leverxInfo.protocolNotConfigured}</InfoPopover>
          </p>
        ) : null}
        {txError ? <p className="text-xs text-destructive">{txError}</p> : null}

        {isWalletConnected ? (
          <button
            type="button"
            className={btnTradeSignin}
            disabled={!isProtocolReady || amountNum <= 0 || pending}
            onClick={handleSubmit}
          >
            {pending ? (
              <>
                <Loader2 className="mr-2 inline h-4 w-4 animate-spin" />
                Submitting…
              </>
            ) : action === "supply" ? (
              ui.vaultSupplyCta
            ) : (
              ui.vaultWithdrawCta
            )}
          </button>
        ) : (
          <WalletConnectButton className={btnTradeSignin} />
        )}
      </div>
    </div>
  );
}

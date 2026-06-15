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
import { showTxError, showTxSuccess } from "@/lib/toast";
import { appConfig } from "@/lib/config";
import { formatAmount } from "@/lib/copy";
import { lxplpCoinType } from "@/lib/leverx/protocol";
import { QuoteAmount, QuoteIcon } from "@/components/leverx/QuoteAmount";
import { QUOTE_UNIT } from "@/lib/predict/constants";
import { buildQuickAmounts } from "@/lib/leverx/form-helpers";
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

interface Props {
  vaultNav?: number | null;
  vaultId?: string;
  className?: string;
}

export function PredictVaultLiquidityPanel({ vaultNav, vaultId, className }: Props) {
  const [action, setAction] = useState<VaultAction>("supply");
  const [amount, setAmount] = useState("");
  const { isWalletConnected, address } = useWallet();
  const { vaultSupply, vaultWithdraw, isProtocolReady, cfg } = useLeverxTransactions();

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
  }, [action]);

  const symbol = action === "supply" ? "DUSDC" : "lxPLP";
  const balanceAmount = action === "supply" ? quoteBalance : lxplpBalance;
  const balanceLoading = action === "supply" ? quoteBalanceLoading : lxplpBalanceLoading;

  const walletBalance = action === "supply" ? quoteBalance : lxplpBalance;
  const quickAmounts = useMemo(() => buildQuickAmounts(walletBalance), [walletBalance]);

  const amountNum = parseFloat(amount) || 0;
  const exceedsBalance =
    walletBalance != null && amountNum > 0 && amountNum > walletBalance + 1e-6;
  const pending = vaultSupply.isPending || vaultWithdraw.isPending;

  const handleSubmit = () => {
    if (amountNum <= 0 || !isProtocolReady) return;
    const atoms = BigInt(Math.round(amountNum * Number(QUOTE_UNIT)));

    if (action === "supply") {
      vaultSupply.mutate(atoms, {
        onError: showTxError,
        onSuccess: () => {
          showTxSuccess("Liquidity supplied");
          setAmount("");
        },
      });
    } else {
      vaultWithdraw.mutate(atoms, {
        onError: showTxError,
        onSuccess: () => {
          showTxSuccess("Liquidity withdrawn");
          setAmount("");
        },
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
        <div className="text-sm text-muted-foreground">
          Pool size{" "}
          <span className="font-mono text-foreground">
            <QuoteAmount amount={vaultNav ?? null} loading={vaultNav == null} hideZero />
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
            <span className="text-sm text-muted-foreground">
              Bal.{" "}
              {action === "supply" ? (
                <QuoteAmount
                  amount={balanceAmount}
                  loading={balanceLoading}
                  hideZero={false}
                />
              ) : balanceLoading ? (
                "…"
              ) : balanceAmount == null ? (
                "_"
              ) : (
                `${formatAmount(balanceAmount)} ${symbol}`
              )}
            </span>
          </div>
          <TradeAmountInput
            type="number"
            inputMode="decimal"
            min={0}
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            suffix={
              action === "supply" ? (
                <QuoteIcon className="h-5 w-5" />
              ) : (
                <span className="text-sm text-muted-foreground">{symbol}</span>
              )
            }
          />
          <TradeQuickAmounts
            className="mt-2"
            amounts={quickAmounts}
            onPick={(v) => setAmount(v)}
          />
          {exceedsBalance ? (
            <p className="mt-2 text-sm text-destructive">Amount exceeds wallet balance.</p>
          ) : null}
        </div>

        {!isProtocolReady && isWalletConnected ? (
          <p className="flex items-center gap-1 text-sm text-muted-foreground">
            Pool deposits are not available yet. Trading will open once the app is fully connected.
            <InfoPopover title="Setup">{leverxInfo.protocolNotConfigured}</InfoPopover>
          </p>
        ) : null}
        {isWalletConnected ? (
          <button
            type="button"
            className={btnTradeSignin}
            disabled={!isProtocolReady || amountNum <= 0 || exceedsBalance || pending}
            onClick={handleSubmit}
          >
            {pending ? (
              <>
                <Loader2 className="mr-2 inline h-4 w-4 animate-spin" />
                Submitting…
              </>
            ) : action === "supply" ? (
              <span className="inline-flex items-center justify-center gap-1.5">
                Deposit <QuoteIcon />
              </span>
            ) : (
              <span className="inline-flex items-center justify-center gap-1.5">
                Withdraw <QuoteIcon />
              </span>
            )}
          </button>
        ) : (
          <WalletConnectButton className={btnTradeSignin} />
        )}
      </div>
    </div>
  );
}

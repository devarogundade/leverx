import { useState } from "react";
import { LabelWithInfo } from "@/components/leverx/InfoPopover";
import { Input } from "@/components/ui/input";
import { leverxInfo } from "@/lib/leverx/info-copy";
import {
  useIndexerCollateralAssets,
  useIndexerCollateralBalances,
  useIndexerExecutors,
  useIndexerLiquidations,
  useIndexerTriggers,
} from "@/hooks/useIndexer";
import { useLeverxTransactions } from "@/hooks/useLeverxTransactions";
import type { LeveragedPosition, UserProxy } from "@/lib/leverx/indexer-client";
import { premiumRawToCents } from "@/lib/leverx/trade-math";
import { formatUsdcOrPlaceholder } from "@/lib/leverx/placeholders";
import { scaleAtoms, scaleQuote } from "@/lib/predict/scaling";
import { labelCaps, pillToggleBtn, pillToggleIdle, tradeSurface } from "@/lib/leverx/tw";
import { cn } from "@/lib/utils";

interface Props {
  account: UserProxy;
  owner: string;
  positions?: readonly LeveragedPosition[];
  className?: string;
}

function positionKeyForTrigger(
  trigger: { oracle_id: string; is_range: boolean },
  positions: readonly LeveragedPosition[],
) {
  return positions.find(
    (p) => p.oracle_id === trigger.oracle_id && p.is_range === trigger.is_range,
  );
}

export function PortfolioAccountPanel({ account, owner, positions = [], className }: Props) {
  const accountId = account.account_id;
  const { data: triggers = [] } = useIndexerTriggers(accountId);
  const { data: executors = [] } = useIndexerExecutors(accountId);
  const { data: collateralBalances = [] } = useIndexerCollateralBalances(accountId);
  const { data: collateralAssets = [] } = useIndexerCollateralAssets();
  const { data: liquidations = [] } = useIndexerLiquidations({ accountId, owner });
  const collateralDecimals = new Map(
    collateralAssets.map((a) => [a.coin_type, a.decimals]),
  );
  const {
    clearTriggers,
    registerExecutor,
    revokeExecutor,
    linkManager,
    isProtocolReady,
    formatTxError,
  } = useLeverxTransactions(owner);

  const [executorAddress, setExecutorAddress] = useState("");
  const [managerId, setManagerId] = useState(account.predict_manager_id ?? "");

  return (
    <div className={cn("space-y-4", className)}>
      <section className={cn(tradeSurface, "space-y-3 p-4")}>
        <LabelWithInfo
          label="Account settings"
          labelClassName={labelCaps}
          info={leverxInfo.accountSettings}
        />
        <div className="space-y-2">
          <LabelWithInfo
            label="Predict manager ID"
            labelClassName="text-xs text-muted-foreground"
            info={leverxInfo.predictManager}
          />
          <div className="flex gap-2">
            <Input
              value={managerId}
              onChange={(e) => setManagerId(e.target.value)}
              placeholder="0x…"
              className="font-mono text-xs"
            />
            <button
              type="button"
              className={cn(pillToggleBtn, pillToggleIdle, "shrink-0 px-3")}
              disabled={!isProtocolReady || !managerId || linkManager.isPending}
              onClick={() =>
                linkManager.mutate(
                  { accountId, managerId },
                  { onError: (e) => window.alert(formatTxError(e)) },
                )
              }
            >
              {linkManager.isPending ? "…" : "Link"}
            </button>
          </div>
        </div>
        <div className="space-y-2">
          <LabelWithInfo
            label="Session executor"
            labelClassName="text-xs text-muted-foreground"
            info={leverxInfo.sessionExecutor}
          />
          <div className="flex gap-2">
            <Input
              value={executorAddress}
              onChange={(e) => setExecutorAddress(e.target.value)}
              placeholder="0x executor address"
              className="font-mono text-xs"
            />
            <button
              type="button"
              className={cn(pillToggleBtn, pillToggleIdle, "shrink-0 px-3")}
              disabled={!isProtocolReady || !executorAddress || registerExecutor.isPending}
              onClick={() =>
                registerExecutor.mutate(
                  { accountId, executor: executorAddress },
                  {
                    onSuccess: () => setExecutorAddress(""),
                    onError: (e) => window.alert(formatTxError(e)),
                  },
                )
              }
            >
              Register
            </button>
          </div>
        </div>
        {executors.length > 0 ? (
          <ul className="space-y-1 text-xs">
            {executors.map((ex) => (
              <li key={ex.executor} className="flex items-center justify-between gap-2">
                <span className="truncate font-mono">{ex.executor}</span>
                {ex.active ? (
                  <button
                    type="button"
                    className={cn(pillToggleBtn, pillToggleIdle)}
                    disabled={revokeExecutor.isPending}
                    onClick={() =>
                      revokeExecutor.mutate(
                        { accountId, executor: ex.executor },
                        { onError: (e) => window.alert(formatTxError(e)) },
                      )
                    }
                  >
                    Revoke
                  </button>
                ) : (
                  <span className="text-muted-foreground">revoked</span>
                )}
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-xs text-muted-foreground">No session executors registered.</p>
        )}
      </section>

      <section className={cn(tradeSurface, "space-y-2 p-4")}>
        <LabelWithInfo
          label="Triggers"
          labelClassName={labelCaps}
          info={leverxInfo.triggers}
        />
        {triggers.filter((t) => t.active).length === 0 ? (
          <p className="text-xs text-muted-foreground">No active TP/SL triggers.</p>
        ) : (
          <ul className="space-y-2 text-xs">
            {triggers
              .filter((t) => t.active)
              .map((t) => (
                <li
                  key={`${t.oracle_id}-${t.is_range}`}
                  className="flex flex-wrap items-center justify-between gap-2 border-b border-border/40 pb-2"
                >
                  <span>
                    {t.is_range ? "RANGE" : "BINARY"} · {t.oracle_id.slice(0, 10)}…
                  </span>
                  <span className="font-mono text-muted-foreground">
                    TP {premiumRawToCents(BigInt(t.take_profit_premium)).toFixed(1)}¢ · SL{" "}
                    {premiumRawToCents(BigInt(t.stop_loss_premium)).toFixed(1)}¢
                  </span>
                  {(() => {
                    const match = positionKeyForTrigger(t, positions);
                    if (!match) {
                      return (
                        <span className="text-muted-foreground">needs open position</span>
                      );
                    }
                    return (
                      <button
                        type="button"
                        className={cn(pillToggleBtn, pillToggleIdle)}
                        disabled={clearTriggers.isPending}
                        onClick={() =>
                          clearTriggers.mutate(
                            {
                              accountId,
                              key: {
                                oracleId: match.oracle_id,
                                expiryMs: match.expiry_ms,
                                strike: match.strike,
                                higherStrike: match.higher_strike,
                                isUp: match.is_up,
                                isRange: match.is_range,
                              },
                            },
                            { onError: (e) => window.alert(formatTxError(e)) },
                          )
                        }
                      >
                        Clear
                      </button>
                    );
                  })()}
                </li>
              ))}
          </ul>
        )}
      </section>

      <section className={cn(tradeSurface, "space-y-2 p-4")}>
        <LabelWithInfo
          label="Collateral balances"
          labelClassName={labelCaps}
          info={leverxInfo.collateralBalances}
        />
        {collateralBalances.length === 0 ? (
          <p className="text-xs text-muted-foreground">No indexed per-key collateral.</p>
        ) : (
          <ul className="space-y-1 text-xs">
            {collateralBalances.slice(0, 8).map((b) => (
              <li key={`${b.position_key}-${b.collateral_asset}`} className="flex justify-between">
                <span className="truncate font-mono">{b.collateral_asset.split("::").pop()}</span>
                <span>
                  {scaleAtoms(
                    b.balance_atoms,
                    collateralDecimals.get(b.collateral_asset) ?? 6,
                  ).toFixed(4)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className={cn(tradeSurface, "space-y-2 p-4")}>
        <LabelWithInfo
          label="Recent liquidations"
          labelClassName={labelCaps}
          info={leverxInfo.liquidations}
        />
        {liquidations.length === 0 ? (
          <p className="text-xs text-muted-foreground">No liquidation events indexed.</p>
        ) : (
          <ul className="space-y-1 text-xs">
            {liquidations.slice(0, 5).map((l) => (
              <li key={l.event_digest} className="flex justify-between gap-2">
                <span className="text-muted-foreground">
                  health {(l.health_bps / 100).toFixed(0)}%
                </span>
                <span className="font-mono">
                  {formatUsdcOrPlaceholder(scaleQuote(l.debt_repaid))} repaid
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

import { useState } from "react";
import { Plus, UserCog } from "lucide-react";
import { ConfirmDialog } from "@/components/leverx/ConfirmDialog";
import { ResponsiveModal } from "@/components/leverx/ResponsiveModal";
import { LabelWithInfo } from "@/components/leverx/InfoPopover";
import { Input } from "@/components/ui/input";
import { leverxInfo } from "@/lib/leverx/info-copy";
import {
  useIndexerExecutors,
  useIndexerLiquidations,
  useIndexerTriggers,
} from "@/hooks/useIndexer";
import { useLeverxTransactions } from "@/hooks/useLeverxTransactions";
import type { LeveragedPosition, UserProxy } from "@/lib/leverx/indexer-client";
import { premiumRawToCents } from "@/lib/leverx/trade-math";
import { formatUsdcOrPlaceholder } from "@/lib/leverx/placeholders";
import { assetLabelForOracleId } from "@/lib/predict/oracles";
import { usePredictOracleRows } from "@/hooks/usePredictOracles";
import { scaleQuote } from "@/lib/predict/scaling";
import { isValidSuiAddress } from "@/lib/leverx/form-helpers";
import {
  inputInField,
  labelCaps,
  pillToggleBtn,
  pillToggleIdle,
  settingsList,
  settingsListItem,
  settingsListItemHeader,
  tradeSurface,
} from "@/lib/leverx/tw";
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

function SettingsCard({
  title,
  info,
  action,
  children,
}: {
  title: string;
  info: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className={cn(tradeSurface, "overflow-hidden")}>
      <div className="flex items-center justify-between gap-2 border-b border-border px-4 py-3">
        <LabelWithInfo label={title} labelClassName={labelCaps} info={info} />
        {action}
      </div>
      <div className="px-4 py-3">{children}</div>
    </section>
  );
}

export function PortfolioAccountPanel({ account, owner, positions = [], className }: Props) {
  const accountId = account.account_id;
  const { data: oracles = [] } = usePredictOracleRows();
  const { data: triggers = [] } = useIndexerTriggers(accountId);
  const { data: executors = [] } = useIndexerExecutors(accountId);
  const { data: liquidations = [] } = useIndexerLiquidations({ accountId, owner });
  const openMargins = positions.filter((p) => p.status === "open" && p.margin_quote > 0);
  const {
    clearTriggers,
    registerExecutor,
    revokeExecutor,
    linkManager,
    isProtocolReady,
    formatTxError,
  } = useLeverxTransactions();

  const [managerOpen, setManagerOpen] = useState(false);
  const [executorOpen, setExecutorOpen] = useState(false);
  const [revokeTarget, setRevokeTarget] = useState<string | null>(null);
  const [clearTriggerTarget, setClearTriggerTarget] = useState<LeveragedPosition | null>(null);

  const [managerId, setManagerId] = useState(account.predict_manager_id ?? "");
  const [executorAddress, setExecutorAddress] = useState("");
  const [txError, setTxError] = useState<string | null>(null);

  const managerValid = !managerId || isValidSuiAddress(managerId);
  const executorValid = !executorAddress || isValidSuiAddress(executorAddress);
  const activeTriggers = triggers.filter((t) => t.active);

  return (
    <div className={cn("space-y-4", className)}>
      <SettingsCard
        title="Trading account"
        info={leverxInfo.accountSettings}
        action={
          <button
            type="button"
            className={cn(pillToggleBtn, pillToggleIdle, "gap-1 px-2.5 text-xs")}
            onClick={() => {
              setManagerId(account.predict_manager_id ?? "");
              setTxError(null);
              setManagerOpen(true);
            }}
          >
            <UserCog className="h-3.5 w-3.5" />
            {account.predict_manager_id ? "Change" : "Link"}
          </button>
        }
      >
        <dl className="grid gap-2 text-xs">
          <div className="flex justify-between gap-3">
            <dt className="text-muted-foreground">Account ID</dt>
            <dd className="truncate font-mono">{account.account_id.slice(0, 18)}…</dd>
          </div>
          <div className="flex justify-between gap-3">
            <dt className="text-muted-foreground">Predict manager</dt>
            <dd className="truncate font-mono">
              {account.predict_manager_id
                ? `${account.predict_manager_id.slice(0, 10)}…`
                : "Not linked"}
            </dd>
          </div>
          <div className="flex justify-between gap-3">
            <dt className="text-muted-foreground">Total borrowed</dt>
            <dd className="font-mono tabular-nums">
              {formatUsdcOrPlaceholder(scaleQuote(account.borrowed_quote))}
            </dd>
          </div>
        </dl>
      </SettingsCard>

      <SettingsCard
        title="Trusted traders"
        info={leverxInfo.sessionExecutor}
        action={
          <button
            type="button"
            className={cn(pillToggleBtn, pillToggleIdle, "gap-1 px-2.5 text-xs")}
            onClick={() => {
              setExecutorAddress("");
              setTxError(null);
              setExecutorOpen(true);
            }}
          >
            <Plus className="h-3.5 w-3.5" />
            Add
          </button>
        }
      >
        {executors.length === 0 ? (
          <p className="text-xs text-muted-foreground">No trusted traders added.</p>
        ) : (
          <ul className={settingsList}>
            {executors.map((ex) => (
              <li key={ex.executor} className={settingsListItem}>
                <div className={settingsListItemHeader}>
                  <span className="truncate font-mono text-xs">{ex.executor}</span>
                  {ex.active ? (
                    <button
                      type="button"
                      className={cn(pillToggleBtn, pillToggleIdle, "text-xs")}
                      disabled={revokeExecutor.isPending}
                      onClick={() => setRevokeTarget(ex.executor)}
                    >
                      Revoke
                    </button>
                  ) : (
                    <span className="text-xs text-muted-foreground">Revoked</span>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </SettingsCard>

      <SettingsCard title="Auto-exit rules" info={leverxInfo.triggers}>
        {activeTriggers.length === 0 ? (
          <p className="text-xs text-muted-foreground">No active take-profit or stop-loss rules.</p>
        ) : (
          <ul className={settingsList}>
            {activeTriggers.map((t) => {
              const match = positionKeyForTrigger(t, positions);
              const asset = assetLabelForOracleId(t.oracle_id, oracles);
              return (
                <li key={`${t.oracle_id}-${t.is_range}`} className={settingsListItem}>
                  <div className={settingsListItemHeader}>
                    <div className="min-w-0">
                      <p className="text-sm font-medium">{asset}</p>
                      <p className="font-mono text-[11px] text-muted-foreground">
                        TP {premiumRawToCents(BigInt(t.take_profit_premium)).toFixed(1)}¢ · SL{" "}
                        {premiumRawToCents(BigInt(t.stop_loss_premium)).toFixed(1)}¢
                      </p>
                    </div>
                    {match ? (
                      <button
                        type="button"
                        className={cn(pillToggleBtn, pillToggleIdle, "text-xs")}
                        disabled={clearTriggers.isPending}
                        onClick={() => setClearTriggerTarget(match)}
                      >
                        Clear
                      </button>
                    ) : (
                      <span className="text-xs text-muted-foreground">No open trade</span>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </SettingsCard>

      <SettingsCard title="Margin allocation" info={leverxInfo.marginInTrades}>
        {openMargins.length === 0 ? (
          <p className="text-xs text-muted-foreground">No dUSDC margin in open trades.</p>
        ) : (
          <ul className={settingsList}>
            {openMargins.slice(0, 12).map((p) => (
              <li key={p.position_key} className={settingsListItem}>
                <div className={settingsListItemHeader}>
                  <span className="text-sm font-medium">
                    {assetLabelForOracleId(p.oracle_id, oracles)}
                  </span>
                  <span className="font-mono text-xs tabular-nums">
                    {formatUsdcOrPlaceholder(scaleQuote(p.margin_quote))}
                  </span>
                </div>
              </li>
            ))}
          </ul>
        )}
      </SettingsCard>

      <SettingsCard title="Auto-closed trades" info={leverxInfo.liquidations}>
        {liquidations.length === 0 ? (
          <p className="text-xs text-muted-foreground">No auto-closed trades yet.</p>
        ) : (
          <ul className={settingsList}>
            {liquidations.slice(0, 8).map((l) => (
              <li key={l.event_digest} className={settingsListItem}>
                <div className={settingsListItemHeader}>
                  <span className="text-xs text-muted-foreground">
                    Health {(l.health_bps / 100).toFixed(0)}%
                  </span>
                  <span className="font-mono text-xs tabular-nums">
                    {formatUsdcOrPlaceholder(scaleQuote(l.debt_repaid))} repaid
                  </span>
                </div>
              </li>
            ))}
          </ul>
        )}
      </SettingsCard>

      <ResponsiveModal
        open={managerOpen}
        onOpenChange={setManagerOpen}
        title="Link trading account"
        description={leverxInfo.predictManager}
      >
        <div className="space-y-3">
          <Input
            value={managerId}
            onChange={(e) => setManagerId(e.target.value)}
            placeholder="0x… predict manager ID"
            className={cn(inputInField, "h-9 rounded-md border border-border px-3 font-mono text-xs")}
          />
          {!managerValid ? (
            <p className="text-xs text-destructive">Enter a valid Sui address.</p>
          ) : null}
          <button
            type="button"
            className={cn(pillToggleBtn, pillToggleIdle, "w-full")}
            disabled={!isProtocolReady || !managerId || !managerValid || linkManager.isPending}
            onClick={() =>
              linkManager.mutate(
                { accountId, managerId },
                {
                  onSuccess: () => setManagerOpen(false),
                  onError: (e) => setTxError(formatTxError(e)),
                },
              )
            }
          >
            {linkManager.isPending ? "Linking…" : "Confirm link"}
          </button>
          {txError ? <p className="text-xs text-destructive">{txError}</p> : null}
        </div>
      </ResponsiveModal>

      <ResponsiveModal
        open={executorOpen}
        onOpenChange={setExecutorOpen}
        title="Add trusted trader"
        description={leverxInfo.sessionExecutor}
      >
        <div className="space-y-3">
          <Input
            value={executorAddress}
            onChange={(e) => setExecutorAddress(e.target.value)}
            placeholder="Wallet address (0x…)"
            className={cn(inputInField, "h-9 rounded-md border border-border px-3 font-mono text-xs")}
          />
          {!executorValid ? (
            <p className="text-xs text-destructive">Enter a valid Sui address.</p>
          ) : null}
          <button
            type="button"
            className={cn(pillToggleBtn, pillToggleIdle, "w-full")}
            disabled={
              !isProtocolReady ||
              !executorAddress ||
              !executorValid ||
              registerExecutor.isPending
            }
            onClick={() =>
              registerExecutor.mutate(
                { accountId, executor: executorAddress },
                {
                  onSuccess: () => {
                    setExecutorOpen(false);
                    setExecutorAddress("");
                  },
                  onError: (e) => setTxError(formatTxError(e)),
                },
              )
            }
          >
            {registerExecutor.isPending ? "Registering…" : "Confirm registration"}
          </button>
          {txError ? <p className="text-xs text-destructive">{txError}</p> : null}
        </div>
      </ResponsiveModal>

      <ConfirmDialog
        open={revokeTarget != null}
        onOpenChange={(open) => {
          if (!open) setRevokeTarget(null);
        }}
        title="Revoke trusted trader?"
        description="This wallet will no longer be able to trade on your behalf."
        confirmLabel="Revoke access"
        variant="destructive"
        pending={revokeExecutor.isPending}
        onConfirm={() => {
          if (!revokeTarget) return;
          revokeExecutor.mutate(
            { accountId, executor: revokeTarget },
            {
              onSuccess: () => setRevokeTarget(null),
              onError: (e) => setTxError(formatTxError(e)),
            },
          );
        }}
      >
        <p className="font-mono text-xs">{revokeTarget}</p>
      </ConfirmDialog>

      <ConfirmDialog
        open={clearTriggerTarget != null}
        onOpenChange={(open) => {
          if (!open) setClearTriggerTarget(null);
        }}
        title="Clear auto-exit rules?"
        description="Take-profit and stop-loss triggers for this position will be removed."
        confirmLabel="Clear rules"
        variant="destructive"
        pending={clearTriggers.isPending}
        onConfirm={() => {
          if (!clearTriggerTarget) return;
          clearTriggers.mutate(
            {
              accountId,
              key: {
                oracleId: clearTriggerTarget.oracle_id,
                expiryMs: clearTriggerTarget.expiry_ms,
                strike: clearTriggerTarget.strike,
                higherStrike: clearTriggerTarget.higher_strike,
                isUp: clearTriggerTarget.is_up,
                isRange: clearTriggerTarget.is_range,
              },
            },
            {
              onSuccess: () => setClearTriggerTarget(null),
              onError: (e) => setTxError(formatTxError(e)),
            },
          );
        }}
      >
        {clearTriggerTarget ? (
          <p className="text-sm">
            {assetLabelForOracleId(clearTriggerTarget.oracle_id, oracles)} position
          </p>
        ) : null}
      </ConfirmDialog>
    </div>
  );
}

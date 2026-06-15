import { useState, type ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import {
  Check,
  Copy,
  Link2,
  Plus,
  Shield,
  UserCog,
} from "lucide-react";
import { ConfirmDialog } from "@/components/leverx/ConfirmDialog";
import { ResponsiveModal } from "@/components/leverx/ResponsiveModal";
import { LabelWithInfo } from "@/components/leverx/InfoPopover";
import { QuoteAmount } from "@/components/leverx/QuoteAmount";
import { PortfolioFundsSection } from "@/components/leverx/PortfolioFundsSection";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { LoadingState } from "@/components/ui/loading-state";
import { leverxInfo } from "@/lib/leverx/info-copy";
import { useIndexerExecutors, useIndexerTriggers } from "@/hooks/useIndexer";
import { useLeverxTransactions } from "@/hooks/useLeverxTransactions";
import { showTxError, showTxSuccess } from "@/lib/toast";
import type { LeveragedPosition, UserProxy } from "@/lib/leverx/indexer-client";
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
  statValue,
  tradeSurface,
} from "@/lib/leverx/tw";
import { cn } from "@/lib/utils";

interface Props {
  account: UserProxy;
  owner: string;
  positions?: readonly LeveragedPosition[];
  allPositions?: readonly LeveragedPosition[];
  className?: string;
}

function shortAddress(value: string, head = 8, tail = 6): string {
  if (value.length <= head + tail + 1) return value;
  return `${value.slice(0, head)}…${value.slice(-tail)}`;
}

function formatShortDate(ms: number): string {
  return new Date(ms).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function CopyField({ label, value }: { label: string; value: string; }) {
  const [copied, setCopied] = useState(false);

  return (
    <div className="flex min-w-0 items-center justify-between gap-3 rounded-md border border-border/80 bg-muted/30 px-3 py-2">
      <div className="min-w-0">
        <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
          {label}
        </p>
        <p className="truncate font-mono text-sm text-foreground" title={value}>
          {shortAddress(value, 12, 8)}
        </p>
      </div>
      <button
        type="button"
        className={cn(
          pillToggleBtn,
          pillToggleIdle,
          "shrink-0 gap-1 px-2 py-1.5 text-[11px]",
        )}
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(value);
            setCopied(true);
            window.setTimeout(() => setCopied(false), 2000);
          } catch {
            /* clipboard unavailable */
          }
        }}
        aria-label={`Copy ${label}`}
      >
        {copied ? <Check className="h-3.5 w-3.5 text-success" /> : <Copy className="h-3.5 w-3.5" />}
        {copied ? "Copied" : "Copy"}
      </button>
    </div>
  );
}

function AccountMetric({
  label,
  value,
  info,
  sub,
}: {
  label: string;
  value: ReactNode;
  info?: string;
  sub?: string;
}) {
  return (
    <div className="min-w-0 px-4 py-3.5">
      {info ? (
        <LabelWithInfo label={label} labelClassName={labelCaps} info={info} />
      ) : (
        <p className={labelCaps}>{label}</p>
      )}
      <p className={cn(statValue, "mt-1 truncate text-lg sm:text-xl")}>{value}</p>
      {sub ? <p className="mt-0.5 text-[11px] text-muted-foreground">{sub}</p> : null}
    </div>
  );
}

function SettingsCard({
  title,
  info,
  icon: Icon,
  action,
  children,
  className,
}: {
  title: string;
  info: string;
  icon?: LucideIcon;
  action?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={cn(tradeSurface, "flex h-full flex-col overflow-hidden", className)}>
      <div className="flex items-center justify-between gap-2 border-b border-border px-4 py-3">
        <div className="flex min-w-0 items-center gap-2">
          {Icon ? <Icon className="h-4 w-4 shrink-0 text-muted-foreground" /> : null}
          <LabelWithInfo label={title} labelClassName={labelCaps} info={info} />
        </div>
        {action}
      </div>
      <div className="flex-1 px-4 py-3">{children}</div>
    </section>
  );
}

function EmptyHint({ children }: { children: React.ReactNode; }) {
  return (
    <p className="rounded-md border border-dashed border-border/80 bg-muted/20 px-3 py-4 text-center text-sm leading-relaxed text-muted-foreground">
      {children}
    </p>
  );
}

export function PortfolioAccountPanel({
  account,
  positions = [],
  allPositions,
  className,
}: Props) {
  const accountId = account.account_id;
  const history = allPositions ?? positions;
  const {
    data: triggers = [],
    isLoading: triggersLoading,
  } = useIndexerTriggers(accountId);
  const {
    data: executors = [],
    isLoading: executorsLoading,
  } = useIndexerExecutors(accountId);

  const {
    registerExecutor,
    revokeExecutor,
    linkManager,
    isProtocolReady,
  } = useLeverxTransactions();

  const [managerOpen, setManagerOpen] = useState(false);
  const [executorOpen, setExecutorOpen] = useState(false);
  const [revokeTarget, setRevokeTarget] = useState<string | null>(null);

  const [managerId, setManagerId] = useState(account.predict_manager_id ?? "");
  const [executorAddress, setExecutorAddress] = useState("");

  const managerValid = !managerId || isValidSuiAddress(managerId);
  const executorValid = !executorAddress || isValidSuiAddress(executorAddress);
  const activeTriggers = triggers.filter((t) => t.active);
  const activeExecutors = executors.filter((e) => e.active);
  const managerLinked = Boolean(account.predict_manager_id);

  return (
    <div className={cn("space-y-4", className)}>
      <section className={tradeSurface}>
        <div className="flex flex-col gap-3 border-b border-border px-4 py-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0 space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <p className={labelCaps}>Trading account</p>
              <Badge
                variant="outline"
                className={cn(
                  "gap-1.5 border px-2 py-0 text-[10px] font-medium",
                  managerLinked
                    ? "border-success/30 bg-success/10 text-success"
                    : "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-400",
                )}
              >
                <span
                  className={cn(
                    "h-1.5 w-1.5 rounded-full",
                    managerLinked ? "bg-success" : "bg-amber-500",
                  )}
                />
                {managerLinked ? "Manager linked" : "Manager not linked"}
              </Badge>
            </div>
            <p className="text-sm text-muted-foreground">{leverxInfo.accountSettings}</p>
          </div>
          <button
            type="button"
            className={cn(pillToggleBtn, pillToggleIdle, "gap-1.5 self-start px-3 py-1.5 text-sm")}
            onClick={() => {
              setManagerId(account.predict_manager_id ?? "");
              setManagerOpen(true);
            }}
          >
            {managerLinked ? (
              <UserCog className="h-3.5 w-3.5" />
            ) : (
              <Link2 className="h-3.5 w-3.5" />
            )}
            {managerLinked ? "Change manager" : "Link manager"}
          </button>
        </div>

        <div className="grid divide-y divide-border sm:grid-cols-3 sm:divide-x sm:divide-y-0">
          <AccountMetric
            label="Vault borrow"
            info={leverxInfo.borrowedQuote}
            value={<QuoteAmount amount={scaleQuote(account.borrowed_quote)} hideZero />}
            sub="Across all market keys"
          />
          <AccountMetric
            label="Trusted traders"
            info={leverxInfo.sessionExecutor}
            value={executorsLoading ? "…" : String(activeExecutors.length)}
            sub={
              activeExecutors.length === 1
                ? "Active session wallet"
                : "Active session wallets"
            }
          />
          <AccountMetric
            label="Auto-exit rules"
            info={leverxInfo.triggers}
            value={triggersLoading ? "…" : String(activeTriggers.length)}
            sub="Take-profit / stop-loss — manage per position"
          />
        </div>

        <div className="grid gap-2 border-t border-border px-4 py-3 sm:grid-cols-2">
          <CopyField label="Account ID" value={account.account_id} />
          {managerLinked && account.predict_manager_id ? (
            <CopyField label="Predict manager" value={account.predict_manager_id} />
          ) : (
            <div className="flex min-w-0 items-center rounded-md border border-dashed border-border/80 bg-muted/20 px-3 py-2">
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                  Predict manager
                </p>
                <p className="text-sm text-muted-foreground">Link a manager to trade on-chain</p>
              </div>
            </div>
          )}
        </div>
      </section>

      <PortfolioFundsSection
        accountId={accountId}
        predictManagerId={account.predict_manager_id}
        borrowedQuote={account.borrowed_quote}
        positions={history}
      />

      <SettingsCard
        title="Trusted traders"
        info={leverxInfo.sessionExecutor}
        icon={Shield}
        action={
            <button
              type="button"
              className={cn(pillToggleBtn, pillToggleIdle, "gap-1 px-2.5 text-sm")}
              onClick={() => {
                setExecutorAddress("");
                setExecutorOpen(true);
              }}
            >
              <Plus className="h-3.5 w-3.5" />
              Add
            </button>
          }
        >
          {executorsLoading ? (
            <LoadingState label="Loading trusted traders…" compact />
          ) : executors.length === 0 ? (
            <EmptyHint>
              Register a separate wallet that can place trades for you without your main key.
            </EmptyHint>
          ) : (
            <ul className={settingsList}>
              {executors.map((ex) => (
                <li key={ex.executor} className={settingsListItem}>
                  <div className={settingsListItemHeader}>
                    <div className="min-w-0">
                      <p className="truncate font-mono text-sm" title={ex.executor}>
                        {shortAddress(ex.executor, 10, 8)}
                      </p>
                      <p className="text-[11px] text-muted-foreground">
                        {ex.active
                          ? `Added ${formatShortDate(ex.registered_at_ms)}`
                          : ex.revoked_at_ms
                            ? `Revoked ${formatShortDate(ex.revoked_at_ms)}`
                            : "Revoked"}
                      </p>
                    </div>
                    {ex.active ? (
                      <button
                        type="button"
                        className={cn(pillToggleBtn, pillToggleIdle, "text-sm")}
                        disabled={revokeExecutor.isPending}
                        onClick={() => setRevokeTarget(ex.executor)}
                      >
                        Revoke
                      </button>
                    ) : (
                      <Badge variant="outline" className="text-[10px] font-normal text-muted-foreground">
                        Inactive
                      </Badge>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </SettingsCard>

      <ResponsiveModal
        open={managerOpen}
        onOpenChange={setManagerOpen}
        title={managerLinked ? "Change Predict manager" : "Link Predict manager"}
        description={leverxInfo.predictManager}
      >
        <div className="space-y-3">
          <Input
            value={managerId}
            onChange={(e) => setManagerId(e.target.value)}
            placeholder="0x… predict manager object ID"
            className={cn(inputInField, "h-9 rounded-md border border-border px-3 font-mono text-sm")}
          />
          {!managerValid ? (
            <p className="text-sm text-destructive">Enter a valid Sui address.</p>
          ) : null}
          <button
            type="button"
            className={cn(pillToggleBtn, pillToggleIdle, "w-full")}
            disabled={!isProtocolReady || !managerId || !managerValid || linkManager.isPending}
            onClick={() =>
              linkManager.mutate(
                { accountId, managerId },
                {
                  onSuccess: () => {
                    showTxSuccess("Predict manager linked");
                    setManagerOpen(false);
                  },
                  onError: showTxError,
                },
              )
            }
          >
            {linkManager.isPending ? "Linking…" : "Confirm link"}
          </button>
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
            className={cn(inputInField, "h-9 rounded-md border border-border px-3 font-mono text-sm")}
          />
          {!executorValid ? (
            <p className="text-sm text-destructive">Enter a valid Sui address.</p>
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
                    showTxSuccess("Trusted trader registered");
                    setExecutorOpen(false);
                    setExecutorAddress("");
                  },
                  onError: showTxError,
                },
              )
            }
          >
            {registerExecutor.isPending ? "Registering…" : "Confirm registration"}
          </button>
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
              onSuccess: () => {
                showTxSuccess("Trusted trader revoked");
                setRevokeTarget(null);
              },
              onError: showTxError,
            },
          );
        }}
      >
        <p className="font-mono text-sm">{revokeTarget}</p>
      </ConfirmDialog>
    </div>
  );
}

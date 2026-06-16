import { useState, type ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import {
  Plus,
  Shield,
  Wallet,
} from "lucide-react";
import { ConfirmDialog } from "@/components/leverx/ConfirmDialog";
import { CopyField, shortAddress } from "@/components/leverx/CopyField";
import { PortfolioTelegramPanel } from "@/components/leverx/PortfolioTelegramPanel";
import { ResponsiveModal } from "@/components/leverx/ResponsiveModal";
import { LabelWithInfo, InfoPopover } from "@/components/leverx/InfoPopover";
import { PortfolioFundsSection } from "@/components/leverx/PortfolioFundsSection";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { LoadingState } from "@/components/ui/loading-state";
import { leverxInfo } from "@/lib/leverx/info-copy";
import { useIndexerExecutors } from "@/hooks/useIndexer";
import { useLeverxTransactions } from "@/hooks/useLeverxTransactions";
import { showTxError, showTxSuccess } from "@/lib/toast";
import type { LeveragedPosition, UserProxy } from "@/lib/leverx/indexer-client";
import { isValidSuiAddress } from "@/lib/leverx/form-helpers";
import {
  inputInField,
  labelCaps,
  pillIconBtn,
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
  allPositions?: readonly LeveragedPosition[];
  className?: string;
}

function formatShortDate(ms: number): string {
  return new Date(ms).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function SettingsCard({
  title,
  info,
  icon: Icon,
  action,
  children,
  className,
  accentClass = "from-accent/8 to-transparent",
}: {
  title: string;
  info: string;
  icon?: LucideIcon;
  action?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  accentClass?: string;
}) {
  return (
    <section className={cn(tradeSurface, "flex h-full flex-col overflow-hidden", className)}>
      <div className="relative overflow-hidden border-b border-border px-4 py-3 sm:px-5">
        <div
          className={cn(
            "pointer-events-none absolute inset-0 bg-gradient-to-br opacity-90",
            accentClass,
          )}
        />
        <div className="relative flex items-center justify-between gap-2">
          <div className="flex min-w-0 items-center gap-2.5">
            {Icon ? (
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-border/70 bg-card/80">
                <Icon className="h-4 w-4 shrink-0 text-muted-foreground" />
              </span>
            ) : null}
            <LabelWithInfo label={title} labelClassName={labelCaps} info={info} />
          </div>
          {action}
        </div>
      </div>
      <div className="flex-1 px-4 py-3 sm:px-5">{children}</div>
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
  owner,
  positions = [],
  allPositions,
  className,
}: Props) {
  const accountId = account.account_id;
  const history = allPositions ?? positions;
  const {
    data: executors = [],
    isLoading: executorsLoading,
  } = useIndexerExecutors(accountId);

  const {
    registerExecutor,
    revokeExecutor,
    isProtocolReady,
  } = useLeverxTransactions();

  const [executorOpen, setExecutorOpen] = useState(false);
  const [revokeTarget, setRevokeTarget] = useState<string | null>(null);

  const [executorAddress, setExecutorAddress] = useState("");

  const executorValid = !executorAddress || isValidSuiAddress(executorAddress);
  const managerLinked = Boolean(account.predict_manager_id);

  return (
    <div className={cn("space-y-4", className)}>
      <section className={cn(tradeSurface, "overflow-hidden")}>
        <div className="relative overflow-hidden border-b border-border px-4 py-4 sm:px-5 sm:py-5">
          <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-accent/10 via-transparent to-accent/5" />
          <div className="pointer-events-none absolute -right-6 -top-6 h-28 w-28 rounded-full bg-accent/10 blur-2xl" />
          <div className="relative flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div className="flex min-w-0 items-start gap-3.5">
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-border/70 bg-gradient-to-br from-[color-mix(in_oklab,var(--color-card)_88%,white_12%)] to-card shadow-sm">
                <Wallet className="h-5 w-5 text-muted-foreground" aria-hidden />
              </span>
              <div className="min-w-0 space-y-1">
                <p className={labelCaps}>Account</p>
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="text-base font-semibold tracking-tight text-foreground sm:text-lg">
                    Trading account
                  </h3>
                  <InfoPopover title="Trading account">{leverxInfo.accountSettings}</InfoPopover>
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
                    {managerLinked ? "Manager ready" : "Opens on first trade"}
                  </Badge>
                </div>
                <p className="text-sm text-muted-foreground">
                  Wallet, on-chain IDs, and integrations for this proxy account.
                </p>
              </div>
            </div>
          </div>
        </div>

        <div className="space-y-3 px-4 py-4 sm:px-5">
          <CopyField
            label="Wallet address"
            value={owner}
            hint="Send dUSDC to this address, then deposit into your trading account."
            className="border-border/70 bg-gradient-to-r from-muted/25 to-muted/10"
          />
          <div className="grid gap-3 sm:grid-cols-2">
            <CopyField
              label="Account ID"
              value={account.account_id}
              className="border-border/70 bg-muted/15"
            />
            {managerLinked && account.predict_manager_id ? (
              <CopyField
                label="Predict manager"
                value={account.predict_manager_id}
                className="border-border/70 bg-muted/15"
              />
            ) : (
              <div className="flex min-h-[4.25rem] min-w-0 flex-col justify-center rounded-md border border-dashed border-border/80 bg-gradient-to-br from-muted/20 to-transparent px-3 py-2.5">
                <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                  Predict manager
                </p>
                <p className="mt-1 text-sm leading-snug text-muted-foreground">
                  Provisioned by LeverX when you open your first trade
                </p>
              </div>
            )}
          </div>
        </div>
      </section>

      <PortfolioFundsSection
        accountId={accountId}
        borrowedQuote={account.borrowed_quote}
        positions={history}
      />

      <PortfolioTelegramPanel owner={owner} accountId={accountId} />

      <SettingsCard
        title="Bot & Trusted traders"
        info={leverxInfo.sessionExecutor}
        icon={Shield}
        accentClass="from-violet-500/8 to-transparent"
        action={
          <button
            type="button"
            className={cn(pillIconBtn, pillToggleIdle, "px-2.5 text-sm")}
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
                      className={cn(
                        pillToggleBtn,
                        "text-sm text-destructive",
                        "border-destructive/30 bg-destructive/8 hover:border-destructive/45 hover:bg-destructive/12",
                      )}
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

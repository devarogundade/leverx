import { createFileRoute } from "@tanstack/react-router";
import { LabelWithInfo } from "@/components/leverx/InfoPopover";
import { QuoteAmount } from "@/components/leverx/QuoteAmount";
import { PredictVaultLiquidityPanel } from "@/components/leverx/PredictVaultLiquidityPanel";
import { leverxInfo } from "@/lib/leverx/info-copy";
import { VaultPerformanceChart } from "@/components/leverx/VaultPerformanceChart";
import { useIndexerProtocol, useIndexerVaultHistory, useIndexerVaultSummary } from "@/hooks/useIndexer";
import { pageTitle } from "@/lib/brand";
import { ui } from "@/lib/copy";
import {
  formatPercentOrPlaceholder,
} from "@/lib/leverx/placeholders";
import { scaleQuote } from "@/lib/predict/scaling";
import {
  pageSimple,
  pageSimpleTitle,
  vaultAction,
  vaultChart,
  vaultWorkspace,
} from "@/lib/leverx/tw";
import { cn } from "@/lib/utils";
import { loadVaultRoute } from "@/lib/router/route-loaders";
import { routePendingOptions } from "@/lib/router/route-options";

export const Route = createFileRoute("/_app/vault")({
  ...routePendingOptions,
  loader: ({ context }) => loadVaultRoute(context.queryClient),
  head: () => ({
    meta: [
      { title: pageTitle("Vault") },
      {
        name: "description",
        content:
          "Supply and withdraw dUSDC liquidity to the LeverageVault. View pool TVL, APR, and earned yield.",
      },
    ],
  }),
  component: VaultPage,
});

function VaultPage() {
  const { data: protocol, isLoading: protocolLoading } = useIndexerProtocol();
  const vaultId = protocol?.vault_id ?? undefined;
  const { data: vaultSummary, isLoading: vaultLoading } = useIndexerVaultSummary(vaultId);
  const { data: history = [], isLoading: historyLoading } = useIndexerVaultHistory(vaultId);

  const snapshot = vaultSummary?.snapshot;
  const vaultValue = snapshot?.nav ? scaleQuote(snapshot.nav) : null;
  const aprBps = snapshot?.lp_apr_bps ?? null;
  const utilization = snapshot?.utilization_bps ?? null;
  const statsLoading = protocolLoading || vaultLoading;

  return (
    <section className={cn(pageSimple, "mx-auto max-w-[var(--page-max)]")}>
      <div>
        <h1 className={pageSimpleTitle}>{ui.vaultPageTitle}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{ui.vaultPageHint}</p>
        <dl className="mt-4 flex flex-wrap gap-x-6 gap-y-1 text-sm">
          <div className="flex gap-2">
            <dt className="text-muted-foreground">
              <LabelWithInfo label="TVL" info={leverxInfo.vaultTvl} />
            </dt>
            <dd className="font-mono font-medium tabular-nums">
              {statsLoading && vaultValue == null ? (
                "…"
              ) : (
                <QuoteAmount amount={vaultValue} hideZero />
              )}
            </dd>
          </div>
          <div className="flex gap-2">
            <dt className="text-muted-foreground">
              <LabelWithInfo label={ui.vaultApr} info={leverxInfo.vaultApr} />
            </dt>
            <dd
              className={cn(
                "font-mono font-medium tabular-nums",
                aprBps != null && aprBps > 0 && "text-success",
              )}
            >
              {statsLoading && aprBps == null ? "…" : formatPercentOrPlaceholder(aprBps)}
            </dd>
          </div>
          <div className="flex gap-2">
            <dt className="text-muted-foreground">
              <LabelWithInfo label="Util." info={leverxInfo.vaultUtil} />
            </dt>
            <dd className="font-mono font-medium tabular-nums">
              {statsLoading && utilization == null
                ? "…"
                : utilization != null
                  ? `${(utilization / 100).toFixed(1)}%`
                  : "_"}
            </dd>
          </div>
        </dl>
      </div>

      <div className={vaultWorkspace}>
        <VaultPerformanceChart
          snapshots={history}
          loading={historyLoading && history.length === 0}
          className={vaultChart}
        />
        <PredictVaultLiquidityPanel
          vaultNav={vaultValue}
          vaultId={vaultId}
          className={vaultAction}
        />
      </div>
    </section>
  );
}

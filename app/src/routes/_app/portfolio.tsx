import { createFileRoute, Link } from "@tanstack/react-router";
import { WalletConnectPrompt } from "@/components/WalletConnectPrompt";
import { PortfolioAccountPanel } from "@/components/leverx/PortfolioAccountPanel";
import { PredictManagerPortfolioPanel } from "@/components/PredictManagerPortfolioPanel";
import { SurfaceSkeleton } from "@/components/ui/market-skeleton";
import { useWallet } from "@/context/WalletContext";
import { useIndexerAccounts, useIndexerPositions } from "@/hooks/useIndexer";
import { pageTitle } from "@/lib/brand";
import { ui } from "@/lib/copy";
import {
  formatCountOrPlaceholder,
  formatUsdcOrPlaceholder,
} from "@/lib/leverx/placeholders";
import { scaleQuote } from "@/lib/predict/scaling";
import { LabelWithInfo } from "@/components/leverx/InfoPopover";
import { leverxInfo } from "@/lib/leverx/info-copy";
import { labelCaps, pageSimple, pageSimpleTitle, statValue, tradeSurface } from "@/lib/leverx/tw";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_app/portfolio")({
  head: () => ({
    meta: [
      { title: pageTitle("Portfolio") },
      {
        name: "description",
        content: "Your open trades, balance, and profit and loss.",
      },
    ],
  }),
  component: PortfolioPage,
});

function PortfolioPage() {
  const { address, isWalletConnected } = useWallet();
  const {
    data: accounts = [],
    isLoading: accountsLoading,
    isFetched: accountsFetched,
  } = useIndexerAccounts(address ?? undefined);
  const {
    data: openPositions = [],
    isLoading: positionsLoading,
    isFetched: positionsFetched,
  } = useIndexerPositions(address ?? undefined, { status: "open" });

  const account = accounts[0];
  const borrowed = account ? scaleQuote(account.borrowed_quote) : null;
  const marginTotal =
    openPositions.length > 0
      ? openPositions.reduce((sum, p) => sum + scaleQuote(p.margin_quote), 0)
      : null;
  const isLoading = accountsLoading || positionsLoading;
  const statsReady = accountsFetched && positionsFetched && !isLoading;

  return (
    <section className={cn(pageSimple, "animate-page-in")}>
      <div>
        <h1 className={pageSimpleTitle}>Portfolio</h1>
        <p className="mt-1 text-sm text-muted-foreground">{ui.portfolioHint}</p>
      </div>

      {!isWalletConnected ? (
        <WalletConnectPrompt
          title="Connect for portfolio"
          description="Connect your wallet to see your trades and balance."
        />
      ) : isLoading && !account && openPositions.length === 0 ? (
        <SurfaceSkeleton lines={4} />
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-3">
            <PersonalStat
              label="In trades"
              info={leverxInfo.marginOpen}
              value={
                !statsReady && marginTotal == null
                  ? "…"
                  : formatUsdcOrPlaceholder(marginTotal)
              }
            />
            <PersonalStat
              label="Borrowed"
              info={leverxInfo.borrowedQuote}
              value={
                !statsReady && borrowed == null ? "…" : formatUsdcOrPlaceholder(borrowed)
              }
            />
            <PersonalStat
              label="Open trades"
              info={leverxInfo.openPositions}
              value={
                !statsReady
                  ? "…"
                  : formatCountOrPlaceholder(openPositions.length)
              }
            />
          </div>

          <PredictManagerPortfolioPanel
            positions={openPositions}
            owner={address ?? undefined}
            isLoading={isLoading}
          />

          {account ? (
            <PortfolioAccountPanel
              account={account}
              owner={address!}
              positions={openPositions}
            />
          ) : null}
        </>
      )}

      <div className="flex flex-wrap items-center justify-center gap-4 pt-2 text-sm">
        <Link to="/markets" className="text-accent hover:underline">
          Browse markets →
        </Link>
        <Link to="/vault" className="text-muted-foreground hover:text-foreground">
          Provide vault liquidity →
        </Link>
      </div>
    </section>
  );
}

function PersonalStat({
  label,
  value,
  info,
  tone,
}: {
  label: string;
  value: string;
  info?: string;
  tone?: "success" | "destructive";
}) {
  return (
    <div className={cn(tradeSurface, "px-4 py-3")}>
      {info ? (
        <LabelWithInfo label={label} labelClassName={labelCaps} info={info} />
      ) : (
        <div className={labelCaps}>{label}</div>
      )}
      <div
        className={cn(
          statValue,
          "mt-1 text-xl",
          tone === "success" && "text-success",
          tone === "destructive" && "text-destructive",
        )}
      >
        {value}
      </div>
    </div>
  );
}

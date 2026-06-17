import { useMemo } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { WalletConnectPrompt } from "@/components/WalletConnectPrompt";
import { JarvisWorkspace } from "@/components/leverx/JarvisWorkspace";
import { useWallet } from "@/context/WalletContext";
import { useIndexerAccounts, useIndexerPositions } from "@/hooks/useIndexer";
import { pageTitle } from "@/lib/brand";
import { resolveTradingAccount } from "@/lib/leverx/account-resolution";
import { pageSimple } from "@/lib/leverx/tw";
import { cn } from "@/lib/utils";
import { loadAppShell } from "@/lib/router/route-loaders";
import { routePendingOptions } from "@/lib/router/route-options";

export const Route = createFileRoute("/_app/jarvis")({
  ...routePendingOptions,
  loader: ({ context }) => loadAppShell(context.queryClient),
  head: () => ({
    meta: [
      { title: pageTitle("Jarvis") },
      {
        name: "description",
        content: "AI assistant that trades on your behalf within limits you set.",
      },
    ],
  }),
  component: JarvisPage,
});

function JarvisPage() {
  const { address, isWalletConnected } = useWallet();
  const { data: accounts = [] } = useIndexerAccounts(address ?? undefined);
  const { data: openPositions = [] } = useIndexerPositions(address ?? undefined, {
    status: "open",
  });
  const { data: closedPositions = [] } = useIndexerPositions(address ?? undefined, {
    status: "closed",
  });

  const account = useMemo(
    () =>
      resolveTradingAccount(
        accounts,
        [...openPositions, ...closedPositions],
        address ?? "",
      ),
    [accounts, openPositions, closedPositions, address],
  );

  return (
    <section className={cn("jarvis-page", pageSimple, "w-full")}>
      {!isWalletConnected || !address ? (
        <WalletConnectPrompt
          title="Sign in to use Jarvis"
          description="Sign in so Jarvis can manage the trading account linked to your wallet."
        />
      ) : !account?.account_id ? (
        <div className="flex flex-1 items-center justify-center px-4">
          <p className="text-center text-sm text-muted-foreground">
            No trading account found. Deposit funds in Portfolio to get started.
          </p>
        </div>
      ) : (
        <JarvisWorkspace owner={address} accountId={account.account_id} className="min-h-0 flex-1" />
      )}
    </section>
  );
}

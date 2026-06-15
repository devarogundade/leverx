import { createFileRoute } from "@tanstack/react-router";
import { KeeperSetupPage } from "@/components/leverx/KeeperSetupPage";
import { pageTitle } from "@/lib/brand";
import { routePendingOptions } from "@/lib/router/route-options";

export const Route = createFileRoute("/_app/keeper")({
  ...routePendingOptions,
  loader: () => null,
  head: () => ({
    meta: [
      { title: pageTitle("Helper") },
      {
        name: "description",
        content:
          "Run the LeverX helper on testnet — close expired trades, fill limit orders, and earn protocol fees.",
      },
    ],
  }),
  component: KeeperPage,
});

function KeeperPage() {
  return <KeeperSetupPage />;
}

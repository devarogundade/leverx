import { createFileRoute } from "@tanstack/react-router";
import { PredictTradeTerminal } from "@/components/leverx/PredictTradeTerminal";
import { pageTitle } from "@/lib/brand";
import { loadPredictTradeRoute } from "@/lib/router/route-loaders";
import { routePendingOptions } from "@/lib/router/route-options";

export const Route = createFileRoute("/_detail/predictions/$oracleId")({
  ...routePendingOptions,
  loader: ({ context, params }) => loadPredictTradeRoute(context.queryClient, params.oracleId),
  head: ({ params }) => ({
    meta: [
      { title: pageTitle("Trade") },
      { name: "description", content: "Open a leveraged trade on a live market." },
    ],
  }),
  component: PredictTradePage,
});

function PredictTradePage() {
  const { oracleId } = Route.useParams();

  return <PredictTradeTerminal key={oracleId} oracleId={oracleId} />;
}

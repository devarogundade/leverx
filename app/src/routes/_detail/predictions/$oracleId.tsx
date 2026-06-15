import { createFileRoute } from "@tanstack/react-router";
import { PredictTradePage } from "@/components/leverx/PredictTradePage";
import { pageTitle } from "@/lib/brand";
import { loadPredictTradeRoute } from "@/lib/router/route-loaders";
import { routePendingOptions } from "@/lib/router/route-options";

export const Route = createFileRoute("/_detail/predictions/$oracleId")({
  ...routePendingOptions,
  loader: ({ context, params }) => loadPredictTradeRoute(context.queryClient, params.oracleId),
  head: () => ({
    meta: [
      { title: pageTitle("Trade") },
      { name: "description", content: "Open a leveraged trade on a live market." },
    ],
  }),
  component: OracleTradePage,
});

function OracleTradePage() {
  const { oracleId } = Route.useParams();
  return <PredictTradePage oracleId={oracleId} />;
}

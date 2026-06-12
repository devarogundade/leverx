import { createFileRoute } from "@tanstack/react-router";
import { PredictTradeTerminal } from "@/components/leverx/PredictTradeTerminal";
import { pageTitle } from "@/lib/brand";

export const Route = createFileRoute("/_detail/predictions/$oracleId")({
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

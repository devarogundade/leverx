import { createFileRoute } from "@tanstack/react-router";
import { PredictTradeTerminal } from "@/components/leverx/PredictTradeTerminal";
import { pageTitle } from "@/lib/brand";
import type { PredictSide } from "@/lib/predict/instruments";
import { z } from "zod";

const searchSchema = z.object({
  strike: z.coerce.number().optional(),
  lowerStrike: z.coerce.number().optional(),
  upperStrike: z.coerce.number().optional(),
  side: z
    .enum(["up", "down", "range", "long", "short"])
    .optional()
    .transform((value): PredictSide | undefined => {
      if (value === "long") return "up";
      if (value === "short") return "down";
      return value;
    }),
});

export const Route = createFileRoute("/_detail/predictions/$oracleId")({
  validateSearch: searchSchema,
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
  const { strike, lowerStrike, upperStrike, side } = Route.useSearch();

  return (
    <PredictTradeTerminal
      key={oracleId}
      oracleId={oracleId}
      strikeRaw={strike}
      lowerStrikeRaw={lowerStrike}
      upperStrikeRaw={upperStrike}
      side={side}
    />
  );
}

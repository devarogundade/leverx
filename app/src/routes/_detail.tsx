import { createFileRoute } from "@tanstack/react-router";
import { DetailLayout } from "@/components/DetailLayout";
import { loadAppShell } from "@/lib/router/route-loaders";
import { routePendingOptions } from "@/lib/router/route-options";

export const Route = createFileRoute("/_detail")({
  ...routePendingOptions,
  loader: ({ context }) => loadAppShell(context.queryClient),
  component: DetailLayout,
});

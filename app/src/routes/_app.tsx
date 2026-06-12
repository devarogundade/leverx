import { createFileRoute } from "@tanstack/react-router";
import { AppLayout } from "@/components/AppLayout";
import { loadAppShell } from "@/lib/router/route-loaders";
import { routePendingOptions } from "@/lib/router/route-options";

export const Route = createFileRoute("/_app")({
  ...routePendingOptions,
  loader: ({ context }) => loadAppShell(context.queryClient),
  component: AppLayout,
});

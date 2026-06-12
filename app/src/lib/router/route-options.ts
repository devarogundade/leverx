import { RoutePending } from "@/components/RoutePending";

/** Shared pending UI — pair with a route `loader` on every file route. */
export const routePendingOptions = {
  pendingComponent: RoutePending,
} as const;

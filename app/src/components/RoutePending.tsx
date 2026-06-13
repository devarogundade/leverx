import { useRouterState } from "@tanstack/react-router";
import { LoadingState } from "@/components/ui/loading-state";
import { MarketGridSkeleton, SurfaceSkeleton, TradeTerminalSkeleton } from "@/components/ui/market-skeleton";
import { Skeleton } from "@/components/ui/skeleton";
import { pageSimple } from "@/lib/leverx/tw";
import { cn } from "@/lib/utils";

export function RoutePending() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  if (pathname.startsWith("/predictions/")) {
    return <TradeTerminalSkeleton />;
  }

  if (pathname === "/markets") {
    return (
      <section className={cn(pageSimple, "animate-page-in")}>
        <Skeleton className="h-7 w-28 rounded-md sm:h-8 sm:w-32" />
        <MarketGridSkeleton count={6} />
      </section>
    );
  }

  if (
    pathname === "/portfolio" ||
    pathname === "/vault" ||
    pathname === "/points" ||
    pathname === "/guide" ||
    pathname === "/keeper"
  ) {
    return (
      <section className={cn(pageSimple, "mx-auto max-w-[var(--page-max)] animate-page-in")}>
        <SurfaceSkeleton lines={6} />
      </section>
    );
  }

  return (
    <div className="flex min-h-[40vh] items-center justify-center px-4">
      <LoadingState />
    </div>
  );
}

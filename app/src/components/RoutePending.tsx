import { useRouterState } from "@tanstack/react-router";
import { LoadingState } from "@/components/ui/loading-state";
import { MarketGridSkeleton, SurfaceSkeleton } from "@/components/ui/market-skeleton";
import { pageSimple } from "@/lib/leverx/tw";
import { cn } from "@/lib/utils";

export function RoutePending() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  if (pathname.startsWith("/predictions/")) {
    return (
      <div className="mx-auto w-full max-w-[var(--page-max)] px-4 py-6 sm:px-6">
        <SurfaceSkeleton lines={10} />
      </div>
    );
  }

  if (pathname === "/markets") {
    return (
      <section className={cn(pageSimple, "animate-page-in")}>
        <div className="mb-4 h-8 w-32 rounded-md bg-muted/60" />
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

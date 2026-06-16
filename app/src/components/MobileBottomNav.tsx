import { Link, useRouterState } from "@tanstack/react-router";
import { Coins, LayoutGrid, Sparkles, Trophy, Wallet } from "lucide-react";
import { cn } from "@/lib/utils";
import { useJarvisStatus } from "@/hooks/useJarvis";
import { useWallet } from "@/context/WalletContext";
import { useIndexerAccounts, useIndexerPositions } from "@/hooks/useIndexer";
import { resolveTradingAccount } from "@/lib/leverx/account-resolution";
import { useMemo } from "react";

const NAV_ITEMS = [
  { label: "Markets", to: "/markets", icon: LayoutGrid, center: false },
  { label: "Pool", to: "/vault", icon: Coins, center: false },
  { label: "Jarvis", to: "/jarvis", icon: Sparkles, center: true },
  { label: "Points", to: "/points", icon: Trophy, center: false },
  { label: "Portfolio", to: "/portfolio", icon: Wallet, center: false },
] as const;

function isActive(pathname: string, to: string): boolean {
  if (to === "/markets") {
    return pathname.startsWith("/markets") || pathname.startsWith("/predictions");
  }
  return pathname.startsWith(to);
}

export function MobileBottomNav() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const { address } = useWallet();
  const { data: accounts = [] } = useIndexerAccounts(address ?? undefined);
  const { data: positions = [] } = useIndexerPositions(address ?? undefined);

  const account = useMemo(
    () => resolveTradingAccount(accounts, positions, address ?? ""),
    [accounts, positions, address],
  );

  const { data: jarvisStatus } = useJarvisStatus(
    address ?? null,
    account?.account_id ?? null,
  );
  const unread = jarvisStatus?.unread_count ?? 0;

  return (
    <nav
      className="mobile-bottom-nav fixed inset-x-0 bottom-0 z-40 border-t border-border bg-background/95 backdrop-blur-md md:hidden"
      aria-label="Main navigation"
    >
      <ul className="mx-auto flex max-w-lg items-end justify-between px-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] pt-1.5">
        {NAV_ITEMS.map((item) => {
          const active = isActive(pathname, item.to);
          const Icon = item.icon;
          const showBadge = item.center && unread > 0;

          if (item.center) {
            return (
              <li key={item.to} className="flex flex-1 justify-center">
                <Link
                  to={item.to}
                  className={cn(
                    "relative -mt-4 flex flex-col items-center gap-0.5",
                    "rounded-2xl border border-violet-500/40 bg-gradient-to-b from-violet-500/20 to-violet-600/10 px-4 py-2.5",
                    "shadow-[0_4px_20px_-6px] shadow-violet-500/50",
                    active && "ring-2 ring-violet-400/50",
                  )}
                >
                  <span className="relative flex h-10 w-10 items-center justify-center rounded-xl bg-violet-500/20">
                    <Icon className="h-5 w-5 text-violet-300" />
                    {showBadge ? (
                      <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-violet-500 px-1 text-[9px] font-bold text-white">
                        {unread > 9 ? "9+" : unread}
                      </span>
                    ) : null}
                  </span>
                  <span className="text-[10px] font-semibold tracking-wide text-violet-200">
                    {item.label}
                  </span>
                </Link>
              </li>
            );
          }

          return (
            <li key={item.to} className="flex flex-1 justify-center">
              <Link
                to={item.to}
                className={cn(
                  "flex min-w-[3.25rem] flex-col items-center gap-0.5 rounded-lg px-2 py-1.5 text-muted-foreground transition-colors",
                  active && "text-foreground",
                )}
              >
                <Icon className={cn("h-5 w-5", active && "text-violet-400")} />
                <span className="text-[10px] font-medium">{item.label}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

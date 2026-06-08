import { Link, useRouterState } from "@tanstack/react-router";
import { isNavDropdown, SITE_NAV_ENTRIES } from "@/lib/site-nav";
import { SiteNavEarnMenu } from "@/components/SiteNavEarnMenu";
import { cn } from "@/lib/utils";

interface Props {
  className?: string;
  onNavigate?: () => void;
  vertical?: boolean;
}

export function SiteHeaderNav({ className, onNavigate, vertical }: Props) {
  const { location } = useRouterState();
  const pathname = location.pathname;

  return (
    <nav
      className={cn(
        vertical
          ? "flex flex-col gap-1"
          : "flex min-w-0 flex-wrap items-center gap-2 md:gap-3 lg:gap-5 xl:gap-8",
        className,
      )}
      aria-label="Main navigation"
    >
      {SITE_NAV_ENTRIES.map((entry) => {
        if (isNavDropdown(entry)) {
          return (
            <SiteNavEarnMenu
              key={entry.label}
              entry={entry}
              onNavigate={onNavigate}
              vertical={vertical}
            />
          );
        }

        const active = entry.isActive(pathname);
        const cls = cn(
          "nav-tab",
          vertical && "rounded-sm px-3 py-2",
          active && "nav-tab-active",
        );

        if (entry.external) {
          return (
            <a
              key={entry.label}
              href={entry.to}
              target="_blank"
              rel="noreferrer"
              onClick={onNavigate}
              className={cls}
            >
              {entry.label}
            </a>
          );
        }

        return (
          <Link key={entry.label} to={entry.to} onClick={onNavigate} className={cls}>
            {entry.label}
          </Link>
        );
      })}
    </nav>
  );
}

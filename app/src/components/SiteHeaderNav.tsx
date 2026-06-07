import { Link, useRouterState } from "@tanstack/react-router";
import { SITE_NAV_LINKS } from "@/lib/site-nav";
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
        vertical ? "flex flex-col gap-1" : "flex items-center gap-4 xl:gap-8",
        className,
      )}
      aria-label="Main navigation"
    >
      {SITE_NAV_LINKS.map((link) => {
        const active = link.isActive(pathname);
        const cls = cn(
          "nav-tab",
          vertical && "rounded-sm px-3 py-2",
          active && "nav-tab-active",
        );

        if (link.external) {
          return (
            <a
              key={link.label}
              href={link.to}
              target="_blank"
              rel="noreferrer"
              onClick={onNavigate}
              className={cls}
            >
              {link.label}
            </a>
          );
        }

        return (
          <Link key={link.label} to={link.to} onClick={onNavigate} className={cls}>
            {link.label}
          </Link>
        );
      })}
    </nav>
  );
}

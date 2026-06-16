import { Link } from "@tanstack/react-router";
import { useIndexerHealth, useKeeperHealth } from "@/hooks/useIndexer";
import { cn } from "@/lib/utils";

function ServiceStatus({ label, online }: { label: string; online: boolean }) {
  return (
    <span className="site-footer-status">
      <span
        className={cn(
          "site-footer-dot",
          online ? "site-footer-dot--on" : "site-footer-dot--off",
        )}
        aria-hidden
      />
      {label} {online ? "online" : "offline"}
    </span>
  );
}

export function SiteFooter() {
  const { data: indexerHealth } = useIndexerHealth();
  const { data: keeperHealth } = useKeeperHealth();

  return (
    <footer className="site-footer pb-[calc(50px+env(safe-area-inset-bottom,0px))] md:pb-0">
      <div className="site-footer-inner">
        <div className="site-footer-statuses" aria-label="Service status">
          <ServiceStatus label="Market data" online={indexerHealth?.ok === true} />
          <ServiceStatus label="Trading service" online={keeperHealth?.ok === true} />
        </div>
        <nav className="site-footer-links" aria-label="Legal">
          <Link to="/terms">Terms</Link>
          <Link to="/privacy">Privacy</Link>
        </nav>
      </div>
    </footer>
  );
}

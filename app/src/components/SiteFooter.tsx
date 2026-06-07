import { Link } from "@tanstack/react-router";
import { useIndexerHealth } from "@/hooks/useIndexer";

export function SiteFooter() {
  const { data: health } = useIndexerHealth();
  const online = health?.ok === true;

  return (
    <footer className="site-footer">
      <div className="site-footer-inner">
        <span className="site-footer-status">
          <span
            className={`site-footer-dot ${online ? "site-footer-dot--on" : "site-footer-dot--off"}`}
            aria-hidden
          />
          Indexer {online ? "online" : "offline"}
        </span>
        <nav className="site-footer-links" aria-label="Legal">
          <Link to="/terms">Terms</Link>
          <Link to="/privacy">Privacy</Link>
        </nav>
      </div>
    </footer>
  );
}

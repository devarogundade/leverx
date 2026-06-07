import { Link } from "@tanstack/react-router";
import { ArrowRight } from "lucide-react";
import { ThemeToggle } from "@/components/ThemeToggle";
import { APP_NAME } from "@/lib/brand";

export function LandingHeader() {
  return (
    <header className="landing-header">
      <div className="landing-header-inner">
        <Link to="/" className="landing-header-brand">
          <div className="landing-logo">LX</div>
          <span className="landing-brand-name hidden sm:inline">{APP_NAME}</span>
        </Link>

        <nav className="landing-header-nav" aria-label="Landing navigation">
          <Link to="/guide" className="landing-header-link">
            Docs
          </Link>
          <Link to="/markets" className="landing-header-link">
            Markets
          </Link>
        </nav>

        <div className="landing-header-actions">
          <ThemeToggle />
          <Link to="/markets" className="landing-header-cta">
            Launch app
            <ArrowRight className="h-3.5 w-3.5" aria-hidden />
          </Link>
        </div>
      </div>
    </header>
  );
}

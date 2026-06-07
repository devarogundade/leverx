import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { ArrowRight, Menu, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/components/ThemeToggle";
import { APP_NAME } from "@/lib/brand";

export function LandingHeader() {
  const [open, setOpen] = useState(false);
  const closeMenu = () => setOpen(false);

  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  return (
    <header className="landing-header">
      <div className="landing-header-inner">
        <Link to="/" className="landing-header-brand" onClick={closeMenu}>
          <div className="landing-logo">LX</div>
          <span className="landing-brand-name hidden sm:inline">{APP_NAME}</span>
        </Link>

        <nav className="landing-header-nav" aria-label="Landing navigation">
          <Link to="/guide" className="landing-header-link" onClick={closeMenu}>
            Docs
          </Link>
          <Link to="/markets" className="landing-header-link" onClick={closeMenu}>
            Markets
          </Link>
        </nav>

        <div className="landing-header-actions">
          <ThemeToggle />
          <Link to="/markets" className="landing-header-cta" onClick={closeMenu}>
            Launch app
            <ArrowRight className="h-3.5 w-3.5" aria-hidden />
          </Link>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={() => setOpen((o) => !o)}
            className="btn-icon inline-flex sm:hidden"
            aria-label={open ? "Close menu" : "Open menu"}
            aria-expanded={open}
          >
            {open ? <X className="h-4 w-4" /> : <Menu className="h-4 w-4" />}
          </Button>
        </div>
      </div>

      {open ? (
        <>
          <Button
            type="button"
            variant="ghost"
            className="fixed inset-0 z-40 h-auto w-auto rounded-none bg-black/60 hover:bg-black/60 sm:hidden"
            aria-label="Close menu"
            onClick={closeMenu}
          />
          <div className="landing-mobile-menu sm:hidden">
            <nav className="flex flex-col gap-1" aria-label="Landing navigation">
              <Link
                to="/guide"
                className="landing-mobile-menu-link"
                onClick={closeMenu}
              >
                Docs
              </Link>
              <Link
                to="/markets"
                className="landing-mobile-menu-link"
                onClick={closeMenu}
              >
                Markets
              </Link>
            </nav>
            <Link
              to="/markets"
              className="landing-header-cta mt-3 w-full justify-center"
              onClick={closeMenu}
            >
              Launch app
              <ArrowRight className="h-3.5 w-3.5" aria-hidden />
            </Link>
          </div>
        </>
      ) : null}
    </header>
  );
}

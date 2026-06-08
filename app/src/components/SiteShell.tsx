import { type ReactNode, useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { APP_NAME } from "@/lib/brand";
import { SiteHeaderNav } from "@/components/SiteHeaderNav";
import { Button } from "@/components/ui/button";
import { HelpCircle, Menu, X } from "lucide-react";
import { SiteFooter } from "@/components/SiteFooter";
import { BalanceBreakdown } from "@/components/leverx/BalanceBreakdown";
import { WelcomeDialog } from "@/components/leverx/WelcomeDialog";
import { WalletConnectButton } from "@/components/WalletConnectButton";
import { ThemeToggle } from "@/components/ThemeToggle";
import { cn } from "@/lib/utils";

interface Props {
  children: ReactNode;
  /** Trade terminal — edge-to-edge main column (no page max-width). */
  fullWidth?: boolean;
}

export function SiteShell({ children, fullWidth }: Props) {
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
    <div className="site-shell relative flex min-h-dvh flex-col bg-background">
      <div className="pixel-border" aria-hidden />
      <header className="site-header w-full bg-background">
        <div className="site-header-inner">
          <Link to="/markets" className="flex shrink-0 items-center gap-2" onClick={closeMenu}>
            <div className="flex h-7 w-7 items-center justify-center rounded-md bg-accent font-mono text-xs font-bold text-accent-foreground">
              LX
            </div>
            <span className="hidden text-sm font-bold tracking-wide sm:inline">{APP_NAME}</span>
          </Link>

          <SiteHeaderNav className="hidden min-w-0 flex-1 lg:flex" />
          <Link
            to="/guide"
            className="btn-how-it-works hidden lg:inline-flex"
            onClick={closeMenu}
          >
            <HelpCircle className="h-3.5 w-3.5" />
            How it works?
          </Link>

          <div className="ml-auto flex shrink-0 items-center gap-1 sm:gap-2">
            <BalanceBreakdown className="hidden md:inline-flex" />
            <ThemeToggle />
            <WalletConnectButton className="hidden md:inline-flex" />
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={() => setOpen((o) => !o)}
              className="btn-icon inline-flex lg:hidden"
              aria-label={open ? "Close menu" : "Open menu"}
              aria-expanded={open}
            >
              {open ? <X className="h-4 w-4" /> : <Menu className="h-4 w-4" />}
            </Button>
          </div>
        </div>
      </header>

      {open && (
        <>
          <Button
            type="button"
            variant="ghost"
            className="fixed inset-0 z-40 h-auto w-auto rounded-none bg-black/60 hover:bg-black/60 lg:hidden"
            aria-label="Close menu"
            onClick={closeMenu}
          />
          <div className="site-mobile-menu lg:hidden">
            <BalanceBreakdown className="site-mobile-menu-balance mb-3 w-full" />
            <SiteHeaderNav vertical onNavigate={closeMenu} className="mb-3" />
            <Link
              to="/guide"
              className="btn-how-it-works mb-3 w-full justify-center"
              onClick={closeMenu}
            >
              <HelpCircle className="h-3.5 w-3.5" />
              How it works?
            </Link>
            <WalletConnectButton fullWidth onMenuClose={closeMenu} />
          </div>
        </>
      )}

      <main
        className={cn(
          "mx-auto flex w-full min-w-0 flex-1 flex-col px-[var(--page-px)] py-[var(--page-py)]",
          fullWidth ? "max-w-none" : "max-w-[var(--page-max)]",
        )}
      >
        {children}
      </main>
      <SiteFooter />
      <WelcomeDialog />
    </div>
  );
}

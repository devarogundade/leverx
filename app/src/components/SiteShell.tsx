import { type ReactNode, useEffect, useRef, useState } from "react";
import { GsapPageEnter } from "@/components/motion/GsapPageEnter";
import { useGsapHeaderScroll } from "@/hooks/useGsapHeaderScroll";
import { Link } from "@tanstack/react-router";
import { AppLogo } from "@/components/AppLogo";
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
import { pageShellContent } from "@/lib/leverx/tw";

interface Props {
  children: ReactNode;
  /** Trade terminal — edge-to-edge main column (no page max-width). */
  fullWidth?: boolean;
  /** Extra classes on `<main>` (e.g. mobile bottom nav padding). */
  mainClassName?: string;
}

export function SiteShell({ children, fullWidth, mainClassName }: Props) {
  const [open, setOpen] = useState(false);
  const headerRef = useRef<HTMLElement>(null);
  const closeMenu = () => setOpen(false);

  useGsapHeaderScroll(headerRef);

  useEffect(() => {
    if (!open) {
      document.body.dataset.scrollLock = "false";
      return;
    }

    document.body.dataset.scrollLock = "true";
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.dataset.scrollLock = "false";
      document.body.style.overflow = prev;
    };
  }, [open]);

  return (
    <div className="site-shell relative flex min-h-dvh flex-col bg-background">
      <div className="pixel-border" aria-hidden />
      <header ref={headerRef} className="site-header w-full bg-background">
        <div className="site-header-inner">
          <Link
            to="/markets"
            className="site-header-brand flex shrink-0 items-center gap-2"
            onClick={closeMenu}
          >
            <AppLogo />
            <span className="hidden text-sm font-bold tracking-wide min-[400px]:inline">
              {APP_NAME}
            </span>
          </Link>

          <SiteHeaderNav className="site-header-nav hidden min-w-0 flex-1 md:flex" />

          <Link
            to="/guide"
            className="btn-how-it-works hidden shrink-0 xl:inline-flex"
            onClick={closeMenu}
          >
            <HelpCircle className="h-3.5 w-3.5" />
            How it works?
          </Link>

          <div className="site-header-actions ml-auto flex shrink-0 items-center gap-1 min-[400px]:gap-1.5 sm:gap-2 md:ml-0">
            <BalanceBreakdown className="hidden min-[520px]:inline-flex" />
            <ThemeToggle className="site-header-theme" />
            <WalletConnectButton compact className="site-header-wallet" />
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={() => setOpen((o) => !o)}
              className="btn-icon inline-flex md:hidden"
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
            className="fixed inset-0 z-40 h-auto w-auto rounded-none bg-black/60 hover:bg-black/60 md:hidden"
            aria-label="Close menu"
            onClick={closeMenu}
          />
          <div className="site-mobile-menu md:hidden">
            <BalanceBreakdown className="site-mobile-menu-balance mb-3 w-full min-[520px]:hidden" />
            <SiteHeaderNav vertical onNavigate={closeMenu} className="mb-3" />
            <Link
              to="/guide"
              className="btn-how-it-works mb-3 w-full justify-center xl:hidden"
              onClick={closeMenu}
            >
              <HelpCircle className="h-3.5 w-3.5" />
              How it works?
            </Link>
          </div>
        </>
      )}

      <main
        className={cn(
          "site-main mx-auto flex w-full min-w-0 flex-1 flex-col px-[var(--page-px)] py-[var(--page-py)]",
          fullWidth ? "max-w-none" : "max-w-[var(--page-max)]",
          mainClassName,
        )}
      >
        <GsapPageEnter className={pageShellContent}>
          {children}
        </GsapPageEnter>
      </main>
      <SiteFooter />
      <WelcomeDialog />
    </div>
  );
}

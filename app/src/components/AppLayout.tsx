import { Outlet } from "@tanstack/react-router";
import { MobileBottomNav } from "@/components/MobileBottomNav";
import { SiteShell } from "@/components/SiteShell";

export function AppLayout() {
  return (
    <SiteShell mainClassName="pb-[calc(45px+env(safe-area-inset-bottom,0px))] md:pb-[var(--page-py)]">
      <Outlet />
      <MobileBottomNav />
    </SiteShell>
  );
}

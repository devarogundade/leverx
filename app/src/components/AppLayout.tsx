import { Outlet } from "@tanstack/react-router";
import { SiteShell } from "@/components/SiteShell";

export function AppLayout() {
  return (
    <SiteShell>
      <div className="animate-page-in flex min-h-0 flex-1 flex-col">
        <Outlet />
      </div>
    </SiteShell>
  );
}

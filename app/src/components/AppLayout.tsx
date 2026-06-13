import { Outlet } from "@tanstack/react-router";
import { SiteShell } from "@/components/SiteShell";

export function AppLayout() {
  return (
    <SiteShell>
      <Outlet />
    </SiteShell>
  );
}

import { Outlet } from "@tanstack/react-router";
import { AppSiteShell } from "@/components/AppSiteShell";

export function AppLayout() {
  return (
    <AppSiteShell>
      <Outlet />
    </AppSiteShell>
  );
}

import { Outlet } from "@tanstack/react-router";
import { SiteShell } from "@/components/SiteShell";

/** Trade terminal — full-width layout inside SiteShell. */
export function DetailLayout() {
  return (
    <SiteShell fullWidth>
      <div className="animate-page-in flex min-h-0 flex-1 flex-col">
        <Outlet />
      </div>
    </SiteShell>
  );
}

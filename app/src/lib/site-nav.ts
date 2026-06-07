import type { LucideIcon } from "lucide-react";
import { BookOpen, Landmark, LayoutGrid, Trophy, Wallet } from "lucide-react";

export interface SiteNavLink {
  label: string;
  icon: LucideIcon;
  to: string;
  isActive: (pathname: string) => boolean;
  external?: boolean;
}

export const SITE_NAV_LINKS: SiteNavLink[] = [
  {
    label: "Markets",
    icon: LayoutGrid,
    to: "/markets",
    isActive: (pathname) =>
      pathname.startsWith("/markets") || pathname.startsWith("/predictions"),
  },
  {
    label: "Portfolio",
    icon: Wallet,
    to: "/portfolio",
    isActive: (pathname) => pathname.startsWith("/portfolio"),
  },
  {
    label: "Vault",
    icon: Landmark,
    to: "/vault",
    isActive: (pathname) => pathname.startsWith("/vault"),
  },
  {
    label: "Points",
    icon: Trophy,
    to: "/points",
    isActive: (pathname) => pathname.startsWith("/points"),
  },
  {
    label: "Docs",
    icon: BookOpen,
    to: "/guide",
    isActive: (pathname) => pathname.startsWith("/guide"),
  },
];

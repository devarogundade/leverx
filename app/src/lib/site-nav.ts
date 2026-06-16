import type { LucideIcon } from "lucide-react";
import { BookOpen, Coins, LayoutGrid, Sparkles, Trophy, Wallet } from "lucide-react";

export interface SiteNavLink {
  type: "link";
  label: string;
  icon: LucideIcon;
  to: string;
  isActive: (pathname: string) => boolean;
  external?: boolean;
}

export interface SiteNavDropdownItem {
  label: string;
  to: string;
  hint?: string;
}

export interface SiteNavDropdown {
  type: "dropdown";
  label: string;
  icon: LucideIcon;
  isActive: (pathname: string) => boolean;
  items: SiteNavDropdownItem[];
}

export type SiteNavEntry = SiteNavLink | SiteNavDropdown;

export function isNavDropdown(entry: SiteNavEntry): entry is SiteNavDropdown {
  return entry.type === "dropdown";
}

export const SITE_NAV_ENTRIES: SiteNavEntry[] = [
  {
    type: "link",
    label: "Markets",
    icon: LayoutGrid,
    to: "/markets",
    isActive: (pathname) =>
      pathname.startsWith("/markets") || pathname.startsWith("/predictions"),
  },
  {
    type: "link",
    label: "Portfolio",
    icon: Wallet,
    to: "/portfolio",
    isActive: (pathname) => pathname.startsWith("/portfolio"),
  },
  {
    type: "link",
    label: "Jarvis",
    icon: Sparkles,
    to: "/jarvis",
    isActive: (pathname) => pathname.startsWith("/jarvis"),
  },
  {
    type: "link",
    label: "Pool",
    icon: Coins,
    to: "/vault",
    isActive: (pathname) => pathname.startsWith("/vault"),
  },
  {
    type: "link",
    label: "Points",
    icon: Trophy,
    to: "/points",
    isActive: (pathname) => pathname.startsWith("/points"),
  },
  {
    type: "link",
    label: "Guide",
    icon: BookOpen,
    to: "/guide",
    isActive: (pathname) => pathname.startsWith("/guide"),
  },
];

/** @deprecated Use SITE_NAV_ENTRIES */
export const SITE_NAV_LINKS = SITE_NAV_ENTRIES.filter(
  (e): e is SiteNavLink => e.type === "link",
);

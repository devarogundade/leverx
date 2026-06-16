import {
  LayoutGrid,
  Sparkles,
  Trophy,
  Wallet,
  Coins,
  type LucideIcon,
} from "lucide-react";

export type MobileNavItem = {
  label: string;
  icon: LucideIcon;
  to: string;
  isActive: (pathname: string) => boolean;
  /** Center hero tab (Jarvis). */
  featured?: boolean;
};

export const MOBILE_BOTTOM_NAV: MobileNavItem[] = [
  {
    label: "Markets",
    icon: LayoutGrid,
    to: "/markets",
    isActive: (pathname) =>
      pathname.startsWith("/markets") || pathname.startsWith("/predictions"),
  },
  {
    label: "Pool",
    icon: Coins,
    to: "/vault",
    isActive: (pathname) => pathname.startsWith("/vault"),
  },
  {
    label: "Jarvis",
    icon: Sparkles,
    to: "/jarvis",
    isActive: (pathname) => pathname.startsWith("/jarvis"),
    featured: true,
  },
  {
    label: "Points",
    icon: Trophy,
    to: "/points",
    isActive: (pathname) => pathname.startsWith("/points"),
  },
  {
    label: "Portfolio",
    icon: Wallet,
    to: "/portfolio",
    isActive: (pathname) => pathname.startsWith("/portfolio"),
  },
];

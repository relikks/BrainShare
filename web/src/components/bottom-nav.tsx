"use client";

import { MobileBottomNav, type BottomNavItem } from "@drekis/shader";
import { HardDrive, Search, Settings } from "lucide-react";
import Link from "next/link";
import type { Route } from "next";
import { usePathname } from "next/navigation";

/** Mobile bottom nav mirroring the primary areas — auto-hides on scroll (shader). */
export function BottomNav() {
  const pathname = usePathname();
  const items: BottomNavItem[] = [
    { key: "drive", label: "Drive", icon: HardDrive, href: "/", active: pathname === "/" || pathname.startsWith("/c/") },
    { key: "search", label: "Search", icon: Search, href: "/search", active: pathname.startsWith("/search") },
    { key: "settings", label: "Settings", icon: Settings, href: "/settings", active: pathname.startsWith("/settings") },
  ];
  return (
    <MobileBottomNav
      items={items}
      ariaLabel="Primary navigation"
      renderLink={(href, className, children) => (
        <Link href={href as Route} className={className}>
          {children}
        </Link>
      )}
    />
  );
}

"use client";

import { MobileBottomNav, type BottomNavItem } from "@drekis/shader";
import Link from "next/link";
import type { Route } from "next";
import { usePathname } from "next/navigation";
import { DOMAINS, domainForPath } from "@/lib/domains";

/** Mobile bottom nav mirroring the domains — auto-hides on scroll (shader). */
export function BottomNav() {
  const pathname = usePathname();
  const active = domainForPath(pathname).id;
  const items: BottomNavItem[] = DOMAINS.map((d) => ({
    key: d.id,
    label: d.label,
    icon: d.icon,
    href: d.href,
    active: d.id === active,
  }));
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

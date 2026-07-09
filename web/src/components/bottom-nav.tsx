"use client";

import { MobileBottomNav, type BottomNavItem } from "@drekis/shader";
import Link from "next/link";
import type { Route } from "next";
import { usePathname } from "next/navigation";
import { PRIMARY_DOMAINS, domainForPath } from "@/lib/domains";

/** Mobile bottom nav — the 5 primary domains only (CardForge keeps it small);
 *  the rest live in the /domains selector. Auto-hides on scroll (shader). */
export function BottomNav() {
  const pathname = usePathname();
  const active = domainForPath(pathname).id;
  const items: BottomNavItem[] = PRIMARY_DOMAINS.map((d) => ({
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

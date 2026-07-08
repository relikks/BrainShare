import { CalendarDays, FolderOpen, Inbox, Search, Users, type LucideIcon } from "lucide-react";
import type { Route } from "next";

// The platform's top-level areas. Every domain view always carries its own
// domain-adapted filter bar (CardForge pattern) — including the /domains selector.
export interface DomainDef {
  id: string;
  label: string;
  description: string;
  icon: LucideIcon;
  href: Route;
}

export const DOMAINS: DomainDef[] = [
  { id: "collections", label: "Collections", description: "Your collections & files", icon: FolderOpen, href: "/" as Route },
  { id: "search", label: "Search", description: "Semantic search across everything", icon: Search, href: "/search" as Route },
  { id: "people", label: "People", description: "People you've named", icon: Users, href: "/people" as Route },
  { id: "events", label: "Events", description: "Moments you've grouped", icon: CalendarDays, href: "/events" as Route },
  { id: "classify", label: "Classify", description: "Faces & voices to identify", icon: Inbox, href: "/classify" as Route },
];

export function domainForPath(pathname: string): DomainDef {
  if (pathname.startsWith("/search")) return DOMAINS[1];
  if (pathname.startsWith("/people")) return DOMAINS[2];
  if (pathname.startsWith("/events")) return DOMAINS[3];
  if (pathname.startsWith("/classify")) return DOMAINS[4];
  return DOMAINS[0]; // Collections (/, /c/...)
}

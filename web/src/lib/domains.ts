import {
  CalendarDays,
  CalendarRange,
  FolderOpen,
  Inbox,
  Search,
  Tags,
  Users,
  type LucideIcon,
} from "lucide-react";
import type { Route } from "next";

// The platform's top-level areas. Every domain view always carries its own
// domain-adapted filter bar (CardForge pattern) — including the /domains selector.
export interface DomainDef {
  id: string;
  label: string;
  description: string;
  icon: LucideIcon;
  href: Route;
  /** One of the 5 shown in the mobile bottom nav (the rest live in /domains). */
  primary?: boolean;
}

export const DOMAINS: DomainDef[] = [
  { id: "collections", label: "Collections", description: "Your collections & files", icon: FolderOpen, href: "/" as Route, primary: true },
  { id: "search", label: "Search", description: "Semantic search across everything", icon: Search, href: "/search" as Route, primary: true },
  { id: "people", label: "People", description: "People you've named", icon: Users, href: "/people" as Route, primary: true },
  { id: "events", label: "Events", description: "Moments you've grouped", icon: CalendarDays, href: "/events" as Route, primary: true },
  { id: "event-types", label: "Event types", description: "Kinds of events & their colours", icon: Tags, href: "/event-types" as Route },
  { id: "calendar", label: "Calendar", description: "Your events on a calendar", icon: CalendarRange, href: "/calendar" as Route, primary: true },
  { id: "classify", label: "Classify", description: "Faces & voices to identify", icon: Inbox, href: "/classify" as Route },
];

// The 5 most-important domains for the mobile bottom nav (CardForge keeps it to ~5);
// the rest (Event types, Classify) are reached via the /domains selector.
export const PRIMARY_DOMAINS = DOMAINS.filter((d) => d.primary);

const byId = (id: string): DomainDef => DOMAINS.find((d) => d.id === id) ?? DOMAINS[0];

export function domainForPath(pathname: string): DomainDef {
  if (pathname.startsWith("/search")) return byId("search");
  if (pathname.startsWith("/people")) return byId("people");
  if (pathname.startsWith("/event-types")) return byId("event-types");
  if (pathname.startsWith("/events")) return byId("events");
  if (pathname.startsWith("/calendar")) return byId("calendar");
  if (pathname.startsWith("/classify")) return byId("classify");
  return byId("collections"); // /, /c/...
}

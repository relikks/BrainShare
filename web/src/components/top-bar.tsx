"use client";

import {
  AppTopBar,
  Button,
  DomainChip,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  FilterBarButton,
  SearchBar,
} from "@drekis/shader";
import { Brain, ChevronDown, Moon, Plus, Sun, User } from "lucide-react";
import type { Route } from "next";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { createCollection } from "@/lib/api";
import { getUsername } from "@/lib/config";
import { domainForPath } from "@/lib/domains";

// Domains whose top-bar search FILTERS the in-page list live (via ?q=) instead of
// running a semantic search. Everything else routes to the Search domain.
const FILTER_DOMAINS = new Set(["people", "events", "event-types"]);

export function TopBar() {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();
  const [term, setTerm] = useState("");
  const [username, setUsername] = useState<string | null>(null);
  const [dark, setDark] = useState(false);

  useEffect(() => setUsername(getUsername()), [pathname]);
  useEffect(() => setTerm(sp.get("q") ?? ""), [sp]);

  useEffect(() => {
    const saved = localStorage.getItem("brainshare.theme") === "dark";
    setDark(saved);
    document.documentElement.setAttribute("data-theme", saved ? "dark" : "light");
  }, []);
  function toggleTheme() {
    const next = !dark;
    setDark(next);
    document.documentElement.setAttribute("data-theme", next ? "dark" : "light");
    localStorage.setItem("brainshare.theme", next ? "dark" : "light");
  }

  const domain = domainForPath(pathname);
  const isFilterDomain = FILTER_DOMAINS.has(domain.id);
  const placeholder = isFilterDomain
    ? `Search ${String(domain.label).toLowerCase()}…`
    : pathname.startsWith("/c/")
      ? sp.get("dir")
        ? "Search in this folder…"
        : "Search in this collection…"
      : "Search your knowledge…";

  // Filter domains reflect the query into ?q= on the current page (live list filter);
  // semantic domains keep the local term until submit routes to /search.
  function onQueryChange(v: string) {
    setTerm(v);
    if (isFilterDomain) {
      const params = new URLSearchParams(sp.toString());
      if (v.trim()) params.set("q", v);
      else params.delete("q");
      const qs = params.toString();
      router.replace((qs ? `${pathname}?${qs}` : pathname) as Route);
    }
  }

  function submit() {
    if (isFilterDomain) return; // already filtering live
    const v = term.trim();
    const params = new URLSearchParams();
    const onCollection = pathname.match(/^\/c\/([^/]+)/);
    const cid = onCollection ? onCollection[1] : sp.get("cid");
    const dir = sp.get("dir");
    if (cid) params.set("cid", cid);
    if (dir) params.set("dir", dir);
    if (v) params.set("q", v);
    router.push(`/search?${params.toString()}`);
  }

  async function newCollection() {
    const name = window.prompt("New collection name");
    if (!name?.trim()) return;
    const c = await createCollection(name.trim());
    router.push(`/c/${c.id}`);
  }

  const DomainIcon = domain.icon;
  // The chip opens the standardized /domains page (CardForge pattern), carrying which
  // domain you're on so it lands highlighted.
  const domainChip = (
    <DomainChip
      icon={DomainIcon}
      label={domain.label}
      onClick={() => router.push(`/domains?domain=${domain.id}`)}
    />
  );

  const userMenu = (
    <DropdownMenu>
      <DropdownMenuTrigger render={<Button variant="ghost" size="sm" className="gap-1.5 px-2 text-xs" />}>
        <div className="flex size-7 items-center justify-center rounded-full bg-muted">
          <User className="size-4" />
        </div>
        <span className="hidden md:inline">{username ?? "guest"}</span>
        <ChevronDown className="size-3 text-muted-foreground" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-48">
        <DropdownMenuItem onClick={toggleTheme}>
          {dark ? <Sun className="size-4" /> : <Moon className="size-4" />}
          {dark ? "Light theme" : "Dark theme"}
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem render={<Link href="/" />}>Collections</DropdownMenuItem>
        <DropdownMenuItem render={<Link href="/search" />}>Search</DropdownMenuItem>
        <DropdownMenuItem render={<Link href="/settings" />}>Settings</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );

  const plusAction = (
    <Button variant="ghost" size="sm" className="size-9 p-0" aria-label="New collection" onClick={newCollection}>
      <Plus className="size-5" />
    </Button>
  );

  return (
    <AppTopBar
      brand={
        <Link href="/" aria-label="BrainShare home">
          <span className="flex size-8 items-center justify-center rounded-xl bg-primary text-primary-foreground">
            <Brain className="size-5" />
          </span>
        </Link>
      }
      domains={domainChip}
      search={
        <SearchBar
          size="md"
          containerClassName="w-full"
          placeholder={placeholder}
          value={term}
          onValueChange={onQueryChange}
          onSubmit={submit}
        />
      }
      user={userMenu}
      primaryAction={plusAction}
      filter={<FilterBarButton />}
    />
  );
}

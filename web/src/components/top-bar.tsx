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
  SearchBar,
} from "@drekis/shader";
import {
  Brain,
  ChevronDown,
  Moon,
  Plus,
  SlidersHorizontal,
  Sun,
  User,
} from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { createCollection } from "@/lib/api";
import { getUsername } from "@/lib/config";
import { domainForPath } from "@/lib/domains";

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

  function submit() {
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

  // Mobile filter trigger — only meaningful on /search; toggles the ?filters sheet.
  function toggleFilters() {
    const params = new URLSearchParams(sp.toString());
    if (params.get("filters")) params.delete("filters");
    else params.set("filters", "1");
    router.push(`/search?${params.toString()}`);
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

  const filterButton = domain.id === "search" ? (
    <Button
      variant="ghost"
      size="sm"
      className="size-9 shrink-0 p-0 lg:hidden"
      aria-label="Filters"
      onClick={toggleFilters}
    >
      <SlidersHorizontal className="size-5" />
    </Button>
  ) : undefined;

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
          placeholder={
            pathname.startsWith("/c/")
              ? sp.get("dir")
                ? "Search in this folder…"
                : "Search in this collection…"
              : "Search your knowledge…"
          }
          value={term}
          onValueChange={setTerm}
          onSubmit={submit}
        />
      }
      user={userMenu}
      primaryAction={plusAction}
      filter={filterButton}
    />
  );
}

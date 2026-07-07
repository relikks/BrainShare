"use client";

import {
  AppTopBar,
  Button,
  Dialog,
  DialogContent,
  DomainChip,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  OptionPicker,
  SearchBar,
  cn,
} from "@drekis/shader";
import {
  Brain,
  ChevronDown,
  FolderPlus,
  HardDrive,
  Moon,
  Plus,
  Search as SearchIcon,
  SlidersHorizontal,
  Sun,
  User,
} from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { createCollection } from "@/lib/api";
import { getUsername } from "@/lib/config";

// BrainShare "domains" — the two top-level modes. The chip shows the current one and
// opens a menu to switch (the shared DomainChip pattern; CardForge opens a /domains page).
const DOMAINS = [
  { key: "drive", label: "Drive", icon: HardDrive, href: "/" as const, desc: "Your collections & files" },
  { key: "search", label: "Search", icon: SearchIcon, href: "/search" as const, desc: "Semantic search across everything" },
];

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

  const domain = pathname.startsWith("/search") ? DOMAINS[1] : DOMAINS[0];

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

  const [domainOpen, setDomainOpen] = useState(false);
  const DomainIcon = domain.icon;
  const domainChip = (
    <>
      <DomainChip icon={DomainIcon} label={domain.label} onClick={() => setDomainOpen(true)} />
      <Dialog open={domainOpen} onOpenChange={setDomainOpen}>
        <DialogContent className="gap-4 sm:max-w-md">
          <div className="text-base font-semibold">Go to</div>
          <OptionPicker
            options={DOMAINS.map((d) => ({ id: d.key, label: d.label, description: d.desc, icon: d.icon }))}
            current={domain.key}
            onSelect={(id) => {
              setDomainOpen(false);
              const d = DOMAINS.find((x) => x.key === id);
              if (d) router.push(d.href);
            }}
          />
        </DialogContent>
      </Dialog>
    </>
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

  const filterButton = domain.key === "search" ? (
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

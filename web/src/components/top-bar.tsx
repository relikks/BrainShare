"use client";

import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  Input,
  SidebarTrigger,
  cn,
  useHideOnScroll,
} from "@drekis/shader";
import { ChevronDown, Moon, Search, Sun, User, X } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { getUsername } from "@/lib/config";

export function TopBar() {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();
  const hidden = useHideOnScroll(true); // hide only after scrolling past the bar
  const inputRef = useRef<HTMLInputElement>(null);
  const [term, setTerm] = useState("");
  const [username, setUsername] = useState<string | null>(null);
  const [dark, setDark] = useState(false);

  useEffect(() => setUsername(getUsername()), [pathname]);
  useEffect(() => setTerm(sp.get("q") ?? ""), [sp]);

  // theme toggle (attribute-based, like cardforge)
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

  // ⌘K / Ctrl+K focuses search
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        inputRef.current?.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  function submit() {
    const v = term.trim();
    // carry the current scope: collection from a /c/<id> path, dir from ?dir
    const params = new URLSearchParams();
    const onCollection = pathname.match(/^\/c\/([^/]+)/);
    const cid = onCollection ? onCollection[1] : sp.get("cid");
    const dir = sp.get("dir");
    if (cid) params.set("cid", cid);
    if (dir) params.set("dir", dir);
    if (v) params.set("q", v);
    router.push(`/search?${params.toString()}`);
  }

  return (
    <header
      className={cn(
        "sticky top-0 z-30 flex h-14 items-center gap-2 border-b border-border bg-background px-3 transition-transform duration-300",
        hidden && "-translate-y-full",
      )}
    >
      <SidebarTrigger />

      <div className="relative flex h-10 max-w-2xl flex-1 items-center">
        <Search className="absolute left-3 size-4 text-muted-foreground" />
        <Input
          ref={inputRef}
          placeholder="Search your knowledge…"
          className="h-10 w-full pl-9 pr-16 text-sm"
          value={term}
          onChange={(e) => setTerm(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && submit()}
        />
        {term ? (
          <button
            type="button"
            aria-label="Clear"
            onClick={() => setTerm("")}
            className="absolute right-2 inline-flex size-7 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground lg:hidden"
          >
            <X className="size-4" />
          </button>
        ) : null}
        <kbd className="pointer-events-none absolute right-3 hidden h-5 select-none items-center gap-1 rounded border border-border bg-muted px-1.5 text-[10px] font-medium text-muted-foreground lg:inline-flex">
          <span>⌘</span>K
        </kbd>
      </div>

      <div className="ms-auto flex items-center gap-1">
        <Button variant="ghost" size="sm" className="size-9 p-0" onClick={toggleTheme}>
          {dark ? <Sun className="size-5" /> : <Moon className="size-5" />}
        </Button>
        <DropdownMenu>
          <DropdownMenuTrigger
            render={<Button variant="ghost" size="sm" className="gap-1.5 px-2 text-xs" />}
          >
            <div className="flex size-7 items-center justify-center rounded-full bg-muted">
              <User className="size-4" />
            </div>
            <span className="hidden md:inline">{username ?? "guest"}</span>
            <ChevronDown className="size-3 text-muted-foreground" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-48">
            <DropdownMenuItem render={<Link href="/" />}>Collections</DropdownMenuItem>
            <DropdownMenuItem render={<Link href="/search" />}>Search</DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem render={<Link href="/settings" />}>Settings</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}

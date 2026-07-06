"use client";

import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  SearchBar,
  SidebarTrigger,
  cn,
  useHideOnScroll,
} from "@drekis/shader";
import { ChevronDown, Moon, Sun, User } from "lucide-react";
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

      <SearchBar
        ref={inputRef}
        size="md"
        containerClassName="max-w-2xl flex-1"
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

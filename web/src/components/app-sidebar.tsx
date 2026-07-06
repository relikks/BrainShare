"use client";

import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
} from "@drekis/shader";
import { Brain, FolderOpen, House, Search, Settings } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { listCollections } from "@/lib/api";
import { getUuid } from "@/lib/config";
import type { Collection } from "@/lib/types";

const NAV = [
  { href: "/", label: "Home", icon: House },
  { href: "/search", label: "Search", icon: Search },
  { href: "/settings", label: "Settings", icon: Settings },
] as const;

// Collapsed rail = square icon tiles, centered, labels gone (CardForge pattern).
const NAV_BTN =
  "h-11 gap-3 rounded-2xl px-3 group-data-[collapsible=icon]:size-12! group-data-[collapsible=icon]:rounded-2xl! group-data-[collapsible=icon]:p-0! group-data-[collapsible=icon]:justify-center";
const NAV_LABEL = "group-data-[collapsible=icon]:hidden";

export function AppSidebar() {
  const [collections, setCollections] = useState<Collection[]>([]);

  useEffect(() => {
    if (!getUuid()) return;
    listCollections()
      .then(setCollections)
      .catch(() => setCollections([]));
  }, []);

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader className="pb-2">
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton
              size="lg"
              className="h-14 gap-3 rounded-2xl group-data-[collapsible=icon]:size-12! group-data-[collapsible=icon]:p-0! group-data-[collapsible=icon]:justify-center"
              render={<Link href="/" />}
            >
              {/* The mark; the collapsed rail keeps just the mark. */}
              <div className="flex aspect-square size-9 items-center justify-center rounded-xl bg-primary text-primary-foreground">
                <Brain className="size-5" />
              </div>
              <div className={`grid flex-1 text-left text-sm leading-tight ${NAV_LABEL}`}>
                <span className="font-semibold">BrainShare</span>
                <span className="truncate text-xs text-muted-foreground">
                  knowledge drive
                </span>
              </div>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>

      <SidebarContent className="gap-6 py-2">
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu className="gap-1">
              {NAV.map((n) => (
                <SidebarMenuItem key={n.href}>
                  <SidebarMenuButton
                    tooltip={n.label}
                    className={NAV_BTN}
                    render={<Link href={n.href} />}
                  >
                    <n.icon />
                    <span className={NAV_LABEL}>{n.label}</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        {collections.length > 0 && (
          <SidebarGroup>
            <SidebarGroupLabel>Collections</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu className="gap-1">
                {collections.map((c) => (
                  <SidebarMenuItem key={c.id}>
                    <SidebarMenuButton
                      tooltip={c.name}
                      className={NAV_BTN}
                      render={<Link href={`/c/${c.id}`} />}
                    >
                      <FolderOpen />
                      <span className={`truncate ${NAV_LABEL}`}>{c.name}</span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        )}
      </SidebarContent>
      <SidebarRail />
    </Sidebar>
  );
}

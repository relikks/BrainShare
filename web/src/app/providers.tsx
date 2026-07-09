"use client";

import {
  FilterBarProvider,
  ScrollDirectionProvider,
  SidebarInset,
  SidebarProvider,
  Toaster,
  TooltipProvider,
} from "@drekis/shader";
import { type CSSProperties, type ReactNode, Suspense } from "react";
import { AppSidebar } from "@/components/app-sidebar";
import { BottomNav } from "@/components/bottom-nav";
import { TopBar } from "@/components/top-bar";

export function Providers({ children }: { children: ReactNode }) {
  return (
    <TooltipProvider>
      {/* Collapsed rail by default, CardForge-style — expand via the rail/trigger. */}
      <SidebarProvider
        defaultOpen={false}
        style={
          {
            "--sidebar-width": "16rem",
            "--sidebar-width-icon": "4rem",
          } as CSSProperties
        }
      >
        <AppSidebar />
        {/* hideThreshold = top-bar height (h-14 = 56px): hide only after scrolling past it */}
        <ScrollDirectionProvider hideThreshold={56}>
          {/* Shared per-page filter-bar state: header button ↔ the page's filter sheet */}
          <FilterBarProvider>
            <SidebarInset>
              <Suspense fallback={<div className="h-14 shrink-0 border-b border-border" />}>
                <TopBar />
              </Suspense>
              {/* pb on mobile so content clears the fixed bottom nav */}
              <main className="flex-1 pb-14 lg:pb-0">{children}</main>
            </SidebarInset>
            <Suspense fallback={null}>
              <BottomNav />
            </Suspense>
          </FilterBarProvider>
        </ScrollDirectionProvider>
      </SidebarProvider>
      <Toaster />
    </TooltipProvider>
  );
}

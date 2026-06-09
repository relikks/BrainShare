"use client";

import {
  ScrollDirectionProvider,
  SidebarInset,
  SidebarProvider,
  Toaster,
  TooltipProvider,
} from "@drekis/shader";
import { type CSSProperties, type ReactNode, Suspense } from "react";
import { AppSidebar } from "@/components/app-sidebar";
import { TopBar } from "@/components/top-bar";

export function Providers({ children }: { children: ReactNode }) {
  return (
    <TooltipProvider>
      <SidebarProvider
        style={
          {
            "--sidebar-width": "16rem",
            "--sidebar-width-icon": "3.5rem",
          } as CSSProperties
        }
      >
        <AppSidebar />
        {/* hideThreshold = top-bar height (h-14 = 56px): hide only after scrolling past it */}
        <ScrollDirectionProvider hideThreshold={56}>
          <SidebarInset>
            <Suspense fallback={<div className="h-14 shrink-0 border-b border-border" />}>
              <TopBar />
            </Suspense>
            <main className="flex-1">{children}</main>
          </SidebarInset>
        </ScrollDirectionProvider>
      </SidebarProvider>
      <Toaster />
    </TooltipProvider>
  );
}

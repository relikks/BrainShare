"use client";

import { cn, useHideOnScroll } from "@drekis/shader";
import { SlidersHorizontal } from "lucide-react";
import { type ReactNode } from "react";

/**
 * FilterShell — the shared domain layout: a sticky, hide-on-scroll filter aside on the
 * left and the domain content on the right. Every domain view uses this so a
 * domain-adapted filter bar is ALWAYS present (CardForge pattern).
 */
export function FilterShell({
  filters,
  title = "Filters",
  children,
}: {
  filters: ReactNode;
  title?: ReactNode;
  children: ReactNode;
}) {
  const hidden = useHideOnScroll(true);
  return (
    <div className="flex w-full">
      <aside
        className={cn(
          "sticky hidden w-60 shrink-0 flex-col gap-5 overflow-y-auto border-r border-border bg-background px-4 py-5 transition-[top,height] duration-300 lg:flex",
          hidden ? "top-0 h-dvh" : "top-14 h-[calc(100dvh-3.5rem)]",
        )}
      >
        <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          <SlidersHorizontal className="size-3.5" /> {title}
        </div>
        {filters}
      </aside>
      <div className="min-w-0 flex-1 px-5 py-5">{children}</div>
    </div>
  );
}

"use client";

import { Button, FilterSheet, cn, useHideOnScroll } from "@drekis/shader";
import { SlidersHorizontal } from "lucide-react";
import { type ReactNode, useState } from "react";

/**
 * FilterShell — the shared domain layout: a sticky, hide-on-scroll filter aside on the
 * left (desktop) and the domain content on the right. On mobile the aside is replaced
 * by a "Filters" button that opens the same filters in a full-screen sheet, so the
 * per-domain filter bar is reachable everywhere. Pages with no filters just pass none
 * and get a plain full-width content column.
 */
export function FilterShell({
  filters,
  title = "Filters",
  children,
}: {
  filters?: ReactNode;
  title?: ReactNode;
  children: ReactNode;
}) {
  const hidden = useHideOnScroll(true);
  const [open, setOpen] = useState(false);
  const hasFilters = Boolean(filters);

  return (
    <div className="flex w-full">
      {hasFilters && (
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
      )}

      <div className="min-w-0 flex-1 px-5 py-5">
        {hasFilters && (
          <Button
            variant="outline"
            size="sm"
            className="mb-4 lg:hidden"
            onClick={() => setOpen(true)}
          >
            <SlidersHorizontal className="size-4" /> Filters
          </Button>
        )}
        {children}
      </div>

      {hasFilters && (
        <FilterSheet open={open} onClose={() => setOpen(false)} title={title} bottomInset="bottom-14">
          {filters}
        </FilterSheet>
      )}
    </div>
  );
}

"use client";

import { FilterSheet, cn, useFilterBar, useHideOnScroll } from "@drekis/shader";
import { SlidersHorizontal } from "lucide-react";
import { type ReactNode, useEffect } from "react";

/**
 * FilterShell — the shared domain layout: a sticky, hide-on-scroll filter aside on the
 * left (desktop) and the domain content on the right. On mobile the aside is replaced
 * by the standardized header Filters button (shader FilterBarButton) which opens these
 * same filters in a full-screen sheet. Pages with no filters pass none and get a plain
 * full-width content column (and no header button).
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
  const { open, setOpen, setHasFilters } = useFilterBar();
  const hasFilters = Boolean(filters);

  // Tell the shared top bar whether this page has filters (drives the header button).
  useEffect(() => {
    setHasFilters(hasFilters);
    return () => {
      setHasFilters(false);
      setOpen(false);
    };
  }, [hasFilters, setHasFilters, setOpen]);

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

      <div className="min-w-0 flex-1 px-5 py-5">{children}</div>

      {hasFilters && (
        <FilterSheet open={open} onClose={() => setOpen(false)} title={title} bottomInset="bottom-14">
          {filters}
        </FilterSheet>
      )}
    </div>
  );
}

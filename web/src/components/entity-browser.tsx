"use client";

import { Button, EmptyState, ViewModeToggle, cn } from "@drekis/shader";
import { Plus, type LucideIcon } from "lucide-react";
import { type ReactNode } from "react";
import { type DriveView, VIEW_OPTIONS } from "@/lib/use-view";

export interface EntityBrowserProps<T> {
  icon: LucideIcon;
  title: string;
  total: number;
  items: T[];
  getKey: (item: T) => string;
  view: DriveView;
  onViewChange: (v: DriveView) => void;
  onNew?: () => void;
  newLabel?: string;
  emptyTitle: string;
  emptyDescription: string;
  /** List-view column template (must match the header + row cells). */
  listCols: string;
  listHeader: ReactNode;
  renderRow: (item: T) => ReactNode;
  renderCard: (item: T, large: boolean) => ReactNode;
  /** grid columns per view (defaults tuned for entity cards). */
  gridColsGrid?: string;
  gridColsLarge?: string;
}

/**
 * EntityBrowser — the shared "section with 3 view modes" scaffold used by People,
 * Events and Event-types: a header (icon · title · count · New · ViewModeToggle)
 * over a list / grid / large-grid body. Each domain supplies only its row + card
 * renderers; the layout switching, toolbar and empty state are standardized here.
 */
export function EntityBrowser<T>({
  icon: Icon,
  title,
  total,
  items,
  getKey,
  view,
  onViewChange,
  onNew,
  newLabel = "New",
  emptyTitle,
  emptyDescription,
  listCols,
  listHeader,
  renderRow,
  renderCard,
  gridColsGrid = "grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5",
  gridColsLarge = "grid-cols-1 sm:grid-cols-2 lg:grid-cols-3",
}: EntityBrowserProps<T>) {
  const large = view === "large";
  return (
    <div>
      <div className="mb-5 flex flex-wrap items-center gap-2">
        <Icon className="size-5 text-primary" />
        <h1 className="text-lg font-semibold tracking-tight">{title}</h1>
        <span className="text-sm text-muted-foreground">{total}</span>
        <div className="ml-auto flex items-center gap-3">
          {onNew && (
            <Button size="sm" onClick={onNew}>
              <Plus className="size-4" /> {newLabel}
            </Button>
          )}
          <ViewModeToggle value={view} onChange={onViewChange} options={VIEW_OPTIONS} />
        </div>
      </div>

      {items.length === 0 ? (
        <EmptyState title={emptyTitle} description={emptyDescription} />
      ) : view === "list" ? (
        <div className="overflow-hidden rounded-lg border border-border">
          <div
            className={cn(
              "grid items-center gap-3 border-b border-border bg-muted/30 px-4 py-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground",
              listCols,
            )}
          >
            {listHeader}
          </div>
          {items.map((item) => (
            <div
              key={getKey(item)}
              className={cn(
                "group grid items-center gap-3 border-b border-border/50 px-4 py-2.5 text-sm transition-colors last:border-0 hover:bg-muted/40",
                listCols,
              )}
            >
              {renderRow(item)}
            </div>
          ))}
        </div>
      ) : (
        <div className={cn("grid gap-2.5", large ? gridColsLarge : gridColsGrid)}>
          {items.map((item) => (
            <div key={getKey(item)}>{renderCard(item, large)}</div>
          ))}
        </div>
      )}
    </div>
  );
}

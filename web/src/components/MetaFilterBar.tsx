"use client";

import {
  FilterField,
  toFilterPredicates,
  visibleFilterFields,
  type FilterBarState,
  type FilterFieldDef,
} from "@drekis/shader";
import {
  Clock,
  MoveHorizontal,
  MoveVertical,
  RectangleHorizontal,
  SlidersHorizontal,
  Type,
} from "lucide-react";

import type { MetaFilter, Modality } from "@/lib/types";

/** Per-field UI state — shader's FilterBarState, re-exported for existing call sites. */
export type FilterState = FilterBarState;

const iconCls = "size-3.5 text-muted-foreground";

// BrainShare's filterable-metadata catalogue, declared in shader's shared FilterFieldDef
// vocabulary. `tags` = the modalities a field applies to → the bar is "type-aware":
// it only shows a field while one of its modalities is active.
const FIELDS: FilterFieldDef[] = [
  { key: "duration_s", label: "Duration", unit: "s", icon: <Clock className={iconCls} />, tags: ["audio", "video"], kind: "range" },
  { key: "width", label: "Width", unit: "px", icon: <MoveHorizontal className={iconCls} />, tags: ["image", "video"], kind: "range" },
  { key: "height", label: "Height", unit: "px", icon: <MoveVertical className={iconCls} />, tags: ["image", "video"], kind: "range" },
  {
    key: "orientation",
    label: "Orientation",
    icon: <RectangleHorizontal className={iconCls} />,
    tags: ["image"],
    kind: "enum",
    options: [{ value: "landscape" }, { value: "portrait" }, { value: "square" }],
  },
  { key: "word_count", label: "Words", icon: <Type className={iconCls} />, tags: ["text"], kind: "range" },
];

/** Derive the backend MetaFilter[] from the UI state — only for fields visible under `active`. */
export function toMetaFilters(state: FilterState, active: Set<Modality>): MetaFilter[] {
  return toFilterPredicates(FIELDS, state, active).map((p) => ({
    field: p.field,
    op: p.op,
    value: p.value,
  }));
}

/** Dynamic, type-aware metadata filter section. Controlled by the parent — a thin
 *  adapter over shader's FilterField (the control rendering lives in the library). */
export function MetaFilterBar({
  active,
  value,
  onChange,
}: {
  active: Set<Modality>;
  value: FilterState;
  onChange: (next: FilterState) => void;
}) {
  const fields = visibleFilterFields(FIELDS, active);
  if (!fields.length) return null;

  return (
    <div>
      <div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        <SlidersHorizontal className="size-3.5" /> Filters
      </div>
      <div className="flex flex-col gap-3">
        {fields.map((f) => (
          <FilterField key={f.key} def={f} state={value} onChange={onChange} />
        ))}
      </div>
    </div>
  );
}

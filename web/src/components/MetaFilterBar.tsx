"use client";

import { toFilterPredicates, type FilterBarState, type FilterFieldDef } from "@drekis/shader";
import { Clock, MoveHorizontal, MoveVertical, RectangleHorizontal, Type } from "lucide-react";

import type { MetaFilter, Modality } from "@/lib/types";

/** Per-field UI state — shader's FilterBarState, re-exported for existing call sites. */
export type FilterState = FilterBarState;

const iconCls = "size-3.5 text-muted-foreground";

// BrainShare's filterable-metadata catalogue, declared in shader's shared FilterFieldDef
// vocabulary. `tags` = the modalities a field applies to. The search sidebar nests each
// field under its file type's checkbox (a field tagged for two types appears under both,
// sharing one state entry — it is a single filter).
// Range bounds are sensible platform defaults (data-driven per-scope ranges are a
// follow-up via a facets endpoint) — enough for the RangeSlider to be usable.
export const META_FIELDS: FilterFieldDef[] = [
  { key: "duration_s", label: "Duration", unit: "s", icon: <Clock className={iconCls} />, tags: ["audio", "video"], kind: "range", min: 0, max: 1800, step: 5 },
  { key: "width", label: "Width", unit: "px", icon: <MoveHorizontal className={iconCls} />, tags: ["image", "video"], kind: "range", min: 0, max: 4000, step: 10 },
  { key: "height", label: "Height", unit: "px", icon: <MoveVertical className={iconCls} />, tags: ["image", "video"], kind: "range", min: 0, max: 4000, step: 10 },
  {
    key: "orientation",
    label: "Orientation",
    icon: <RectangleHorizontal className={iconCls} />,
    tags: ["image"],
    kind: "enum",
    options: [{ value: "landscape" }, { value: "portrait" }, { value: "square" }],
  },
  { key: "word_count", label: "Words", icon: <Type className={iconCls} />, tags: ["text"], kind: "range", min: 0, max: 5000, step: 50 },
];

/** Fields that apply to one file type (what nests under its checkbox). */
export function metaFieldsFor(modality: Modality): FilterFieldDef[] {
  return META_FIELDS.filter((f) => f.tags?.includes(modality));
}

/** Derive the backend MetaFilter[] from the UI state — only for fields whose type is
 *  active, so a stale value behind a deactivated type never leaks into the query. */
export function toMetaFilters(state: FilterState, active: ReadonlySet<Modality>): MetaFilter[] {
  return toFilterPredicates(META_FIELDS, state, active).map((p) => ({
    field: p.field,
    op: p.op,
    value: p.value,
  }));
}

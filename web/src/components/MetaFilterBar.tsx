"use client";

import { Input, Label } from "@drekis/shader";

import type { MetaFilter, Modality } from "@/lib/types";

/** Per-field UI state: a numeric range (min/max → gte/lte) or a single enum pick (→ eq). */
export type FilterState = Record<string, { min?: string; max?: string; eq?: string }>;

type FieldDef = {
  field: string;
  label: string;
  modalities: Modality[];
  kind: "range" | "enum";
  unit?: string;
  options?: string[];
};

// The catalogue of filterable metadata fields, each tagged with the modalities it applies to.
// The bar only shows a field when at least one of its modalities is active → "type-aware".
const FIELDS: FieldDef[] = [
  { field: "duration_s", label: "Duration", unit: "s", modalities: ["audio", "video"], kind: "range" },
  { field: "width", label: "Width", unit: "px", modalities: ["image", "video"], kind: "range" },
  { field: "height", label: "Height", unit: "px", modalities: ["image", "video"], kind: "range" },
  {
    field: "orientation",
    label: "Orientation",
    modalities: ["image"],
    kind: "enum",
    options: ["landscape", "portrait", "square"],
  },
  { field: "word_count", label: "Words", modalities: ["text"], kind: "range" },
];

function visibleFields(active: Set<Modality>): FieldDef[] {
  return FIELDS.filter((f) => f.modalities.some((m) => active.has(m)));
}

/** Derive the backend MetaFilter[] from the UI state — only for fields visible under `active`. */
export function toMetaFilters(state: FilterState, active: Set<Modality>): MetaFilter[] {
  const out: MetaFilter[] = [];
  for (const f of visibleFields(active)) {
    const s = state[f.field];
    if (!s) continue;
    if (f.kind === "enum") {
      if (s.eq) out.push({ field: f.field, op: "eq", value: s.eq });
    } else {
      if (s.min !== undefined && s.min !== "") out.push({ field: f.field, op: "gte", value: Number(s.min) });
      if (s.max !== undefined && s.max !== "") out.push({ field: f.field, op: "lte", value: Number(s.max) });
    }
  }
  return out;
}

/** Dynamic, type-aware metadata filter section. Controlled by the parent. */
export function MetaFilterBar({
  active,
  value,
  onChange,
}: {
  active: Set<Modality>;
  value: FilterState;
  onChange: (next: FilterState) => void;
}) {
  const fields = visibleFields(active);
  if (!fields.length) return null;

  const patch = (field: string, part: { min?: string; max?: string; eq?: string }) =>
    onChange({ ...value, [field]: { ...value[field], ...part } });

  return (
    <div>
      <div className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        Filters
      </div>
      <div className="flex flex-col gap-3">
        {fields.map((f) => (
          <div key={f.field}>
            <Label className="text-xs">
              {f.label}
              {f.unit ? ` (${f.unit})` : ""}
            </Label>
            {f.kind === "range" ? (
              <div className="mt-1 flex items-center gap-1.5">
                <Input
                  type="number"
                  inputMode="numeric"
                  placeholder="min"
                  className="h-8"
                  value={value[f.field]?.min ?? ""}
                  onChange={(e) => patch(f.field, { min: e.target.value })}
                />
                <span className="text-muted-foreground">–</span>
                <Input
                  type="number"
                  inputMode="numeric"
                  placeholder="max"
                  className="h-8"
                  value={value[f.field]?.max ?? ""}
                  onChange={(e) => patch(f.field, { max: e.target.value })}
                />
              </div>
            ) : (
              <div className="mt-1 flex flex-wrap gap-1.5">
                {f.options!.map((o) => {
                  const on = value[f.field]?.eq === o;
                  return (
                    <button
                      key={o}
                      type="button"
                      onClick={() => patch(f.field, { eq: on ? undefined : o })}
                      className={`rounded-md border px-2 py-1 text-xs capitalize transition-colors ${
                        on
                          ? "border-primary bg-primary/10 text-primary"
                          : "border-border text-muted-foreground hover:bg-muted"
                      }`}
                    >
                      {o}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

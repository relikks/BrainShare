"use client";

import { Calendar, type CalendarEvent, cn } from "@drekis/shader";
import { CalendarRange } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { FilterShell } from "@/components/filter-shell";
import { EventDialog } from "@/app/events/page";
import { type EntityOut, listEntities } from "@/lib/api";
import { getUuid } from "@/lib/config";

const str = (e: EntityOut, k: string): string => (typeof e.meta?.[k] === "string" ? (e.meta[k] as string) : "");
const parseDay = (iso: string): Date | null => {
  if (!iso) return null;
  const d = new Date(`${iso}T00:00:00`);
  return Number.isNaN(d.getTime()) ? null : d;
};
const toISO = (d: Date): string =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

export default function CalendarPage() {
  const [events, setEvents] = useState<EntityOut[]>([]);
  const [types, setTypes] = useState<EntityOut[]>([]);
  const [month, setMonth] = useState<Date | null>(null);
  const [activeTypes, setActiveTypes] = useState<Set<string>>(new Set());
  const [editing, setEditing] = useState<EntityOut | null | { date: string }>(null);

  useEffect(() => setMonth(new Date()), []);
  const load = () => {
    if (!getUuid()) return;
    listEntities("event").then(setEvents).catch(() => setEvents([]));
    listEntities("event_type").then(setTypes).catch(() => setTypes([]));
  };
  useEffect(load, []);

  const typeById = useMemo(() => new Map(types.map((t) => [t.id, t])), [types]);

  const calEvents: CalendarEvent[] = useMemo(() => {
    const out: CalendarEvent[] = [];
    for (const e of events) {
      if (activeTypes.size > 0 && !activeTypes.has(str(e, "event_type_id"))) continue;
      const start = parseDay(str(e, "start"));
      if (!start) continue;
      const end = parseDay(str(e, "end"));
      const t = typeById.get(str(e, "event_type_id"));
      const color = t && typeof t.meta?.color === "string" ? (t.meta.color as string) : null;
      out.push({ id: e.id, title: e.name, start, end, color });
    }
    return out;
  }, [events, activeTypes, typeById]);

  const toggleType = (id: string) => {
    setActiveTypes((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const editingEvent = editing && "id" in editing ? (editing as EntityOut) : null;
  const editingDate = editing && "date" in editing ? (editing.date as string) : undefined;

  return (
    <FilterShell
      filters={
        <div className="flex flex-col gap-3">
          <span className="text-xs text-muted-foreground">Filter by type</span>
          {types.length === 0 ? (
            <span className="text-xs text-muted-foreground">No event types yet.</span>
          ) : (
            <div className="flex flex-col gap-1.5">
              {types.map((t) => {
                const on = activeTypes.has(t.id);
                const color = typeof t.meta?.color === "string" ? (t.meta.color as string) : "var(--primary)";
                return (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => toggleType(t.id)}
                    className={cn(
                      "flex items-center gap-2 rounded-md px-2 py-1.5 text-sm transition-colors",
                      on ? "bg-primary/10 text-foreground" : "text-muted-foreground hover:bg-muted",
                    )}
                  >
                    <span className="size-3 shrink-0 rounded-full" style={{ backgroundColor: color }} />
                    <span className="truncate">{t.name}</span>
                  </button>
                );
              })}
              {activeTypes.size > 0 && (
                <button
                  type="button"
                  onClick={() => setActiveTypes(new Set())}
                  className="mt-1 text-left text-xs text-primary hover:underline"
                >
                  Clear filter
                </button>
              )}
            </div>
          )}
        </div>
      }
    >
      <div className="mb-4 flex items-center gap-2">
        <CalendarRange className="size-5 text-primary" />
        <h1 className="text-lg font-semibold tracking-tight">Calendar</h1>
        <span className="text-sm text-muted-foreground">{calEvents.length}</span>
      </div>

      {month && (
        <Calendar
          month={month}
          onMonthChange={setMonth}
          events={calEvents}
          onSelectDate={(d) => setEditing({ date: toISO(d) })}
          onSelectEvent={(id) => {
            const e = events.find((x) => x.id === id);
            if (e) setEditing(e);
          }}
        />
      )}

      {editing !== null && (
        <EventDialog
          event={editingEvent}
          types={types}
          defaultDate={editingDate}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            load();
          }}
        />
      )}
    </FilterShell>
  );
}

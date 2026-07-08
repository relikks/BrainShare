"use client";

import { cn, toast } from "@drekis/shader";
import { CalendarRange } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { EventDialog, type EventSlot } from "@/app/events/page";
import { EventCalendar } from "@/components/event-calendar";
import { FilterShell } from "@/components/filter-shell";
import { type EntityOut, listEntities, updateEntity } from "@/lib/api";
import { getUuid } from "@/lib/config";
import { emeta } from "@/lib/events";

type Editing = EntityOut | { slot: EventSlot } | null;

export default function CalendarPage() {
  const [events, setEvents] = useState<EntityOut[]>([]);
  const [types, setTypes] = useState<EntityOut[]>([]);
  const [activeTypes, setActiveTypes] = useState<Set<string>>(new Set());
  const [editing, setEditing] = useState<Editing>(null);

  const load = () => {
    if (!getUuid()) return;
    listEntities("event").then(setEvents).catch(() => setEvents([]));
    listEntities("event_type").then(setTypes).catch(() => setTypes([]));
  };
  useEffect(load, []);

  const typeById = useMemo(() => new Map(types.map((t) => [t.id, t])), [types]);
  const shown = useMemo(
    () =>
      events.filter((e) => activeTypes.size === 0 || activeTypes.has(emeta(e, "event_type_id"))),
    [events, activeTypes],
  );

  const toggleType = (id: string) => {
    setActiveTypes((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  async function onEventChange(id: string, start: string, end: string, allDay: boolean) {
    const e = events.find((x) => x.id === id);
    if (!e) return;
    try {
      await updateEntity(id, { name: e.name, meta: { ...e.meta, start, end, all_day: allDay } });
      toast.success("Event moved");
    } catch (err) {
      toast.error(String((err as Error).message));
    } finally {
      load();
    }
  }

  const editingEvent = editing && "id" in editing ? editing : null;
  const editingSlot = editing && "slot" in editing ? editing.slot : undefined;

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
        <span className="text-sm text-muted-foreground">{shown.length}</span>
      </div>

      <EventCalendar
        events={shown}
        typeById={typeById}
        onCreate={(slot) => setEditing({ slot })}
        onEditEvent={(id) => {
          const e = events.find((x) => x.id === id);
          if (e) setEditing(e);
        }}
        onEventChange={onEventChange}
      />

      {editing !== null && (
        <EventDialog
          event={editingEvent}
          types={types}
          slot={editingSlot}
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

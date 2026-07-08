"use client";

import { type CalendarEvent, type CalendarView, EventCalendar, cn, toast } from "@drekis/shader";
import { CalendarRange } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { EventDialog, type EventSlot } from "@/app/events/page";
import { FilterShell } from "@/components/filter-shell";
import { type EntityOut, deleteEntity, listEntities, updateEntity } from "@/lib/api";
import { getUuid } from "@/lib/config";
import { emeta, eventColor, isAllDay } from "@/lib/events";

type Editing = EntityOut | { slot: EventSlot } | null;

const parse = (iso: string): Date | null => {
  if (!iso) return null;
  const d = new Date(iso.includes("T") ? iso : `${iso}T00:00:00`);
  return Number.isNaN(d.getTime()) ? null : d;
};
const toMeta = (d: Date, allDay: boolean): string => {
  const p = (n: number) => String(n).padStart(2, "0");
  const date = `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
  return allDay ? date : `${date}T${p(d.getHours())}:${p(d.getMinutes())}`;
};

export default function CalendarPage() {
  const [events, setEvents] = useState<EntityOut[]>([]);
  const [types, setTypes] = useState<EntityOut[]>([]);
  const [activeTypes, setActiveTypes] = useState<Set<string>>(new Set());
  const [editing, setEditing] = useState<Editing>(null);
  const [view, setView] = useState<CalendarView>("month");
  const [date, setDate] = useState<Date | null>(null);

  useEffect(() => setDate(new Date()), []);
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
      if (activeTypes.size > 0 && !activeTypes.has(emeta(e, "event_type_id"))) continue;
      const start = parse(emeta(e, "start"));
      if (!start) continue;
      const t = typeById.get(emeta(e, "event_type_id"));
      out.push({
        id: e.id,
        title: e.name,
        start,
        end: parse(emeta(e, "end") || emeta(e, "start")),
        allDay: isAllDay(e),
        color: t ? eventColor(t) : null,
      });
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

  async function onMoveEvent(id: string, start: Date, end: Date | null, allDay: boolean) {
    const e = events.find((x) => x.id === id);
    if (!e) return;
    try {
      await updateEntity(id, {
        name: e.name,
        meta: {
          ...e.meta,
          start: toMeta(start, allDay),
          end: toMeta(end ?? start, allDay),
          all_day: allDay,
        },
      });
      toast.success("Event moved");
    } catch (err) {
      toast.error(String((err as Error).message));
    } finally {
      load();
    }
  }

  async function onDeleteEvent(id: string) {
    try {
      await deleteEntity(id);
      toast.success("Event deleted");
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
        <span className="text-sm text-muted-foreground">{calEvents.length}</span>
      </div>

      {date && (
        <EventCalendar
          events={calEvents}
          view={view}
          onViewChange={setView}
          date={date}
          onDateChange={setDate}
          onCreate={(info) =>
            setEditing({
              slot: {
                start: toMeta(info.start, info.allDay),
                end: info.end ? toMeta(info.end, info.allDay) : undefined,
                allDay: info.allDay,
              },
            })
          }
          onSelectEvent={(id) => {
            const e = events.find((x) => x.id === id);
            if (e) setEditing(e);
          }}
          onDeleteEvent={onDeleteEvent}
          onMoveEvent={onMoveEvent}
        />
      )}

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

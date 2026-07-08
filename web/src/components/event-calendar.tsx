"use client";

import type { DateSelectArg, EventClickArg, EventInput } from "@fullcalendar/core";
import dayGridPlugin from "@fullcalendar/daygrid";
import interactionPlugin, { type DateClickArg } from "@fullcalendar/interaction";
import FullCalendar from "@fullcalendar/react";
import timeGridPlugin from "@fullcalendar/timegrid";
import { useMemo, useRef } from "react";
import type { EntityOut } from "@/lib/api";
import { emeta, eventColor, isAllDay } from "@/lib/events";

export interface NewEventSlot {
  start: string; // ISO date or datetime
  end?: string;
  allDay: boolean;
}

/** Local ISO — "YYYY-MM-DD" for all-day, "YYYY-MM-DDTHH:mm" for timed. */
function toMeta(d: Date, allDay: boolean): string {
  const p = (n: number) => String(n).padStart(2, "0");
  const date = `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
  return allDay ? date : `${date}T${p(d.getHours())}:${p(d.getMinutes())}`;
}
function addDays(iso: string, n: number): string {
  const d = new Date(`${iso}T00:00:00`);
  d.setDate(d.getDate() + n);
  return toMeta(d, true);
}

export function EventCalendar({
  events,
  typeById,
  onCreate,
  onEditEvent,
  onEventChange,
}: {
  events: EntityOut[];
  typeById: Map<string, EntityOut>;
  onCreate: (slot: NewEventSlot) => void;
  onEditEvent: (id: string) => void;
  onEventChange: (id: string, start: string, end: string, allDay: boolean) => void;
}) {
  const ref = useRef<FullCalendar>(null);

  const fcEvents: EventInput[] = useMemo(
    () =>
      events.flatMap((e) => {
        const start = emeta(e, "start");
        if (!start) return [];
        const allDay = isAllDay(e);
        let end = emeta(e, "end") || start;
        // FullCalendar treats all-day `end` as exclusive; our stored end is inclusive.
        if (allDay && end) end = addDays(end, 1);
        const color = eventColor(typeById.get(emeta(e, "event_type_id")));
        return [
          {
            id: e.id,
            title: e.name,
            start,
            end,
            allDay,
            backgroundColor: color,
            borderColor: color,
          },
        ];
      }),
    [events, typeById],
  );

  const dateClick = (info: DateClickArg) => {
    // In month view a day-click drills into that day's hourly grid; in the time
    // grids a slot-click starts a new event at that moment.
    if (info.view.type === "dayGridMonth") {
      ref.current?.getApi().changeView("timeGridDay", info.dateStr);
    } else {
      onCreate({ start: info.dateStr, allDay: info.allDay });
    }
  };

  const select = (info: DateSelectArg) => {
    if (info.view.type === "dayGridMonth" && !info.allDay) return;
    onCreate({
      start: toMeta(info.start, info.allDay),
      end: toMeta(info.allDay ? new Date(info.end.getTime() - 1) : info.end, info.allDay),
      allDay: info.allDay,
    });
  };

  const commit = (arg: { event: EventClickArg["event"] }) => {
    const ev = arg.event;
    if (!ev.start) return;
    const allDay = ev.allDay;
    const start = toMeta(ev.start, allDay);
    // Convert FullCalendar's exclusive all-day end back to an inclusive date.
    const endDate = ev.end ?? ev.start;
    const end = allDay ? addDays(toMeta(endDate, true), -1) : toMeta(endDate, false);
    onEventChange(ev.id, start, end, allDay);
  };

  return (
    <div className="bs-fc h-[calc(100dvh-11rem)] min-h-[500px]">
      <FullCalendar
        ref={ref}
        plugins={[dayGridPlugin, timeGridPlugin, interactionPlugin]}
        initialView="dayGridMonth"
        headerToolbar={{
          left: "prev,next today",
          center: "title",
          right: "dayGridMonth,timeGridWeek,timeGridDay",
        }}
        height="100%"
        expandRows
        nowIndicator
        dayMaxEvents={3}
        firstDay={1}
        editable
        selectable
        selectMirror
        events={fcEvents}
        dateClick={dateClick}
        select={select}
        eventClick={(info: EventClickArg) => onEditEvent(info.event.id)}
        eventDrop={commit}
        eventResize={commit}
      />
      <CalendarTheme />
    </div>
  );
}

/** Maps FullCalendar's CSS variables onto our design tokens (purple accent). */
function CalendarTheme() {
  return (
    <style>{`
.bs-fc .fc {
  --fc-border-color: var(--border);
  --fc-page-bg-color: transparent;
  --fc-neutral-bg-color: color-mix(in oklab, var(--muted) 60%, transparent);
  --fc-today-bg-color: color-mix(in oklab, var(--primary) 8%, transparent);
  --fc-now-indicator-color: var(--primary);
  --fc-event-text-color: #fff;
  font-size: 0.85rem;
}
.bs-fc .fc .fc-toolbar-title { font-size: 1.05rem; font-weight: 600; }
.bs-fc .fc .fc-col-header-cell-cushion,
.bs-fc .fc .fc-daygrid-day-number { color: var(--muted-foreground); text-decoration: none; }
.bs-fc .fc .fc-daygrid-day.fc-day-today .fc-daygrid-day-number { color: var(--primary); font-weight: 600; }
.bs-fc .fc-theme-standard td, .bs-fc .fc-theme-standard th { border-color: var(--border); }
.bs-fc .fc .fc-button {
  background: var(--muted);
  border-color: var(--border);
  color: var(--foreground);
  font-weight: 500;
  font-size: 0.8rem;
  padding: 0.35rem 0.7rem;
  text-transform: capitalize;
  box-shadow: none;
}
.bs-fc .fc .fc-button:hover { background: color-mix(in oklab, var(--muted) 70%, var(--foreground) 10%); }
.bs-fc .fc .fc-button:focus { box-shadow: 0 0 0 2px color-mix(in oklab, var(--primary) 40%, transparent); }
.bs-fc .fc .fc-button-primary:not(:disabled).fc-button-active,
.bs-fc .fc .fc-button-primary:not(:disabled):active {
  background: var(--primary);
  border-color: var(--primary);
  color: var(--primary-foreground);
}
.bs-fc .fc .fc-button-primary:disabled { opacity: 0.5; }
.bs-fc .fc .fc-event { border-radius: 4px; padding: 1px 2px; font-weight: 500; cursor: pointer; }
.bs-fc .fc .fc-daygrid-event { padding-inline: 4px; }
.bs-fc .fc .fc-timegrid-slot { height: 2.2em; }
.bs-fc .fc-highlight { background: color-mix(in oklab, var(--primary) 15%, transparent); }
    `}</style>
  );
}

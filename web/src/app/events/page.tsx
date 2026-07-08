"use client";

import {
  Button,
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
  SearchBar,
  Switch,
  Textarea,
  toast,
} from "@drekis/shader";
import { CalendarDays, Trash2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { EntityBrowser } from "@/components/entity-browser";
import { FilterShell } from "@/components/filter-shell";
import {
  type EntityOut,
  createEntity,
  deleteEntity,
  listEntities,
  updateEntity,
} from "@/lib/api";
import { getUuid } from "@/lib/config";
import { emeta, eventColor, fmtWhen, isAllDay } from "@/lib/events";
import { useView } from "@/lib/use-view";

export interface EventSlot {
  start: string;
  end?: string;
  allDay: boolean;
}

const LIST_COLS =
  "grid-cols-[1fr_36px] sm:grid-cols-[1fr_130px_36px] md:grid-cols-[1fr_150px_190px_36px]";

export default function EventsPage() {
  const [events, setEvents] = useState<EntityOut[]>([]);
  const [types, setTypes] = useState<EntityOut[]>([]);
  const [q, setQ] = useState("");
  const [view, setView] = useView("bs-events-view");
  const [editing, setEditing] = useState<EntityOut | null | "new">(null);

  const load = () => {
    if (!getUuid()) return;
    listEntities("event").then(setEvents).catch(() => setEvents([]));
    listEntities("event_type").then(setTypes).catch(() => setTypes([]));
  };
  useEffect(load, []);

  const typeById = useMemo(() => new Map(types.map((t) => [t.id, t])), [types]);
  const filtered = useMemo(
    () => events.filter((e) => e.name.toLowerCase().includes(q.trim().toLowerCase())),
    [events, q],
  );

  async function remove(e: EntityOut) {
    try {
      await deleteEntity(e.id);
      toast.success(`Removed ${e.name}`);
      load();
    } catch (err) {
      toast.error(String((err as Error).message));
    }
  }

  const typeOf = (e: EntityOut) => typeById.get(emeta(e, "event_type_id"));

  return (
    <FilterShell
      filters={
        <div className="flex flex-col gap-2">
          <span className="text-xs text-muted-foreground">Find an event</span>
          <SearchBar value={q} onValueChange={setQ} placeholder="Search events…" size="sm" />
        </div>
      }
    >
      <EntityBrowser
        icon={CalendarDays}
        title="Events"
        total={events.length}
        items={filtered}
        getKey={(e) => e.id}
        view={view}
        onViewChange={setView}
        onNew={() => setEditing("new")}
        newLabel="New event"
        emptyTitle={events.length ? "No matches" : "No events yet"}
        emptyDescription="Create an event with a date and type."
        listCols={LIST_COLS}
        listHeader={
          <>
            <span>Name</span>
            <span className="hidden sm:block">Type</span>
            <span className="hidden md:block">When</span>
            <span />
          </>
        }
        renderRow={(e) => {
          const t = typeOf(e);
          return (
            <>
              <button
                type="button"
                onClick={() => setEditing(e)}
                className="flex min-w-0 items-center gap-2.5 text-left"
              >
                <span className="size-2.5 shrink-0 rounded-full" style={{ backgroundColor: eventColor(t) }} />
                <span className="truncate font-medium">{e.name}</span>
              </button>
              <span className="hidden truncate text-muted-foreground sm:block">{t?.name ?? "—"}</span>
              <span className="hidden text-muted-foreground md:block">{fmtWhen(e)}</span>
              <button
                type="button"
                aria-label={`Delete ${e.name}`}
                onClick={() => remove(e)}
                className="flex size-7 items-center justify-center rounded-md text-muted-foreground opacity-0 transition hover:text-destructive group-hover:opacity-100"
              >
                <Trash2 className="size-4" />
              </button>
            </>
          );
        }}
        renderCard={(e, large) => {
          const t = typeOf(e);
          return (
            <div
              onClick={() => setEditing(e)}
              className="group relative flex h-full cursor-pointer flex-col gap-2 overflow-hidden rounded-xl border border-border bg-card p-4 transition-colors hover:border-primary"
            >
              <span className="absolute inset-y-0 left-0 w-1" style={{ backgroundColor: eventColor(t) }} />
              <div className="flex items-center gap-2 pl-1">
                <span className="truncate text-sm font-semibold">{e.name}</span>
              </div>
              <div className="pl-1 text-xs text-muted-foreground">{fmtWhen(e)}</div>
              {t && (
                <span
                  className="ml-1 w-fit rounded-full px-2 py-0.5 text-[11px] font-medium"
                  style={{
                    backgroundColor: `color-mix(in oklab, ${eventColor(t)} 18%, transparent)`,
                    color: eventColor(t),
                  }}
                >
                  {t.name}
                </span>
              )}
              {large && emeta(e, "description") && (
                <p className="line-clamp-3 pl-1 text-xs text-muted-foreground">{emeta(e, "description")}</p>
              )}
              <button
                type="button"
                aria-label={`Delete ${e.name}`}
                onClick={(ev) => {
                  ev.stopPropagation();
                  remove(e);
                }}
                className="absolute right-2 top-2 flex size-7 items-center justify-center rounded-md bg-background/80 text-muted-foreground opacity-0 backdrop-blur transition hover:text-destructive group-hover:opacity-100"
              >
                <Trash2 className="size-4" />
              </button>
            </div>
          );
        }}
      />

      {editing !== null && (
        <EventDialog
          event={editing === "new" ? null : editing}
          types={types}
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

const todayISO = () => {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
};

export function EventDialog({
  event,
  types,
  slot,
  onClose,
  onSaved,
}: {
  event: EntityOut | null;
  types: EntityOut[];
  slot?: EventSlot;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState(event?.name ?? "");
  const [description, setDescription] = useState(event ? emeta(event, "description") : "");
  const [allDay, setAllDay] = useState(event ? isAllDay(event) : (slot?.allDay ?? true));
  const [start, setStart] = useState(event ? emeta(event, "start") : (slot?.start ?? todayISO()));
  const [end, setEnd] = useState(
    event ? emeta(event, "end") || emeta(event, "start") : (slot?.end ?? slot?.start ?? todayISO()),
  );
  const [typeId, setTypeId] = useState(event ? emeta(event, "event_type_id") : "");
  const [busy, setBusy] = useState(false);

  function toggleAllDay(next: boolean) {
    if (next) {
      setStart((s) => s.slice(0, 10));
      setEnd((e) => e.slice(0, 10));
    } else {
      setStart((s) => (s.includes("T") ? s : `${s.slice(0, 10)}T09:00`));
      setEnd((e) => (e.includes("T") ? e : `${(e || start).slice(0, 10)}T10:00`));
    }
    setAllDay(next);
  }

  async function save() {
    if (!name.trim()) return;
    setBusy(true);
    try {
      const norm = (v: string) => (allDay ? v.slice(0, 10) : v);
      const meta = {
        ...(event?.meta ?? {}),
        description: description.trim(),
        start: norm(start),
        end: norm(end || start),
        all_day: allDay,
        event_type_id: typeId,
      };
      if (event) await updateEntity(event.id, { name: name.trim(), meta });
      else await createEntity("event", name.trim(), meta);
      toast.success(event ? "Updated" : "Event created");
      onSaved();
    } catch (e) {
      toast.error(String((e as Error).message));
    } finally {
      setBusy(false);
    }
  }

  const inputType = allDay ? "date" : "datetime-local";

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{event ? "Edit event" : "New event"}</DialogTitle>
        </DialogHeader>

        <div className="flex flex-col gap-4">
          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground">Name</label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Event name" />
          </div>

          <label className="flex items-center justify-between rounded-md border border-border px-3 py-2">
            <span className="text-sm">All day</span>
            <Switch checked={allDay} onCheckedChange={toggleAllDay} />
          </label>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-muted-foreground">Start</label>
              <Input type={inputType} value={start} onChange={(e) => setStart(e.target.value)} />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-muted-foreground">End</label>
              <Input type={inputType} value={end} onChange={(e) => setEnd(e.target.value)} />
            </div>
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground">Type</label>
            <select
              value={typeId}
              onChange={(e) => setTypeId(e.target.value)}
              className="h-9 w-full rounded-md border border-border bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <option value="">No type</option>
              {types.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground">Description</label>
            <Textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="What happened…"
              rows={3}
            />
          </div>
        </div>

        <DialogFooter className="sm:justify-between">
          {event ? (
            <Button
              variant="ghost"
              className="text-destructive hover:text-destructive"
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                try {
                  await deleteEntity(event.id);
                  toast.success("Event deleted");
                  onSaved();
                } catch (e) {
                  toast.error(String((e as Error).message));
                  setBusy(false);
                }
              }}
            >
              <Trash2 className="size-4" /> Delete
            </Button>
          ) : (
            <span />
          )}
          <div className="flex gap-2">
            <Button variant="outline" onClick={onClose} disabled={busy}>
              Cancel
            </Button>
            <Button onClick={save} disabled={busy || !name.trim()}>
              {event ? "Save" : "Create event"}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

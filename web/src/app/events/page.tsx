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
import { useView } from "@/lib/use-view";

const str = (e: EntityOut, k: string): string => (typeof e.meta?.[k] === "string" ? (e.meta[k] as string) : "");
const typeColor = (t?: EntityOut): string =>
  t && typeof t.meta?.color === "string" ? (t.meta.color as string) : "var(--primary)";

function fmtDate(iso: string): string {
  if (!iso) return "";
  const d = new Date(`${iso}T00:00:00`);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}
function fmtRange(start: string, end: string): string {
  if (!start && !end) return "No date";
  if (start && end && start !== end) return `${fmtDate(start)} – ${fmtDate(end)}`;
  return fmtDate(start || end);
}

const LIST_COLS =
  "grid-cols-[1fr_36px] sm:grid-cols-[1fr_130px_36px] md:grid-cols-[1fr_150px_170px_36px]";

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

  const typeOf = (e: EntityOut) => typeById.get(str(e, "event_type_id"));

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
                <span
                  className="size-2.5 shrink-0 rounded-full"
                  style={{ backgroundColor: typeColor(t) }}
                />
                <span className="truncate font-medium">{e.name}</span>
              </button>
              <span className="hidden truncate text-muted-foreground sm:block">{t?.name ?? "—"}</span>
              <span className="hidden text-muted-foreground md:block">
                {fmtRange(str(e, "start"), str(e, "end"))}
              </span>
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
              <span
                className="absolute inset-y-0 left-0 w-1"
                style={{ backgroundColor: typeColor(t) }}
              />
              <div className="flex items-center gap-2 pl-1">
                <span className="truncate text-sm font-semibold">{e.name}</span>
              </div>
              <div className="pl-1 text-xs text-muted-foreground">
                {fmtRange(str(e, "start"), str(e, "end"))}
              </div>
              {t && (
                <span
                  className="ml-1 w-fit rounded-full px-2 py-0.5 text-[11px] font-medium"
                  style={{
                    backgroundColor: `color-mix(in oklab, ${typeColor(t)} 18%, transparent)`,
                    color: typeColor(t),
                  }}
                >
                  {t.name}
                </span>
              )}
              {large && str(e, "description") && (
                <p className="line-clamp-3 pl-1 text-xs text-muted-foreground">{str(e, "description")}</p>
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

export function EventDialog({
  event,
  types,
  defaultDate,
  onClose,
  onSaved,
}: {
  event: EntityOut | null;
  types: EntityOut[];
  defaultDate?: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState(event?.name ?? "");
  const [description, setDescription] = useState(event ? str(event, "description") : "");
  const [start, setStart] = useState(event ? str(event, "start") : (defaultDate ?? ""));
  const [end, setEnd] = useState(event ? str(event, "end") : (defaultDate ?? ""));
  const [typeId, setTypeId] = useState(event ? str(event, "event_type_id") : "");
  const [busy, setBusy] = useState(false);

  async function save() {
    if (!name.trim()) return;
    setBusy(true);
    try {
      const meta = {
        ...(event?.meta ?? {}),
        description: description.trim(),
        start,
        end: end || start,
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

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-muted-foreground">Start</label>
              <Input type="date" value={start} onChange={(e) => setStart(e.target.value)} />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-muted-foreground">End</label>
              <Input type="date" value={end} onChange={(e) => setEnd(e.target.value)} />
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

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button onClick={save} disabled={busy || !name.trim()}>
            {event ? "Save" : "Create event"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

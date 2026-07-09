"use client";

import {
  Button,
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
  cn,
  toast,
} from "@drekis/shader";
import { Tags, Trash2 } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useMemo, useState } from "react";
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

const colorOf = (t: EntityOut): string =>
  typeof t.meta?.color === "string" ? (t.meta.color as string) : "#8b5cf6";

const PRESETS = [
  "#8b5cf6", "#6366f1", "#3b82f6", "#06b6d4", "#10b981", "#84cc16",
  "#f59e0b", "#f97316", "#ef4444", "#ec4899", "#a855f7", "#64748b",
];

const LIST_COLS = "grid-cols-[1fr_36px] sm:grid-cols-[1fr_120px_36px]";

export default function EventTypesPage() {
  return (
    <Suspense fallback={<div className="p-6 text-sm text-muted-foreground">Loading…</div>}>
      <EventTypesInner />
    </Suspense>
  );
}

function EventTypesInner() {
  const [types, setTypes] = useState<EntityOut[]>([]);
  const q = useSearchParams().get("q") ?? ""; // top bar drives the list filter
  const [view, setView] = useView("bs-event-types-view");
  const [editing, setEditing] = useState<EntityOut | null | "new">(null);

  const load = () => {
    if (!getUuid()) return;
    listEntities("event_type").then(setTypes).catch(() => setTypes([]));
  };
  useEffect(load, []);

  const filtered = useMemo(
    () => types.filter((t) => t.name.toLowerCase().includes(q.trim().toLowerCase())),
    [types, q],
  );

  async function remove(t: EntityOut) {
    try {
      await deleteEntity(t.id);
      toast.success(`Removed ${t.name}`);
      load();
    } catch (e) {
      toast.error(String((e as Error).message));
    }
  }

  return (
    <FilterShell>
      <EntityBrowser
        icon={Tags}
        title="Event types"
        total={types.length}
        items={filtered}
        getKey={(t) => t.id}
        view={view}
        onViewChange={setView}
        onNew={() => setEditing("new")}
        newLabel="New type"
        emptyTitle={types.length ? "No matches" : "No event types yet"}
        emptyDescription="Create types like Birthday, Trip or Meeting — each with a colour."
        listCols={LIST_COLS}
        listHeader={
          <>
            <span>Name</span>
            <span className="hidden sm:block">Colour</span>
            <span />
          </>
        }
        renderRow={(t) => (
          <>
            <button
              type="button"
              onClick={() => setEditing(t)}
              className="flex min-w-0 items-center gap-2.5 text-left"
            >
              <span className="size-3 shrink-0 rounded-full" style={{ backgroundColor: colorOf(t) }} />
              <span className="truncate font-medium">{t.name}</span>
            </button>
            <span className="hidden font-mono text-xs text-muted-foreground sm:block">{colorOf(t)}</span>
            <button
              type="button"
              aria-label={`Delete ${t.name}`}
              onClick={() => remove(t)}
              className="flex size-7 items-center justify-center rounded-md text-muted-foreground opacity-0 transition hover:text-destructive group-hover:opacity-100"
            >
              <Trash2 className="size-4" />
            </button>
          </>
        )}
        renderCard={(t, large) => (
          <div
            onClick={() => setEditing(t)}
            className="group relative flex h-full cursor-pointer flex-col items-center justify-center gap-2.5 rounded-xl border border-border bg-card p-4 text-center transition-colors hover:border-primary"
          >
            <span
              className={cn("rounded-full", large ? "size-14" : "size-9")}
              style={{ backgroundColor: colorOf(t) }}
            />
            <span className="truncate text-sm font-semibold">{t.name}</span>
            {large && (
              <span className="font-mono text-xs text-muted-foreground">{colorOf(t)}</span>
            )}
            <button
              type="button"
              aria-label={`Delete ${t.name}`}
              onClick={(e) => {
                e.stopPropagation();
                remove(t);
              }}
              className="absolute right-2 top-2 flex size-7 items-center justify-center rounded-md bg-background/80 text-muted-foreground opacity-0 backdrop-blur transition hover:text-destructive group-hover:opacity-100"
            >
              <Trash2 className="size-4" />
            </button>
          </div>
        )}
      />

      {editing !== null && (
        <TypeDialog
          type={editing === "new" ? null : editing}
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

function TypeDialog({
  type,
  onClose,
  onSaved,
}: {
  type: EntityOut | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState(type?.name ?? "");
  const [color, setColor] = useState(type ? colorOf(type) : PRESETS[0]);
  const [busy, setBusy] = useState(false);

  async function save() {
    if (!name.trim()) return;
    setBusy(true);
    try {
      const meta = { ...(type?.meta ?? {}), color };
      if (type) await updateEntity(type.id, { name: name.trim(), meta });
      else await createEntity("event_type", name.trim(), meta);
      toast.success(type ? "Updated" : "Type created");
      onSaved();
    } catch (e) {
      toast.error(String((e as Error).message));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent fullScreenOnMobile className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>{type ? "Edit event type" : "New event type"}</DialogTitle>
        </DialogHeader>

        <div className="flex flex-col gap-4">
          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground">Name</label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Birthday, Trip…" />
          </div>

          <div>
            <label className="mb-2 block text-xs font-medium text-muted-foreground">Colour</label>
            <div className="flex flex-wrap items-center gap-2">
              {PRESETS.map((c) => (
                <button
                  key={c}
                  type="button"
                  aria-label={c}
                  onClick={() => setColor(c)}
                  className={cn(
                    "size-7 rounded-full transition-transform hover:scale-110",
                    color === c && "ring-2 ring-foreground ring-offset-2 ring-offset-background",
                  )}
                  style={{ backgroundColor: c }}
                />
              ))}
              <label className="relative size-7 cursor-pointer overflow-hidden rounded-full border border-border">
                <span
                  className="absolute inset-0"
                  style={{ background: "conic-gradient(red, orange, yellow, lime, cyan, blue, magenta, red)" }}
                />
                <input
                  type="color"
                  value={color}
                  onChange={(e) => setColor(e.target.value)}
                  className="absolute inset-0 cursor-pointer opacity-0"
                />
              </label>
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button onClick={save} disabled={busy || !name.trim()}>
            {type ? "Save" : "Create type"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

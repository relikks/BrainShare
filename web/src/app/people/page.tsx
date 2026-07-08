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
  cn,
  toast,
} from "@drekis/shader";
import { Camera, Plus, Trash2, Users, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { EntityBrowser } from "@/components/entity-browser";
import { FilterShell } from "@/components/filter-shell";
import { PersonAvatar } from "@/components/person-avatar";
import {
  type EntityOut,
  createEntity,
  deleteEntity,
  deleteEntityPhoto,
  listEntities,
  updateEntity,
  uploadEntityPhoto,
} from "@/lib/api";
import { getUuid } from "@/lib/config";
import { useView } from "@/lib/use-view";

interface Field {
  label: string;
  value: string;
}
const metaFields = (p: EntityOut): Field[] => (Array.isArray(p.meta?.fields) ? (p.meta.fields as Field[]) : []);
const metaDesc = (p: EntityOut): string => (typeof p.meta?.description === "string" ? p.meta.description : "");

const LIST_COLS =
  "grid-cols-[1fr_36px] sm:grid-cols-[1fr_1.4fr_36px] md:grid-cols-[1fr_1.6fr_130px_36px]";

export default function PeoplePage() {
  const [people, setPeople] = useState<EntityOut[]>([]);
  const [q, setQ] = useState("");
  const [view, setView] = useView("bs-people-view");
  const [editing, setEditing] = useState<EntityOut | null | "new">(null);

  const load = () => {
    if (!getUuid()) return;
    listEntities("person").then(setPeople).catch(() => setPeople([]));
  };
  useEffect(load, []);

  const filtered = useMemo(
    () => people.filter((p) => p.name.toLowerCase().includes(q.trim().toLowerCase())),
    [people, q],
  );

  async function remove(p: EntityOut) {
    try {
      await deleteEntity(p.id);
      toast.success(`Removed ${p.name}`);
      load();
    } catch (e) {
      toast.error(String((e as Error).message));
    }
  }

  return (
    <FilterShell
      filters={
        <div className="flex flex-col gap-2">
          <span className="text-xs text-muted-foreground">Find a person</span>
          <SearchBar value={q} onValueChange={setQ} placeholder="Search people…" size="sm" />
        </div>
      }
    >
      <EntityBrowser
        icon={Users}
        title="People"
        total={people.length}
        items={filtered}
        getKey={(p) => p.id}
        view={view}
        onViewChange={setView}
        onNew={() => setEditing("new")}
        newLabel="New person"
        emptyTitle={people.length ? "No matches" : "No people yet"}
        emptyDescription="Name people in the Classify inbox, or add them here."
        listCols={LIST_COLS}
        listHeader={
          <>
            <span>Name</span>
            <span className="hidden sm:block">Description</span>
            <span className="hidden md:block">Details</span>
            <span />
          </>
        }
        renderRow={(p) => (
          <>
            <button
              type="button"
              onClick={() => setEditing(p)}
              className="flex min-w-0 items-center gap-2.5 text-left"
            >
              <PersonAvatar person={p} className="size-7 shrink-0 rounded-full text-xs" />
              <span className="truncate font-medium">{p.name}</span>
            </button>
            <span className="hidden truncate text-muted-foreground sm:block">{metaDesc(p) || "—"}</span>
            <span className="hidden text-muted-foreground md:block">
              {metaFields(p).length ? `${metaFields(p).length} fields` : "—"}
            </span>
            <button
              type="button"
              aria-label={`Delete ${p.name}`}
              onClick={() => remove(p)}
              className="flex size-7 items-center justify-center rounded-md text-muted-foreground opacity-0 transition hover:text-destructive group-hover:opacity-100"
            >
              <Trash2 className="size-4" />
            </button>
          </>
        )}
        renderCard={(p, large) => (
          <div
            onClick={() => setEditing(p)}
            className="group relative flex h-full cursor-pointer flex-col items-center gap-2.5 rounded-xl border border-border bg-card p-4 text-center transition-colors hover:border-primary"
          >
            <PersonAvatar
              person={p}
              className={cn("rounded-full", large ? "size-20 text-2xl" : "size-14 text-lg")}
            />
            <div className="min-w-0">
              <div className="truncate text-sm font-semibold">{p.name}</div>
              {metaDesc(p) && (
                <div className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">{metaDesc(p)}</div>
              )}
            </div>
            {large && metaFields(p).length > 0 && (
              <dl className="mt-1 w-full space-y-0.5 text-left text-xs">
                {metaFields(p).slice(0, 4).map((f, i) => (
                  <div key={`${f.label}-${i}`} className="flex justify-between gap-2">
                    <dt className="truncate text-muted-foreground">{f.label}</dt>
                    <dd className="truncate font-medium">{f.value}</dd>
                  </div>
                ))}
              </dl>
            )}
            <button
              type="button"
              aria-label={`Delete ${p.name}`}
              onClick={(e) => {
                e.stopPropagation();
                remove(p);
              }}
              className="absolute right-2 top-2 flex size-7 items-center justify-center rounded-md bg-background/80 text-muted-foreground opacity-0 backdrop-blur transition hover:text-destructive group-hover:opacity-100"
            >
              <Trash2 className="size-4" />
            </button>
          </div>
        )}
      />

      {editing !== null && (
        <PersonDialog
          person={editing === "new" ? null : editing}
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

// ── create / edit dialog ──
function PersonDialog({
  person,
  onClose,
  onSaved,
}: {
  person: EntityOut | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState(person?.name ?? "");
  const [description, setDescription] = useState(person ? metaDesc(person) : "");
  const [fields, setFields] = useState<Field[]>(person ? metaFields(person) : []);
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [removePhoto, setRemovePhoto] = useState(false);
  const [busy, setBusy] = useState(false);
  const photoInput = useRef<HTMLInputElement>(null);

  const preview = photoFile ? URL.createObjectURL(photoFile) : null;
  useEffect(() => {
    return () => {
      if (preview) URL.revokeObjectURL(preview);
    };
  }, [preview]);
  const showExisting = !photoFile && !removePhoto && Boolean(person?.meta?.photo_key);

  async function save() {
    if (!name.trim()) return;
    setBusy(true);
    try {
      const cleanFields = fields.filter((f) => f.label.trim() || f.value.trim());
      const meta = {
        ...(person?.meta ?? {}),
        description: description.trim(),
        fields: cleanFields,
      };
      const saved = person
        ? await updateEntity(person.id, { name: name.trim(), meta })
        : await createEntity("person", name.trim(), meta);
      if (photoFile) await uploadEntityPhoto(saved.id, photoFile);
      else if (removePhoto && person?.meta?.photo_key) await deleteEntityPhoto(saved.id);
      toast.success(person ? "Updated" : "Person added");
      onSaved();
    } catch (e) {
      toast.error(String((e as Error).message));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[85dvh] overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{person ? "Edit person" : "New person"}</DialogTitle>
        </DialogHeader>

        <div className="flex flex-col gap-4">
          {/* photo + name */}
          <div className="flex items-center gap-4">
            <div className="relative">
              {preview ? (
                // biome-ignore lint/nursery/noImgElement: local object-url preview
                <img src={preview} alt="" className="size-16 rounded-full object-cover" />
              ) : showExisting && person ? (
                <PersonAvatar person={person} className="size-16 rounded-full text-xl" />
              ) : (
                <span className="flex size-16 items-center justify-center rounded-full bg-muted text-muted-foreground">
                  <Camera className="size-6" />
                </span>
              )}
              <button
                type="button"
                onClick={() => photoInput.current?.click()}
                className="absolute -bottom-1 -right-1 flex size-7 items-center justify-center rounded-full border border-border bg-background text-foreground shadow-sm hover:bg-muted"
                aria-label="Change photo"
              >
                <Camera className="size-3.5" />
              </button>
              {(preview || showExisting) && (
                <button
                  type="button"
                  onClick={() => {
                    setPhotoFile(null);
                    setRemovePhoto(true);
                  }}
                  className="absolute -right-1 -top-1 flex size-6 items-center justify-center rounded-full border border-border bg-background text-muted-foreground hover:text-destructive"
                  aria-label="Remove photo"
                >
                  <X className="size-3.5" />
                </button>
              )}
            </div>
            <input
              ref={photoInput}
              type="file"
              accept="image/*"
              hidden
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) {
                  setPhotoFile(f);
                  setRemovePhoto(false);
                }
              }}
            />
            <div className="flex-1">
              <label className="mb-1 block text-xs font-medium text-muted-foreground">Name</label>
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Full name" />
            </div>
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground">Description</label>
            <Textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="A short note about this person…"
              rows={3}
            />
          </div>

          {/* custom data fields */}
          <div>
            <div className="mb-1 flex items-center justify-between">
              <label className="text-xs font-medium text-muted-foreground">Details</label>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setFields([...fields, { label: "", value: "" }])}
              >
                <Plus className="size-4" /> Add field
              </Button>
            </div>
            <div className="flex flex-col gap-2">
              {fields.map((f, i) => (
                <div key={i} className="flex gap-2">
                  <Input
                    className="w-32"
                    placeholder="Label"
                    value={f.label}
                    onChange={(e) =>
                      setFields(fields.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)))
                    }
                  />
                  <Input
                    className="flex-1"
                    placeholder="Value"
                    value={f.value}
                    onChange={(e) =>
                      setFields(fields.map((x, j) => (j === i ? { ...x, value: e.target.value } : x)))
                    }
                  />
                  <Button
                    variant="ghost"
                    size="sm"
                    className="size-9 shrink-0 p-0"
                    onClick={() => setFields(fields.filter((_, j) => j !== i))}
                  >
                    <Trash2 className="size-4" />
                  </Button>
                </div>
              ))}
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button onClick={save} disabled={busy || !name.trim()}>
            {person ? "Save" : "Add person"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

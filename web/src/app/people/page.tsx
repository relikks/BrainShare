"use client";

import { Button, EmptyState, SearchBar, toast } from "@drekis/shader";
import { Trash2, Users } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { FilterShell } from "@/components/filter-shell";
import { createEntity, deleteEntity, listEntities, type EntityOut } from "@/lib/api";
import { getUuid } from "@/lib/config";

export default function PeoplePage() {
  const [people, setPeople] = useState<EntityOut[]>([]);
  const [q, setQ] = useState("");
  const [newName, setNewName] = useState("");

  const load = () => {
    if (!getUuid()) return;
    listEntities("person").then(setPeople).catch(() => setPeople([]));
  };
  useEffect(load, []);

  const filtered = useMemo(
    () => people.filter((p) => p.name.toLowerCase().includes(q.trim().toLowerCase())),
    [people, q],
  );

  async function add() {
    if (!newName.trim()) return;
    try {
      await createEntity("person", newName.trim());
      setNewName("");
      load();
    } catch (e) {
      toast.error(String((e as Error).message));
    }
  }
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
      <div className="mb-4 flex items-center gap-2">
        <Users className="size-5 text-primary" />
        <h1 className="text-lg font-semibold tracking-tight">People</h1>
        <span className="text-sm text-muted-foreground">{people.length}</span>
      </div>

      <div className="mb-5 flex max-w-sm gap-2">
        <SearchBar
          value={newName}
          onValueChange={setNewName}
          onSubmit={add}
          placeholder="Add a person…"
        />
        <Button size="sm" onClick={add}>
          Add
        </Button>
      </div>

      {filtered.length === 0 ? (
        <EmptyState
          title={people.length ? "No matches" : "No people yet"}
          description="Name people in the Classify inbox, or add them here."
        />
      ) : (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
          {filtered.map((p) => (
            <div
              key={p.id}
              className="flex items-center gap-2 rounded-xl border border-border p-3 transition-colors hover:border-primary/40"
            >
              <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-sm font-bold text-primary">
                {p.name.charAt(0).toUpperCase()}
              </span>
              <span className="min-w-0 flex-1 truncate text-sm font-medium">{p.name}</span>
              <Button variant="ghost" size="sm" className="size-7 p-0" onClick={() => remove(p)}>
                <Trash2 className="size-4" />
              </Button>
            </div>
          ))}
        </div>
      )}
    </FilterShell>
  );
}

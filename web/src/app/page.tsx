"use client";

import {
  Button,
  Card,
  CardContent,
  EmptyState,
  Input,
  SearchBar,
  toast,
} from "@drekis/shader";
import { FolderOpen, Plus } from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { FilterShell } from "@/components/filter-shell";
import { createCollection, listCollections } from "@/lib/api";
import { getUuid } from "@/lib/config";
import type { Collection, Role } from "@/lib/types";

export default function HomePage() {
  const [hasId, setHasId] = useState<boolean | null>(null);
  const [collections, setCollections] = useState<Collection[]>([]);
  const [name, setName] = useState("");
  const [q, setQ] = useState("");
  const [roles, setRoles] = useState<Set<Role>>(new Set());

  useEffect(() => {
    const ok = !!getUuid();
    setHasId(ok);
    if (ok) listCollections().then(setCollections).catch(() => {});
  }, []);

  async function create() {
    if (!name.trim()) return;
    try {
      const c = await createCollection(name.trim());
      setCollections((p) => [...p, c]);
      setName("");
      toast.success(`Created “${c.name}”`);
    } catch (e) {
      toast.error(String((e as Error).message));
    }
  }

  const filtered = useMemo(
    () =>
      collections.filter(
        (c) =>
          c.name.toLowerCase().includes(q.trim().toLowerCase()) &&
          (roles.size === 0 || roles.has(c.role)),
      ),
    [collections, q, roles],
  );

  function toggleRole(r: Role) {
    setRoles((prev) => {
      const next = new Set(prev);
      next.has(r) ? next.delete(r) : next.add(r);
      return next;
    });
  }

  if (hasId === false) {
    return (
      <div className="grid min-h-[60vh] place-items-center p-6">
        <div className="flex flex-col items-center gap-4">
          <EmptyState
            title="Welcome to BrainShare"
            description="Create an identity to start building searchable knowledge collections."
          />
          <Link href="/settings">
            <Button>Get started</Button>
          </Link>
        </div>
      </div>
    );
  }

  return (
    <FilterShell
      filters={
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <span className="text-xs text-muted-foreground">Find a collection</span>
            <SearchBar value={q} onValueChange={setQ} placeholder="Search collections…" size="sm" />
          </div>
          <div>
            <div className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Your role
            </div>
            <div className="flex flex-wrap gap-1.5">
              {(["owner", "editor", "viewer"] as Role[]).map((r) => {
                const on = roles.has(r);
                return (
                  <button
                    key={r}
                    type="button"
                    onClick={() => toggleRole(r)}
                    className={`rounded-md border px-2 py-1 text-xs capitalize transition-colors ${
                      on
                        ? "border-primary bg-primary/10 text-primary"
                        : "border-border text-muted-foreground hover:bg-muted"
                    }`}
                  >
                    {r}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      }
    >
      <div className="mb-4 flex items-center gap-2">
        <FolderOpen className="size-5 text-primary" />
        <h1 className="text-lg font-semibold tracking-tight">Collections</h1>
        <span className="text-sm text-muted-foreground">{collections.length}</span>
      </div>

      <div className="mb-5 flex max-w-md gap-2">
        <Input
          placeholder="New collection name…"
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && create()}
        />
        <Button onClick={create} disabled={!name.trim()}>
          <Plus className="size-4" /> Create
        </Button>
      </div>

      {filtered.length === 0 ? (
        <EmptyState
          title={collections.length ? "No matches" : "No collections yet"}
          description={collections.length ? "Adjust the filters." : "Create your first one above."}
        />
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((c) => (
            <Link key={c.id} href={`/c/${c.id}`}>
              <Card className="transition-colors hover:border-primary">
                <CardContent className="flex items-center gap-3 p-4">
                  <div className="flex size-10 items-center justify-center rounded-lg bg-muted">
                    <FolderOpen className="size-5 text-muted-foreground" />
                  </div>
                  <div className="min-w-0">
                    <div className="truncate font-medium">{c.name}</div>
                    <div className="text-xs text-muted-foreground">{c.role}</div>
                  </div>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </FilterShell>
  );
}

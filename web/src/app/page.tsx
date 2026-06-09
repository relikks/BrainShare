"use client";

import {
  Button,
  Card,
  CardContent,
  EmptyState,
  Input,
  toast,
} from "@drekis/shader";
import { FolderOpen, Plus } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { createCollection, listCollections } from "@/lib/api";
import { getUuid } from "@/lib/config";
import type { Collection } from "@/lib/types";

export default function HomePage() {
  const [hasId, setHasId] = useState<boolean | null>(null);
  const [collections, setCollections] = useState<Collection[]>([]);
  const [name, setName] = useState("");

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
    <div className="space-y-6 p-6">
      <h1 className="text-2xl font-semibold tracking-tight">Collections</h1>

      <div className="flex max-w-md gap-2">
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

      {collections.length === 0 ? (
        <EmptyState title="No collections yet" description="Create your first one above." />
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {collections.map((c) => (
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
    </div>
  );
}

"use client";

import { Button, EmptyState, ScopePicker, SearchBar, toast } from "@drekis/shader";
import { FolderOpen, Inbox } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { FilterShell } from "@/components/filter-shell";
import {
  assignFaces,
  faceInbox,
  fileBlobUrl,
  listCollections,
  listEntities,
  type EntityOut,
  type FaceCluster,
} from "@/lib/api";
import { getUuid } from "@/lib/config";
import type { Collection } from "@/lib/types";

/** Crops a face out of its file image (by bbox) onto a canvas → data URL. */
function FaceCrop({ fileId, bbox, size = 72 }: { fileId: string; bbox: number[]; size?: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    let url: string | null = null;
    let cancelled = false;
    fileBlobUrl(fileId)
      .then((u) => {
        if (cancelled) return void URL.revokeObjectURL(u);
        url = u;
        const img = new Image();
        img.onload = () => {
          const c = ref.current;
          if (!c) return;
          const [x1, y1, x2, y2] = bbox;
          const pad = (x2 - x1) * 0.35;
          const sx = Math.max(0, x1 - pad),
            sy = Math.max(0, y1 - pad);
          const sw = Math.min(img.width - sx, x2 - x1 + pad * 2);
          const sh = Math.min(img.height - sy, y2 - y1 + pad * 2);
          const ctx = c.getContext("2d");
          if (ctx) ctx.drawImage(img, sx, sy, sw, sh, 0, 0, size, size);
        };
        img.src = u;
      })
      .catch(() => {});
    return () => {
      cancelled = true;
      if (url) URL.revokeObjectURL(url);
    };
  }, [fileId, bbox, size]);
  return <canvas ref={ref} width={size} height={size} className="rounded-lg bg-muted object-cover" />;
}

function ClusterCard({
  cluster,
  people,
  onAssigned,
}: {
  cluster: FaceCluster;
  people: EntityOut[];
  onAssigned: () => void;
}) {
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);

  async function assign(person: { person_id?: string; name?: string }) {
    setBusy(true);
    try {
      await assignFaces(cluster.face_ids, person);
      onAssigned();
    } catch (e) {
      toast.error(String((e as Error).message));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-3 rounded-xl border border-border p-3">
      <div className="flex items-center gap-2">
        {cluster.faces.slice(0, 4).map((f) => (
          <FaceCrop key={f.id} fileId={f.file_id} bbox={f.bbox} />
        ))}
        <span className="ms-auto text-xs text-muted-foreground">{cluster.count} face(s)</span>
      </div>
      <div className="flex gap-2">
        <SearchBar
          value={name}
          onValueChange={setName}
          onSubmit={() => name.trim() && assign({ name: name.trim() })}
          placeholder="Who is this?"
          size="sm"
          disabled={busy}
        />
        <Button size="sm" disabled={busy || !name.trim()} onClick={() => assign({ name: name.trim() })}>
          Name
        </Button>
      </div>
      {people.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {people
            .filter((p) => !name || p.name.toLowerCase().includes(name.toLowerCase()))
            .slice(0, 6)
            .map((p) => (
              <button
                key={p.id}
                type="button"
                disabled={busy}
                onClick={() => assign({ person_id: p.id })}
                className="rounded-full border border-border px-2 py-0.5 text-xs text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground"
              >
                {p.name}
              </button>
            ))}
        </div>
      )}
    </div>
  );
}

export default function ClassifyPage() {
  const [collections, setCollections] = useState<Collection[]>([]);
  const [selectedCids, setSelectedCids] = useState<string[]>([]);
  const [clusters, setClusters] = useState<FaceCluster[] | null>(null);
  const [people, setPeople] = useState<EntityOut[]>([]);

  useEffect(() => {
    if (!getUuid()) return;
    listCollections().then(setCollections).catch(() => {});
    listEntities("person").then(setPeople).catch(() => {});
  }, []);

  // Empty selection = every collection (ScopePicker "Any" semantics).
  const scopeCids = useMemo(
    () => (selectedCids.length ? selectedCids : collections.map((c) => c.id)),
    [selectedCids, collections],
  );

  const load = () => {
    if (!scopeCids.length) {
      setClusters([]);
      return;
    }
    setClusters(null);
    Promise.all(scopeCids.map((id) => faceInbox(id).catch(() => [])))
      .then((lists) => setClusters(lists.flat().sort((a, b) => b.count - a.count)))
      .catch(() => setClusters([]));
  };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(load, [scopeCids.join(",")]);

  return (
    <FilterShell
      filters={
        <div className="flex flex-col gap-3">
          <span className="text-xs text-muted-foreground">Collections</span>
          <ScopePicker
            icon={<FolderOpen className="size-4" />}
            title="Collections"
            anyLabel="All collections"
            modalTitle="Choose collections"
            searchPlaceholder="Search collections…"
            layout="list"
            options={collections.map((c) => ({ id: c.id, label: c.name }))}
            selected={selectedCids}
            onChange={setSelectedCids}
          />
        </div>
      }
    >
      <div className="mb-4 flex items-center gap-2">
        <Inbox className="size-5 text-primary" />
        <h1 className="text-lg font-semibold tracking-tight">Classify</h1>
        <span className="text-sm text-muted-foreground">
          {clusters ? `${clusters.length} group(s) to name` : ""}
        </span>
      </div>

      {clusters === null ? (
        <div className="text-sm text-muted-foreground">Loading…</div>
      ) : clusters.length === 0 ? (
        <EmptyState
          title="Nothing to classify"
          description="Detected faces you haven't named will appear here, grouped by who they look like."
        />
      ) : (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
          {clusters.map((c) => (
            <ClusterCard key={c.face_ids[0]} cluster={c} people={people} onAssigned={load} />
          ))}
        </div>
      )}
    </FilterShell>
  );
}

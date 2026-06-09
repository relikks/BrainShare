"use client";

import {
  Badge,
  Card,
  CardContent,
  Checkbox,
  EmptyState,
  Label,
  cn,
  toast,
  useHideOnScroll,
} from "@drekis/shader";
import {
  FileText,
  Image as ImageIcon,
  Layers,
  Music,
  Sparkles,
  Video,
} from "lucide-react";
import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { search } from "@/lib/api";
import { getUuid } from "@/lib/config";
import { MODALITIES, type Modality, type SearchHit } from "@/lib/types";

const ICON: Record<Modality, typeof FileText> = {
  text: FileText,
  image: ImageIcon,
  audio: Music,
  video: Video,
};

/** Layer-dependent filter aside — sticky under the top bar, shifts up when it hides. */
function Filters({
  mods,
  toggle,
  subdirs,
  setSubdirs,
  scoped,
}: {
  mods: Set<Modality>;
  toggle: (m: Modality) => void;
  subdirs: boolean;
  setSubdirs: (v: boolean) => void;
  scoped: boolean;
}) {
  const hidden = useHideOnScroll(true);
  return (
    <aside
      className={cn(
        "sticky hidden w-60 shrink-0 flex-col gap-5 border-r border-border bg-background px-4 py-5 transition-[top,height] duration-300 lg:flex",
        hidden ? "top-0 h-dvh" : "top-14 h-[calc(100dvh-3.5rem)]",
      )}
    >
      <div>
        <div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          <Layers className="size-3.5" /> Modalities
        </div>
        <div className="flex flex-col gap-2.5">
          {MODALITIES.map((m) => {
            const Icon = ICON[m];
            return (
              <label key={m} className="flex cursor-pointer items-center gap-2.5 text-sm">
                <Checkbox checked={mods.has(m)} onCheckedChange={() => toggle(m)} />
                <Icon className="size-4 text-muted-foreground" />
                <span className="capitalize">{m}</span>
              </label>
            );
          })}
        </div>
      </div>

      {scoped && (
        <div>
          <div className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Scope
          </div>
          <label className="flex cursor-pointer items-center gap-2.5 text-sm">
            <Checkbox checked={subdirs} onCheckedChange={() => setSubdirs(!subdirs)} />
            <span>Include subfolders</span>
          </label>
        </div>
      )}
    </aside>
  );
}

function SearchView() {
  const sp = useSearchParams();
  const q = sp.get("q") ?? "";
  const cid = sp.get("cid");
  const dir = sp.get("dir");
  const [mods, setMods] = useState<Set<Modality>>(new Set(MODALITIES));
  const [subdirs, setSubdirs] = useState(true);
  const [hits, setHits] = useState<SearchHit[] | null>(null);
  const [busy, setBusy] = useState(false);

  function toggle(m: Modality) {
    setMods((prev) => {
      const next = new Set(prev);
      next.has(m) ? next.delete(m) : next.add(m);
      return next.size ? next : prev;
    });
  }

  useEffect(() => {
    if (!q.trim() || !getUuid()) {
      setHits(null);
      return;
    }
    let active = true;
    setBusy(true);
    search(q.trim(), {
      modalities: [...mods],
      collection_ids: cid ? [cid] : null,
      directory_id: dir,
      include_subdirs: subdirs,
    })
      .then((r) => active && setHits(r.hits))
      .catch((e) => active && toast.error(String((e as Error).message)))
      .finally(() => active && setBusy(false));
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q, cid, dir, subdirs, [...mods].sort().join(",")]);

  return (
    <div className="flex w-full">
      <Filters
        mods={mods}
        toggle={toggle}
        subdirs={subdirs}
        setSubdirs={setSubdirs}
        scoped={!!dir}
      />

      <div className="min-w-0 flex-1 px-5 py-5">
        <div className="mb-4 flex items-center gap-2">
          <Sparkles className="size-5 text-primary" />
          <h1 className="text-lg font-semibold tracking-tight">
            {q ? <>Results for “{q}”</> : "Search your knowledge"}
          </h1>
          {(cid || dir) && (
            <Badge variant="secondary">
              scoped{dir ? ` · folder${subdirs ? " + subfolders" : ""}` : " · collection"}
            </Badge>
          )}
          {busy && <span className="text-xs text-muted-foreground">searching…</span>}
        </div>

        {!q ? (
          <EmptyState
            title="Type a query in the search bar"
            description="Ask in natural language — across text, images, audio and video."
          />
        ) : hits === null ? null : hits.length === 0 ? (
          <EmptyState title="No matches" description="Try different words or enable more modalities." />
        ) : (
          <div className="space-y-2">
            {hits.map((h) => {
              const Icon = ICON[h.modality];
              return (
                <Card key={h.file_id}>
                  <CardContent className="space-y-1.5 p-4">
                    <div className="flex items-center gap-2">
                      <Icon className="size-4 shrink-0 text-muted-foreground" />
                      <span className="truncate font-medium">{h.file_name}</span>
                      <Badge variant="secondary">{h.modality}</Badge>
                      <span className="ms-auto text-xs text-muted-foreground">
                        {h.score.toFixed(3)}
                      </span>
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {h.breadcrumb.map((c) => c.name).join(" / ")}
                    </div>
                    {h.best?.text && (
                      <p className="line-clamp-3 text-sm text-foreground/80">{h.best.text}</p>
                    )}
                    {h.matched_spaces.length > 1 && (
                      <div className="text-xs text-muted-foreground">
                        matched via {h.matched_spaces.join(", ")}
                      </div>
                    )}
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

export default function SearchPage() {
  return (
    <Suspense fallback={<div className="p-6 text-sm text-muted-foreground">Loading…</div>}>
      <SearchView />
    </Suspense>
  );
}

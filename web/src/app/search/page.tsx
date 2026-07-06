"use client";

import {
  Badge,
  Card,
  CardContent,
  Checkbox,
  EmptyState,
  cn,
  toast,
  useHideOnScroll,
} from "@drekis/shader";
import {
  FileText,
  Folder,
  Image as ImageIcon,
  Layers,
  Music,
  Sparkles,
  Video,
  X,
} from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useMemo, useState } from "react";
import { MetaFilterBar, toMetaFilters, type FilterState } from "@/components/MetaFilterBar";
import { browse, getPipelines, search } from "@/lib/api";
import { getUuid } from "@/lib/config";
import { MODALITIES, type Crumb, type Modality, type PipelineInfo, type SearchHit } from "@/lib/types";

const ICON: Record<Modality, typeof FileText> = {
  text: FileText,
  image: ImageIcon,
  audio: Music,
  video: Video,
};

/** Layer-dependent filter aside — sticky under the top bar, shifts up when it hides.
 * CardForge-style: each active type expands its named search pipelines as sub-filter
 * chips ("not just searching images — searching images by objects"). */
function Filters({
  mods,
  toggle,
  catalog,
  pipes,
  togglePipe,
  subdirs,
  setSubdirs,
  scoped,
  filterState,
  setFilterState,
}: {
  mods: Set<Modality>;
  toggle: (m: Modality) => void;
  catalog: PipelineInfo[];
  pipes: Set<string>;
  togglePipe: (key: string) => void;
  subdirs: boolean;
  setSubdirs: (v: boolean) => void;
  scoped: boolean;
  filterState: FilterState;
  setFilterState: (s: FilterState) => void;
}) {
  const hidden = useHideOnScroll(true);
  return (
    <aside
      className={cn(
        "sticky hidden w-60 shrink-0 flex-col gap-5 overflow-y-auto border-r border-border bg-background px-4 py-5 transition-[top,height] duration-300 lg:flex",
        hidden ? "top-0 h-dvh" : "top-14 h-[calc(100dvh-3.5rem)]",
      )}
    >
      <div>
        <div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          <Layers className="size-3.5" /> Search by
        </div>
        <div className="flex flex-col gap-2.5">
          {MODALITIES.map((m) => {
            const Icon = ICON[m];
            const active = mods.has(m);
            const options = catalog.filter((p) => p.modality === m);
            return (
              <div key={m}>
                <label className="flex cursor-pointer items-center gap-2.5 text-sm">
                  <Checkbox checked={active} onCheckedChange={() => toggle(m)} />
                  <Icon className="size-4 text-muted-foreground" />
                  <span className="capitalize">{m}</span>
                </label>
                {/* pipeline sub-filters: how to look inside this type */}
                {active && options.length > 1 && (
                  <div className="ml-6 mt-1.5 flex flex-wrap gap-1.5">
                    {options.map((p) => {
                      const on = pipes.has(p.key);
                      return (
                        <button
                          key={p.key}
                          type="button"
                          title={p.desc}
                          onClick={() => togglePipe(p.key)}
                          className={`rounded-md border px-2 py-1 text-xs transition-colors ${
                            on
                              ? "border-primary bg-primary/10 text-primary"
                              : "border-border text-muted-foreground hover:bg-muted"
                          }`}
                        >
                          {p.label}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      <MetaFilterBar active={mods} value={filterState} onChange={setFilterState} />

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

/** Where the search is looking: collection + path from its root (CardForge scope-row
 * pattern). The ✕ widens back to everything. */
function ScopeRow({
  crumbs,
  subdirs,
  onClear,
}: {
  crumbs: Crumb[];
  subdirs: boolean;
  onClear: () => void;
}) {
  return (
    <div className="mb-3 flex flex-wrap items-center gap-1.5 text-sm">
      <span className="text-xs uppercase tracking-wider text-muted-foreground">Searching in</span>
      <span className="flex items-center gap-1 rounded-md border border-border bg-muted/50 px-2 py-1">
        <Folder className="size-3.5 text-primary" />
        {crumbs.map((c, i) => (
          <span key={c.id ?? "root"} className="flex items-center gap-1">
            {i > 0 && <span className="text-muted-foreground">/</span>}
            <span className={i === crumbs.length - 1 ? "font-medium" : "text-muted-foreground"}>
              {c.name}
            </span>
          </span>
        ))}
        {crumbs.length > 1 && subdirs && (
          <span className="text-xs text-muted-foreground">(+ subfolders)</span>
        )}
        <button
          type="button"
          aria-label="Search everywhere"
          onClick={onClear}
          className="ml-1 rounded-full p-0.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          <X className="size-3.5" />
        </button>
      </span>
    </div>
  );
}

function SearchView() {
  const sp = useSearchParams();
  const router = useRouter();
  const q = sp.get("q") ?? "";
  const cid = sp.get("cid");
  const dir = sp.get("dir");
  const [mods, setMods] = useState<Set<Modality>>(new Set(MODALITIES));
  const [pipes, setPipes] = useState<Set<string>>(new Set());
  const [catalog, setCatalog] = useState<PipelineInfo[]>([]);
  const [subdirs, setSubdirs] = useState(true);
  const [scopeCrumbs, setScopeCrumbs] = useState<Crumb[] | null>(null);
  const [hits, setHits] = useState<SearchHit[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [filterState, setFilterState] = useState<FilterState>({});
  const metaFilters = toMetaFilters(filterState, mods);
  const labelOf = useMemo(
    () => Object.fromEntries(catalog.map((p) => [p.key, `${p.modality} · ${p.label.toLowerCase()}`])),
    [catalog],
  );

  useEffect(() => {
    if (!getUuid()) return;
    getPipelines()
      .then((r) => setCatalog(r.pipelines))
      .catch(() => setCatalog([]));
  }, []);

  // Resolve the scope's names (collection + folder path) for the scope row.
  useEffect(() => {
    if (!cid || !getUuid()) {
      setScopeCrumbs(null);
      return;
    }
    browse(cid, dir)
      .then((b) => setScopeCrumbs(b.breadcrumb))
      .catch(() => setScopeCrumbs(null));
  }, [cid, dir]);

  function toggle(m: Modality) {
    setMods((prev) => {
      const next = new Set(prev);
      next.has(m) ? next.delete(m) : next.add(m);
      return next.size ? next : prev;
    });
  }

  function togglePipe(key: string) {
    setPipes((prev) => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });
  }

  // Effective pipeline selection: per active type, its chosen chips — or all of its
  // pipelines when none are chosen. If that equals "everything for these types",
  // omit the param (the backend's legacy path, battery-tuned ordering).
  const effectivePipes = useMemo(() => {
    if (!catalog.length) return undefined;
    const out: string[] = [];
    let narrowed = false;
    for (const m of mods) {
      const options = catalog.filter((p) => p.modality === m);
      const chosen = options.filter((p) => pipes.has(p.key));
      if (chosen.length && chosen.length < options.length) narrowed = true;
      for (const p of chosen.length ? chosen : options) out.push(p.key);
    }
    return narrowed ? out : undefined;
  }, [catalog, mods, pipes]);

  useEffect(() => {
    if (!q.trim() || !getUuid()) {
      setHits(null);
      return;
    }
    let active = true;
    setBusy(true);
    search(q.trim(), {
      modalities: [...mods],
      pipelines: effectivePipes,
      collection_ids: cid ? [cid] : null,
      directory_id: dir,
      include_subdirs: subdirs,
      filters: metaFilters,
    })
      .then((r) => active && setHits(r.hits))
      .catch((e) => active && toast.error(String((e as Error).message)))
      .finally(() => active && setBusy(false));
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q, cid, dir, subdirs, [...mods].sort().join(","), (effectivePipes ?? []).join(","), JSON.stringify(metaFilters)]);

  function clearScope() {
    const params = new URLSearchParams();
    if (q) params.set("q", q);
    router.push(`/search?${params.toString()}`);
  }

  return (
    <div className="flex w-full">
      <Filters
        mods={mods}
        toggle={toggle}
        catalog={catalog}
        pipes={pipes}
        togglePipe={togglePipe}
        subdirs={subdirs}
        setSubdirs={setSubdirs}
        scoped={!!dir}
        filterState={filterState}
        setFilterState={setFilterState}
      />

      <div className="min-w-0 flex-1 px-5 py-5">
        <div className="mb-2 flex items-center gap-2">
          <Sparkles className="size-5 text-primary" />
          <h1 className="text-lg font-semibold tracking-tight">
            {q ? <>Results for “{q}”</> : "Search your knowledge"}
          </h1>
          {busy && <span className="text-xs text-muted-foreground">searching…</span>}
        </div>

        {scopeCrumbs && <ScopeRow crumbs={scopeCrumbs} subdirs={subdirs} onClear={clearScope} />}

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
              const via = h.matched_pipelines?.length
                ? h.matched_pipelines.map((k) => labelOf[k] ?? k)
                : h.matched_spaces;
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
                    {via.length > 0 && (
                      <div className="text-xs text-muted-foreground">
                        matched via {via.join(", ")}
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

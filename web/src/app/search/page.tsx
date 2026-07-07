"use client";

import {
  Badge,
  Button,
  Checkbox,
  EmptyState,
  FilterField,
  FilterSheet,
  ScopePicker,
  cn,
  toast,
  useHideOnScroll,
  type FilterBarState,
  type FilterFieldDef,
  type ScopeOption,
} from "@drekis/shader";
import {
  ChevronDown,
  ChevronUp,
  FileText,
  Folder,
  FolderOpen,
  Image as ImageIcon,
  Layers,
  Library,
  Music,
  Sparkles,
  Tag,
  Video,
  X,
} from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useMemo, useState } from "react";
import { FilePreviewDialog } from "@/components/FileViewer";
import { metaFieldsFor, toMetaFilters } from "@/components/MetaFilterBar";
import {
  browse,
  fileBlobUrl,
  getCollectionTags,
  getFile,
  getPipelines,
  listCollections,
  search,
} from "@/lib/api";
import { getUuid } from "@/lib/config";
import {
  MODALITIES,
  type Collection,
  type Crumb,
  type FileItem,
  type Modality,
  type PipelineInfo,
  type SearchHit,
} from "@/lib/types";

const ICON: Record<Modality, typeof FileText> = {
  text: FileText,
  image: ImageIcon,
  audio: Music,
  video: Video,
};

// The objects doc joined a period-ending caption with ". " + tags → a stray "..".
// Collapse it for display (fixes already-embedded docs without a reindex).
function cleanSegment(text: string): string {
  return text.replace(/\.\s*\.\s+/g, ". ");
}

/** The "Search by" tree: one boolean field per file type; nested behind its
 *  ExpandToggle (with the guide line) go that type's search pipelines and its
 *  metadata filters. Everything UNchecked is the default and means everything —
 *  checking narrows. */
function buildTypeFields(catalog: PipelineInfo[]): FilterFieldDef[] {
  return MODALITIES.map((m) => {
    const Icon = ICON[m];
    const pipeOptions = catalog
      .filter((p) => p.modality === m)
      .map((p) => ({ value: p.key, label: p.label }));
    return {
      key: `type.${m}`,
      label: <span className="capitalize">{m}</span>,
      icon: <Icon className="size-4 text-muted-foreground" />,
      kind: "boolean" as const,
      children: [
        ...(pipeOptions.length > 1
          ? [{ key: `pipes.${m}`, label: "Search via", kind: "multi" as const, options: pipeOptions }]
          : []),
        ...metaFieldsFor(m),
      ],
    };
  });
}

type FilterProps = {
  typeFields: FilterFieldDef[];
  state: FilterBarState;
  setState: (s: FilterBarState) => void;
  subdirs: boolean;
  setSubdirs: (v: boolean) => void;
  scoped: boolean;
  collectionOptions: ScopeOption[];
  selectedCollections: string[];
  onCollectionsChange: (ids: string[]) => void;
  tagOptions: ScopeOption[];
  selectedTags: string[];
  onTagsChange: (ids: string[]) => void;
};

/** The filter controls, layout-agnostic — used by the desktop aside and the mobile sheet. */
function FiltersContent(p: FilterProps) {
  return (
    <>
      {/* Collection scope — only when not already pinned to a browsed folder. */}
      {!p.scoped && p.collectionOptions.length > 0 && (
        <ScopePicker
          options={p.collectionOptions}
          selected={p.selectedCollections}
          onChange={p.onCollectionsChange}
          icon={<Library className="size-4" />}
          title="Search in"
          anyLabel="Any collection"
          modalTitle="Search in collections"
          searchPlaceholder="Search collections…"
        />
      )}

      <div>
        <div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          <Layers className="size-3.5" /> Search by
        </div>
        <div className="flex flex-col gap-2.5">
          {p.typeFields.map((f) => (
            <FilterField key={f.key} def={f} state={p.state} onChange={p.setState} />
          ))}
        </div>
      </div>

      {/* Object tags — pick from the tags that actually exist in the current scope. */}
      {p.tagOptions.length > 0 && (
        <ScopePicker
          options={p.tagOptions}
          selected={p.selectedTags}
          onChange={p.onTagsChange}
          layout="chips"
          icon={<Tag className="size-4" />}
          title="Tags"
          anyLabel="Any tag"
          modalTitle="Filter by object tags"
          searchPlaceholder="Search tags…"
        />
      )}

      {p.scoped && (
        <div>
          <div className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Scope
          </div>
          <label className="flex cursor-pointer items-center gap-2.5 text-sm">
            <Checkbox checked={p.subdirs} onCheckedChange={() => p.setSubdirs(!p.subdirs)} />
            <span>Include subfolders</span>
          </label>
        </div>
      )}
    </>
  );
}

/** Layer-dependent filter aside — sticky under the top bar, shifts up when it hides. */
function Filters(p: FilterProps) {
  const hidden = useHideOnScroll(true);
  return (
    <aside
      className={cn(
        "sticky hidden w-60 shrink-0 flex-col gap-5 overflow-y-auto border-r border-border bg-background px-4 py-5 transition-[top,height] duration-300 lg:flex",
        hidden ? "top-0 h-dvh" : "top-14 h-[calc(100dvh-3.5rem)]",
      )}
    >
      <FiltersContent {...p} />
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

/** Side photo on an image hit — auth'd fetch → object URL. Click = full preview. */
function HitThumb({ id, name, onClick }: { id: string; name: string; onClick: () => void }) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    let obj: string | null = null;
    let cancelled = false;
    fileBlobUrl(id)
      .then((u) => {
        if (cancelled) URL.revokeObjectURL(u);
        else {
          obj = u;
          setUrl(u);
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
      if (obj) URL.revokeObjectURL(obj);
    };
  }, [id]);
  // Fixed box; the image sits inside at its true aspect ratio (object-contain, no crop).
  const box = "flex h-32 w-44 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-muted/30 sm:h-36 sm:w-52";
  if (!url) return <div className={cn(box, "animate-pulse")} />;
  return (
    <div className={box}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={url}
        alt={name}
        onClick={onClick}
        className="max-h-full max-w-full cursor-zoom-in object-contain transition-opacity hover:opacity-90"
      />
    </div>
  );
}

function SearchView() {
  const sp = useSearchParams();
  const router = useRouter();
  const q = sp.get("q") ?? "";
  const cid = sp.get("cid");
  const dir = sp.get("dir");
  const [catalog, setCatalog] = useState<PipelineInfo[]>([]);
  const [subdirs, setSubdirs] = useState(true);
  const [scopeCrumbs, setScopeCrumbs] = useState<Crumb[] | null>(null);
  const [hits, setHits] = useState<SearchHit[] | null>(null);
  const [busy, setBusy] = useState(false);
  // One tree of state for types + pipelines + metadata. Default {} = nothing checked,
  // which MEANS everything: checking types/pipelines narrows, never gates.
  const [filterState, setFilterState] = useState<FilterBarState>({});
  const [preview, setPreview] = useState<FileItem | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [collections, setCollections] = useState<Collection[]>([]);
  const [scopeCids, setScopeCids] = useState<string[]>([]); // [] = any collection
  const [tagCounts, setTagCounts] = useState<{ tag: string; count: number }[]>([]);
  const [selectedTags, setSelectedTags] = useState<string[]>([]);

  const typeFields = useMemo(() => buildTypeFields(catalog), [catalog]);
  const collectionOptions = useMemo<ScopeOption[]>(
    () => collections.map((c) => ({ id: c.id, label: c.name })),
    [collections],
  );
  const tagOptions = useMemo<ScopeOption[]>(
    () => tagCounts.map((t) => ({ id: t.tag, label: `${t.tag} (${t.count})`, keywords: t.tag })),
    [tagCounts],
  );

  // Empty-means-all: unchecked types behave as if every type were checked.
  const checkedMods = MODALITIES.filter((m) => filterState[`type.${m}`]?.on);
  const mods = new Set<Modality>(checkedMods.length ? checkedMods : MODALITIES);

  // Selected tags → an exact meta.tags filter (array-contains-any), on top of the
  // type-aware metadata filters. Empty = no tag constraint.
  const metaFilters = [
    ...toMetaFilters(filterState, mods),
    ...(selectedTags.length ? [{ field: "tags", op: "in" as const, value: selectedTags }] : []),
  ];
  const labelOf = useMemo(
    () => Object.fromEntries(catalog.map((p) => [p.key, `${p.modality} · ${p.label.toLowerCase()}`])),
    [catalog],
  );

  useEffect(() => {
    if (!getUuid()) return;
    getPipelines()
      .then((r) => setCatalog(r.pipelines))
      .catch(() => setCatalog([]));
    listCollections()
      .then(setCollections)
      .catch(() => setCollections([]));
  }, []);

  // What the search scopes to: a browsed folder's collection wins; otherwise the
  // ScopePicker selection ([] = every accessible collection).
  const searchCollectionIds = cid ? [cid] : scopeCids.length ? scopeCids : null;

  // Load the tag catalogue for the collections in scope (merged) — a browsed folder
  // scopes to its own subtree; otherwise the picked (or all) collections.
  const tagScope = (searchCollectionIds ?? collections.map((c) => c.id)).join(",");
  useEffect(() => {
    const ids = tagScope ? tagScope.split(",") : [];
    if (!ids.length || !getUuid()) {
      setTagCounts([]);
      return;
    }
    let active = true;
    Promise.all(ids.map((id) => getCollectionTags(id, cid ? dir : null).catch(() => [])))
      .then((lists) => {
        if (!active) return;
        const merged = new Map<string, number>();
        for (const list of lists)
          for (const { tag, count } of list) merged.set(tag, (merged.get(tag) ?? 0) + count);
        setTagCounts(
          [...merged].map(([tag, count]) => ({ tag, count })).sort((a, b) => b.count - a.count),
        );
      });
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tagScope, cid, dir]);

  // Drop selected tags that fall out of the current scope's catalogue.
  useEffect(() => {
    const avail = new Set(tagCounts.map((t) => t.tag));
    setSelectedTags((prev) => {
      const next = prev.filter((t) => avail.has(t));
      return next.length === prev.length ? prev : next;
    });
  }, [tagCounts]);

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

  // Effective pipeline selection: per active type, its chosen chips — or all of its
  // pipelines when none are chosen (empty-means-all again). If that equals
  // "everything for these types", omit the param (the backend's legacy path,
  // battery-tuned ordering).
  const effectivePipes = useMemo(() => {
    if (!catalog.length) return undefined;
    const out: string[] = [];
    let narrowed = false;
    for (const m of mods) {
      const options = catalog.filter((p) => p.modality === m);
      const chosen = options.filter((p) => filterState[`pipes.${m}`]?.in?.includes(p.key));
      if (chosen.length && chosen.length < options.length) narrowed = true;
      for (const p of chosen.length ? chosen : options) out.push(p.key);
    }
    return narrowed ? out : undefined;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [catalog, [...mods].sort().join(","), JSON.stringify(filterState)]);

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
      collection_ids: searchCollectionIds,
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
  }, [q, cid, dir, subdirs, (searchCollectionIds ?? []).join(","), [...mods].sort().join(","), (effectivePipes ?? []).join(","), JSON.stringify(metaFilters)]);

  function clearScope() {
    const params = new URLSearchParams();
    if (q) params.set("q", q);
    router.push(`/search?${params.toString()}`);
  }

  function openPreview(fileId: string) {
    getFile(fileId)
      .then(setPreview)
      .catch((e) => toast.error(String((e as Error).message)));
  }

  function toggleExpand(fileId: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      next.has(fileId) ? next.delete(fileId) : next.add(fileId);
      return next;
    });
  }

  const filterProps = {
    typeFields,
    state: filterState,
    setState: setFilterState,
    subdirs,
    setSubdirs,
    scoped: !!dir,
    collectionOptions,
    selectedCollections: scopeCids,
    onCollectionsChange: setScopeCids,
    tagOptions,
    selectedTags,
    onTagsChange: setSelectedTags,
  };

  // Mobile filter sheet, toggled by the top bar's filter button via ?filters=1.
  const filtersOpen = sp.get("filters") === "1";
  function closeFilters() {
    const params = new URLSearchParams(sp.toString());
    params.delete("filters");
    router.replace(`/search?${params.toString()}`);
  }

  return (
    <div className="flex w-full">
      <Filters {...filterProps} />

      <FilterSheet
        open={filtersOpen}
        onClose={closeFilters}
        onSeeResults={closeFilters}
        count={hits?.length ?? null}
      >
        <FiltersContent {...filterProps} />
      </FilterSheet>

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
          <div className="space-y-3">
            {hits.map((h) => {
              const Icon = ICON[h.modality];
              const via = h.matched_pipelines?.length
                ? h.matched_pipelines.map((k) => labelOf[k] ?? k)
                : h.matched_spaces;
              const isOpen = expanded.has(h.file_id);
              const goTo = {
                pathname: `/c/${h.collection_id}`,
                query: h.directory_id ? { dir: h.directory_id } : undefined,
              };
              const pct = Math.round(Math.max(0, Math.min(1, h.score)) * 100);
              return (
                <div key={h.file_id} className="rounded-xl px-1 py-1.5 transition-colors hover:bg-muted/30">
                 <div className="flex gap-4">
                  {/* media/type block at the side: the photo (or a big type icon)
                      IS the card's visual division — no border, page background */}
                  {h.modality === "image" ? (
                    <HitThumb
                      id={h.file_id}
                      name={h.file_name}
                      onClick={() => openPreview(h.file_id)}
                    />
                  ) : (
                    <div className="flex size-14 shrink-0 items-center justify-center rounded-xl bg-muted/60">
                      <Icon className="size-7 text-muted-foreground" />
                    </div>
                  )}

                  <div className="min-w-0 flex-1 space-y-1 py-0.5">
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => openPreview(h.file_id)}
                        className="truncate font-medium transition-colors hover:text-primary"
                        title="Preview"
                      >
                        {h.file_name}
                      </button>
                      <Badge variant="secondary">{h.modality}</Badge>
                      <span className="ms-auto text-xs text-muted-foreground">
                        {h.score.toFixed(3)}
                      </span>
                      <Link
                        href={goTo}
                        title="Go to folder"
                        className="flex h-7 shrink-0 items-center gap-1 rounded-md px-2 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                      >
                        <FolderOpen className="size-3.5" /> Go to
                      </Link>
                      {h.best?.text && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 w-7 p-0"
                          title={isOpen ? "Collapse" : "Expand"}
                          onClick={() => toggleExpand(h.file_id)}
                        >
                          {isOpen ? <ChevronUp className="size-4" /> : <ChevronDown className="size-4" />}
                        </Button>
                      )}
                    </div>
                    {/* clickable breadcrumb: each level jumps into that folder */}
                    <div className="truncate text-xs text-muted-foreground">
                      {h.breadcrumb.map((c, i) => (
                        <span key={c.id ?? `l${i}`}>
                          {i > 0 && <span className="mx-1">/</span>}
                          <Link
                            href={{
                              pathname: `/c/${h.collection_id}`,
                              query: c.id ? { dir: c.id } : undefined,
                            }}
                            className="transition-colors hover:text-foreground hover:underline"
                          >
                            {c.name}
                          </Link>
                        </span>
                      ))}
                    </div>
                    {h.best?.text && (
                      <p
                        className={cn(
                          "text-sm text-foreground/80",
                          !isOpen && "line-clamp-3",
                        )}
                      >
                        {cleanSegment(h.best.text)}
                      </p>
                    )}
                    {via.length > 0 && (
                      <div className="text-xs text-muted-foreground">
                        matched via {via.join(", ")}
                      </div>
                    )}
                  </div>
                 </div>
                 {/* match-strength separator: bar filled to the score %, platform color */}
                 <div
                   className="mt-2 h-1 overflow-hidden rounded-full bg-muted"
                   title={`${pct}% match`}
                 >
                   <div className="h-full rounded-full bg-primary transition-[width]" style={{ width: `${pct}%` }} />
                 </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <FilePreviewDialog file={preview} onClose={() => setPreview(null)} />
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

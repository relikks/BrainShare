import { useEffect, useMemo, useRef, useState } from "react";
import { Eye, Loader2, Search } from "lucide-react";
import { fetchBranding, searchCorpus } from "@/lib/api";
import { loadSettings, isConfigured } from "@/lib/settings";
import type { Branding, PageResult, Settings } from "@/types";
import { PreviewModal } from "./PreviewModal";

const DEFAULT_BRANDING: Branding = { name: "SIGSHARE", logo_url: "" };
const HOVER_OPEN_MS = 350;

export function SearchApp() {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [branding, setBranding] = useState<Branding>(DEFAULT_BRANDING);
  const [query, setQuery] = useState("");
  const [submittedQuery, setSubmittedQuery] = useState("");
  const [pages, setPages] = useState<PageResult[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [elapsed, setElapsed] = useState<number | null>(null);
  const [preview, setPreview] = useState<PageResult | null>(null);

  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    loadSettings().then((s) => {
      setSettings(s);
      if (s.endpoint) fetchBranding(s.endpoint).then(setBranding).catch(() => {});
    });
  }, []);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  async function runSearch(e?: React.FormEvent) {
    e?.preventDefault();
    if (!settings || !query.trim()) return;
    setLoading(true);
    setErr(null);
    setPages(null);
    setSubmittedQuery(query.trim());
    const t0 = performance.now();
    try {
      const res = await searchCorpus(
        settings.endpoint,
        settings.uuid,
        query.trim(),
        settings.topK,
      );
      setPages(res);
      setElapsed(performance.now() - t0);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  const queryTerms = useMemo(
    () =>
      submittedQuery
        .toLowerCase()
        .split(/\s+/)
        .filter((t) => t.length > 1),
    [submittedQuery],
  );

  if (!settings) return <CenterMessage>Cargando…</CenterMessage>;
  if (!isConfigured(settings)) {
    return (
      <CenterMessage>
        Abre el icono de la extensión {branding.name} primero para registrarte.
      </CenterMessage>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <TopBar branding={branding} username={settings.username} />

      <main className="mx-auto max-w-3xl px-6 pt-10 pb-24">
        <SearchBar
          inputRef={inputRef}
          query={query}
          setQuery={setQuery}
          onSubmit={runSearch}
          loading={loading}
        />

        <MetaLine
          submittedQuery={submittedQuery}
          count={pages?.length ?? null}
          elapsed={elapsed}
          loading={loading}
        />

        {err && (
          <div className="mt-6 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
            {err}
          </div>
        )}

        {loading && <SkeletonList />}
        {!loading && pages && pages.length === 0 && (
          <EmptyState type="no-results" query={submittedQuery} />
        )}
        {!loading && !pages && !err && <EmptyState type="start" />}

        {!loading && pages && pages.length > 0 && (
          <ul className="mt-6 space-y-2">
            {pages.map((page, i) => (
              <ResultRow key={page.url + i} page={page} onPreview={setPreview} />
            ))}
          </ul>
        )}
      </main>

      {preview && settings && (
        <PreviewModal
          page={preview}
          settings={settings}
          queryTerms={queryTerms}
          onClose={() => setPreview(null)}
        />
      )}
    </div>
  );
}

function TopBar({ branding, username }: { branding: Branding; username: string }) {
  return (
    <header className="sticky top-0 z-10 bg-white/90 backdrop-blur border-b border-slate-200">
      <div className="mx-auto max-w-5xl px-6 h-14 flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          {branding.logo_url ? (
            <img src={branding.logo_url} alt="" className="w-7 h-7 rounded-md" />
          ) : (
            <div className="w-7 h-7 rounded-md bg-gradient-to-br from-indigo-500 to-fuchsia-500 grid place-items-center text-white text-xs font-bold">
              Σ
            </div>
          )}
          <span className="font-semibold tracking-tight text-slate-900">
            {branding.name}
          </span>
        </div>
        <div className="text-xs text-slate-500">{username}</div>
      </div>
    </header>
  );
}

function SearchBar({
  inputRef,
  query,
  setQuery,
  onSubmit,
  loading,
}: {
  inputRef: React.RefObject<HTMLInputElement>;
  query: string;
  setQuery: (s: string) => void;
  onSubmit: (e?: React.FormEvent) => void;
  loading: boolean;
}) {
  return (
    <form onSubmit={onSubmit}>
      <div className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-sm focus-within:border-brand focus-within:ring-2 focus-within:ring-brand/15 transition">
        {loading ? (
          <Loader2 className="size-5 text-slate-400 animate-spin shrink-0" />
        ) : (
          <Search className="size-5 text-slate-400 shrink-0" />
        )}
        <input
          ref={inputRef}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Buscar en tu corpus…"
          className="flex-1 bg-transparent outline-none text-base placeholder:text-slate-400 text-slate-900"
        />
        <kbd className="hidden sm:inline-flex items-center rounded border border-slate-200 bg-slate-50 px-1.5 py-0.5 text-[10px] text-slate-500 font-mono">
          ⏎
        </kbd>
      </div>
    </form>
  );
}

function MetaLine({
  submittedQuery,
  count,
  elapsed,
  loading,
}: {
  submittedQuery: string;
  count: number | null;
  elapsed: number | null;
  loading: boolean;
}) {
  if (loading || !submittedQuery) return <div className="h-5 mt-3" />;
  return (
    <div className="mt-3 text-xs text-slate-500">
      <span className="text-slate-700 font-medium">{count ?? 0}</span>{" "}
      página{count === 1 ? "" : "s"}
      {elapsed !== null && <> · {Math.round(elapsed)} ms</>}
    </div>
  );
}

function ResultRow({
  page,
  onPreview,
}: {
  page: PageResult;
  onPreview: (p: PageResult) => void;
}) {
  const [hoverTimer, setHoverTimer] = useState<number | null>(null);

  let host = "";
  let origin = "";
  try {
    const u = new URL(page.url);
    host = u.hostname.replace(/^www\./, "");
    origin = u.origin;
  } catch {
    host = page.url;
  }
  const path = (() => {
    try {
      const u = new URL(page.url);
      return (u.pathname + u.search).replace(/\/$/, "") || "/";
    } catch {
      return "";
    }
  })();
  const favicon = origin ? `${origin}/favicon.ico` : "";

  function openPage() {
    const target = page.matched[0]?.goto_url || page.url;
    window.open(target, "_blank", "noopener");
  }

  function eyeHoverStart() {
    const t = window.setTimeout(() => onPreview(page), HOVER_OPEN_MS);
    setHoverTimer(t);
  }
  function eyeHoverEnd() {
    if (hoverTimer) {
      clearTimeout(hoverTimer);
      setHoverTimer(null);
    }
  }

  return (
    <li className="group flex items-center gap-3 rounded-lg border border-slate-200 bg-white px-4 py-3 hover:border-slate-300 hover:shadow-sm transition-colors">
      <Favicon src={favicon} host={host} />

      <button
        onClick={openPage}
        className="min-w-0 flex-1 text-left"
        title={page.url}
      >
        <h3 className="text-[15px] font-medium text-slate-900 group-hover:text-brand truncate">
          {page.page_title || host || page.url}
        </h3>
        <p className="mt-0.5 text-xs truncate">
          <span className="text-slate-700">{host}</span>
          <span className="text-slate-400">{path}</span>
        </p>
      </button>

      {page.matched.length > 1 && (
        <span className="hidden sm:inline-flex items-center rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-medium text-slate-600">
          {page.matched.length} fragmentos
        </span>
      )}

      <button
        onClick={() => onPreview(page)}
        onMouseEnter={eyeHoverStart}
        onMouseLeave={eyeHoverEnd}
        onFocus={eyeHoverStart}
        onBlur={eyeHoverEnd}
        className="shrink-0 size-9 grid place-items-center rounded-md text-slate-400 hover:text-brand hover:bg-brand-light transition-colors"
        aria-label="Previsualizar"
        title="Previsualizar (hover) o clic"
      >
        <Eye className="size-4" />
      </button>
    </li>
  );
}

function Favicon({ src, host }: { src: string; host: string }) {
  const [failed, setFailed] = useState(false);
  if (!src || failed) {
    const letter = (host || "?")[0]?.toUpperCase() ?? "?";
    return (
      <div className="shrink-0 size-9 grid place-items-center rounded-md bg-slate-100 text-slate-500 text-sm font-semibold">
        {letter}
      </div>
    );
  }
  return (
    <div className="shrink-0 size-9 grid place-items-center rounded-md bg-white border border-slate-200">
      <img
        src={src}
        alt=""
        className="size-5"
        onError={() => setFailed(true)}
      />
    </div>
  );
}

function SkeletonList() {
  return (
    <ul className="mt-6 space-y-2">
      {Array.from({ length: 5 }).map((_, i) => (
        <li
          key={i}
          className="flex items-center gap-3 rounded-lg border border-slate-200 bg-white px-4 py-3 animate-pulse"
        >
          <div className="size-9 rounded-md bg-slate-100" />
          <div className="flex-1 space-y-2">
            <div className="h-4 w-2/3 rounded bg-slate-200" />
            <div className="h-3 w-1/2 rounded bg-slate-100" />
          </div>
          <div className="size-9 rounded-md bg-slate-100" />
        </li>
      ))}
    </ul>
  );
}

function EmptyState({
  type,
  query,
}: {
  type: "start" | "no-results";
  query?: string;
}) {
  if (type === "start") {
    return (
      <div className="mt-20 text-center space-y-3">
        <div className="mx-auto w-12 h-12 rounded-xl bg-brand-light grid place-items-center">
          <Search className="size-5 text-brand" />
        </div>
        <p className="text-slate-900 font-medium">Busca en tu corpus</p>
        <p className="text-sm text-slate-500 max-w-sm mx-auto">
          Empieza a escribir arriba. Los resultados te llevan a la sección exacta en la página original.
        </p>
      </div>
    );
  }
  return (
    <div className="mt-16 text-center space-y-1">
      <p className="text-slate-900">Sin resultados para "{query}".</p>
      <p className="text-sm text-slate-500">Prueba con menos palabras o guarda más páginas.</p>
    </div>
  );
}

function CenterMessage({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen grid place-items-center bg-slate-50 text-slate-700 px-6 text-center">
      <p>{children}</p>
    </div>
  );
}

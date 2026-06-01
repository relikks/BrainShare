import { useEffect, useState } from "react";
import { ArrowUpRight, Loader2, X } from "lucide-react";
import type { MatchedChunk, PageContent, PageResult, Settings } from "@/types";
import { getPageContent } from "@/lib/api";
import { Markdown } from "./Markdown";

export function PreviewModal({
  page,
  settings,
  queryTerms = [],
  onClose,
}: {
  page: PageResult;
  settings: Settings;
  queryTerms?: string[];
  onClose: () => void;
}) {
  const [content, setContent] = useState<PageContent | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [onClose]);

  useEffect(() => {
    let cancelled = false;
    setContent(null);
    setErr(null);
    getPageContent(settings.endpoint, settings.uuid, page.url)
      .then((c) => !cancelled && setContent(c))
      .catch((e) => !cancelled && setErr((e as Error).message));
    return () => {
      cancelled = true;
    };
  }, [settings.endpoint, settings.uuid, page.url]);

  let host = "";
  let origin = "";
  try {
    const u = new URL(page.url);
    host = u.hostname.replace(/^www\./, "");
    origin = u.origin;
  } catch {
    host = page.url;
  }
  const favicon = origin ? `${origin}/favicon.ico` : "";

  // Index matched chunks by their position for O(1) lookup while rendering.
  const matchByPosition = new Map<number, MatchedChunk>();
  for (const m of page.matched) matchByPosition.set(m.position, m);

  const bestGoto =
    page.matched[0]?.goto_url ||
    page.url;

  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center p-6 bg-slate-900/30 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="w-full max-w-3xl max-h-[88vh] flex flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex items-center gap-3 border-b border-slate-200 bg-white px-5 py-3.5">
          {favicon && (
            <img src={favicon} alt="" className="size-4 rounded-sm shrink-0" />
          )}
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium text-slate-900 truncate leading-tight">
              {content?.page_title || page.page_title || host}
            </p>
            <p className="text-xs text-slate-500 truncate">{page.url}</p>
          </div>
          <a
            href={bestGoto}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 rounded-md bg-brand px-3 py-1.5 text-xs font-medium text-white hover:bg-brand-hover transition-colors"
          >
            Abrir <ArrowUpRight className="size-3.5" />
          </a>
          <button
            onClick={onClose}
            className="size-8 grid place-items-center rounded-md text-slate-500 hover:bg-slate-100 hover:text-slate-900 transition-colors"
            aria-label="Cerrar"
          >
            <X className="size-4" />
          </button>
        </header>

        <div className="flex-1 overflow-y-auto">
          {!content && !err && (
            <div className="grid place-items-center h-64 text-slate-500 text-sm">
              <div className="flex items-center gap-2">
                <Loader2 className="size-4 animate-spin" /> Cargando página…
              </div>
            </div>
          )}
          {err && (
            <div className="m-6 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
              {err}
            </div>
          )}
          {content && (
            <article className="mx-auto max-w-2xl px-8 py-8">
              {content.chunks.map((chunk) => {
                const match = matchByPosition.get(chunk.position);
                return (
                  <ChunkBlock
                    key={chunk.position}
                    chunk={chunk}
                    match={match}
                    queryTerms={queryTerms}
                  />
                );
              })}
            </article>
          )}
        </div>
      </div>
    </div>
  );
}

/**
 * Map score (0..1) to a blue swatch. Combines:
 *  - HSL saturation (15% → 100%) so weak matches feel grayer
 *  - HSL lightness (72% → 55%) so strong matches are deeper
 *  - opacity (0.45 → 1.0) for the final fade
 * Brand reference: #447bff ≈ hsl(221 100% 64%).
 */
function scoreSwatch(score: number) {
  const s = Math.max(0, Math.min(1, score));
  const saturation = 15 + s * 85;
  const lightness = 72 - s * 17;
  return {
    background: `hsl(221 ${saturation}% ${lightness}%)`,
    opacity: 0.45 + 0.55 * s,
  };
}

function ChunkBlock({
  chunk,
  match,
  queryTerms,
}: {
  chunk: { position: number; text: string; heading_path: string[] };
  match: MatchedChunk | undefined;
  queryTerms: string[];
}) {
  const isMatch = !!match;
  const swatch = isMatch ? scoreSwatch(match!.score) : null;
  return (
    <section data-position={chunk.position} className="flex items-stretch gap-4 py-1">
      <div
        className="shrink-0 w-[4px] my-1 rounded-full transition-[opacity,background-color]"
        style={swatch ?? { opacity: 0 }}
        title={isMatch ? `Score ${Math.round(match!.score * 100)}%` : undefined}
      />
      <div className="flex-1 min-w-0">
        <Markdown text={chunk.text} highlight={queryTerms} />
      </div>
    </section>
  );
}

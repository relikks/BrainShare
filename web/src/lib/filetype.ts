import type { FileItem } from "./types";

/** Rich, human file typing derived from the filename extension (falls back to the
 *  backend modality). Drives the coloured type badge + thumbnail tint in the Drive,
 *  so a `.svg` reads as "Vector", a `.xlsx` as "Spreadsheet", etc. — richer than the
 *  four coarse modalities the embedder groups files into. */
export interface FileKind {
  ext: string; // short uppercase chip label, e.g. "JPG"
  label: string; // human type, e.g. "Image"
  badge: string; // tailwind bg/text for the chip
  tint: string; // tailwind bg for the thumbnail placeholder
}

// One entry per family; tailwind classes are written out in full so they survive purge.
const KINDS: Record<string, Omit<FileKind, "ext">> = {
  image: { label: "Image", badge: "bg-violet-500/15 text-violet-400", tint: "bg-violet-500/10" },
  vector: { label: "Vector", badge: "bg-fuchsia-500/15 text-fuchsia-400", tint: "bg-fuchsia-500/10" },
  video: { label: "Video", badge: "bg-pink-500/15 text-pink-400", tint: "bg-pink-500/10" },
  audio: { label: "Audio", badge: "bg-orange-500/15 text-orange-400", tint: "bg-orange-500/10" },
  pdf: { label: "PDF", badge: "bg-red-500/15 text-red-400", tint: "bg-red-500/10" },
  doc: { label: "Document", badge: "bg-blue-500/15 text-blue-400", tint: "bg-blue-500/10" },
  slides: { label: "Slides", badge: "bg-amber-500/15 text-amber-400", tint: "bg-amber-500/10" },
  sheet: { label: "Spreadsheet", badge: "bg-emerald-500/15 text-emerald-400", tint: "bg-emerald-500/10" },
  text: { label: "Text", badge: "bg-slate-500/15 text-slate-400", tint: "bg-slate-500/10" },
  markdown: { label: "Markdown", badge: "bg-slate-500/15 text-slate-400", tint: "bg-slate-500/10" },
  code: { label: "Code", badge: "bg-yellow-500/15 text-yellow-400", tint: "bg-yellow-500/10" },
  archive: { label: "Archive", badge: "bg-zinc-500/15 text-zinc-400", tint: "bg-zinc-500/10" },
  data: { label: "Data", badge: "bg-emerald-500/15 text-emerald-400", tint: "bg-emerald-500/10" },
};

const EXT_FAMILY: Record<string, keyof typeof KINDS> = {
  jpg: "image", jpeg: "image", png: "image", gif: "image", webp: "image", heic: "image",
  bmp: "image", tif: "image", tiff: "image", avif: "image",
  svg: "vector", ai: "vector", eps: "vector",
  mp4: "video", mov: "video", webm: "video", mkv: "video", avi: "video", m4v: "video",
  mp3: "audio", wav: "audio", flac: "audio", m4a: "audio", ogg: "audio", aac: "audio",
  pdf: "pdf",
  doc: "doc", docx: "doc", odt: "doc", rtf: "doc",
  ppt: "slides", pptx: "slides", key: "slides",
  xls: "sheet", xlsx: "sheet", ods: "sheet",
  csv: "data", tsv: "data",
  txt: "text",
  md: "markdown", mdx: "markdown",
  js: "code", jsx: "code", ts: "code", tsx: "code", py: "code", java: "code", go: "code",
  rs: "code", rb: "code", php: "code", c: "code", cpp: "code", h: "code", css: "code",
  html: "code", json: "code", yaml: "code", yml: "code", sql: "code", sh: "code",
  zip: "archive", tar: "archive", gz: "archive", rar: "archive", "7z": "archive",
};

// Fallback family from the coarse embedder modality when the extension is unknown.
const MODALITY_FAMILY: Record<string, keyof typeof KINDS> = {
  image: "image", audio: "audio", video: "video", text: "text",
};

export function fileKind(f: Pick<FileItem, "name" | "modality">): FileKind {
  const ext = (f.name.split(".").pop() ?? "").toLowerCase();
  const fam = EXT_FAMILY[ext] ?? MODALITY_FAMILY[f.modality] ?? "text";
  const chip = ext && ext.length <= 4 ? ext.toUpperCase() : KINDS[fam].label.slice(0, 3).toUpperCase();
  return { ext: chip, ...KINDS[fam] };
}

/** Human-readable size (1 KB = 1024 B). */
export function humanSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const kb = bytes / 1024;
  if (kb < 1024) return `${kb < 10 ? kb.toFixed(1) : Math.round(kb)} KB`;
  const mb = kb / 1024;
  if (mb < 1024) return `${mb < 10 ? mb.toFixed(1) : Math.round(mb)} MB`;
  return `${(mb / 1024).toFixed(1)} GB`;
}

/** Short "modified" date like "Jul 2, 2026" from an ISO timestamp. */
export function shortDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

/** A `width × height` label if the file carries pixel dims in its meta. */
export function dimsLabel(f: FileItem): string | null {
  const w = f.meta?.width as number | undefined;
  const h = f.meta?.height as number | undefined;
  return w && h ? `${w} × ${h}` : null;
}

/** A `m:ss` duration label if the file carries a duration in its meta. */
export function durationLabel(f: FileItem): string | null {
  const s = (f.meta?.duration_s ?? f.meta?.duration) as number | undefined;
  if (!s || s <= 0) return null;
  const m = Math.floor(s / 60);
  const sec = Math.round(s % 60);
  return `${m}:${sec.toString().padStart(2, "0")}`;
}

"use client";

import { Button, Dialog, DialogContent, DialogHeader, DialogTitle } from "@drekis/shader";
import { Tag, Users } from "lucide-react";
import type { Route } from "next";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { type FileFace, getFileFaces } from "@/lib/api";
import { getEndpoint, getUuid } from "@/lib/config";
import { faceColor } from "@/lib/person";
import type { FileItem } from "@/lib/types";

/** Fetch a file's bytes (auth'd) → Blob. The backend serves `/files/{id}/content` with the right
 *  `mime` and `Content-Disposition: inline`, but `<img src>` etc. can't carry the auth header, so we
 *  fetch with the Bearer token and hand the element an object URL instead. */
async function fetchBlob(fileId: string): Promise<Blob> {
  const uuid = getUuid();
  const res = await fetch(`${getEndpoint()}/files/${fileId}/content`, {
    headers: uuid ? { Authorization: `Bearer ${uuid}` } : {},
  });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
  return res.blob();
}

const isTextLike = (f: FileItem) =>
  f.modality === "text" ||
  f.mime.startsWith("text/") ||
  ["application/json", "application/xml", "application/javascript", "application/x-yaml"].includes(f.mime);
const isPdf = (f: FileItem) => f.mime === "application/pdf";

/** Renders ANY file type inline, Shader-styled: image / video / audio / PDF / text+code / download. */
export function FileViewer({ file }: { file: FileItem }) {
  const [url, setUrl] = useState<string | null>(null);
  const [text, setText] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const textMode = isTextLike(file);

  useEffect(() => {
    let cancelled = false;
    let obj: string | null = null;
    setUrl(null);
    setText(null);
    setErr(null);
    fetchBlob(file.id)
      .then(async (blob) => {
        if (cancelled) return;
        if (textMode) setText(await blob.text());
        else {
          obj = URL.createObjectURL(blob);
          setUrl(obj);
        }
      })
      .catch((e) => !cancelled && setErr(e instanceof Error ? e.message : String(e)));
    return () => {
      cancelled = true;
      if (obj) URL.revokeObjectURL(obj);
    };
  }, [file.id, textMode]);

  if (err)
    return (
      <div className="flex h-40 items-center justify-center rounded-lg border border-destructive/30 bg-destructive/5 text-sm text-destructive">
        No se pudo cargar el archivo · {err}
      </div>
    );
  if (url === null && text === null)
    return (
      <div className="flex h-40 animate-pulse items-center justify-center rounded-lg border border-border bg-muted/40 text-sm text-muted-foreground">
        Cargando…
      </div>
    );

  const frame = "rounded-lg border border-border bg-muted/20 overflow-hidden";

  if (file.modality === "image") return <ImageView file={file} url={url!} frame={frame} />;

  if (file.modality === "video")
    return <video src={url!} controls className={`${frame} mx-auto max-h-[72vh] w-full bg-black`} />;

  if (file.modality === "audio")
    return (
      <div className={`${frame} flex items-center p-4`}>
        <audio src={url!} controls className="w-full" />
      </div>
    );

  if (isPdf(file)) return <iframe src={url!} title={file.name} className={`${frame} h-[75vh] w-full`} />;

  if (textMode)
    return (
      <pre className={`${frame} max-h-[72vh] overflow-auto p-4 text-xs leading-relaxed text-foreground whitespace-pre-wrap`}>
        {text}
      </pre>
    );

  // Unknown type → offer the download.
  return (
    <div className={`${frame} flex h-40 flex-col items-center justify-center gap-3 text-sm text-muted-foreground`}>
      <span>No hay vista previa para <code className="rounded bg-muted px-1">{file.mime || "?"}</code></span>
      <a
        href={url!}
        download={file.name}
        className="rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90"
      >
        Descargar {file.name}
      </a>
    </div>
  );
}

interface ObjBox {
  label: string;
  bbox: number[];
  score: number;
}

/** Image view with optional people overlay (coloured face boxes → person profile) and
 *  object overlay (boxes → search for that object) + clickable tags. */
function ImageView({ file, url, frame }: { file: FileItem; url: string; frame: string }) {
  const router = useRouter();
  const [showPeople, setShowPeople] = useState(false);
  const [showObjects, setShowObjects] = useState(false);
  const [faces, setFaces] = useState<FileFace[] | null>(null);
  const [nat, setNat] = useState<{ w: number; h: number } | null>(null);
  const tags = Array.isArray(file.meta?.tags) ? (file.meta.tags as string[]) : [];
  const objects = (Array.isArray(file.meta?.objects) ? file.meta.objects : []) as ObjBox[];
  const namedCount = faces?.filter((f) => f.person_id).length ?? 0;

  useEffect(() => {
    if (showPeople && faces === null) getFileFaces(file.id).then(setFaces).catch(() => setFaces([]));
  }, [showPeople, file.id, faces]);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <Button
          size="sm"
          variant={showPeople ? "primary" : "outline"}
          onClick={() => setShowPeople((v) => !v)}
        >
          <Users className="size-4" /> People
          {faces ? ` (${namedCount})` : ""}
        </Button>
        {objects.length > 0 && (
          <Button
            size="sm"
            variant={showObjects ? "primary" : "outline"}
            onClick={() => setShowObjects((v) => !v)}
          >
            <Tag className="size-4" /> Objects ({objects.length})
          </Button>
        )}
      </div>

      <div className="relative mx-auto w-fit">
        {/* biome-ignore lint/nursery/noImgElement: object-url preview */}
        <img
          src={url}
          alt={file.name}
          onLoad={(e) => setNat({ w: e.currentTarget.naturalWidth, h: e.currentTarget.naturalHeight })}
          className={`${frame} block max-h-[64vh] w-auto object-contain`}
        />
        {showPeople &&
          nat &&
          faces?.map((f) => {
            const [x1, y1, x2, y2] = f.bbox;
            if (x2 <= x1 || y2 <= y1) return null;
            const color = faceColor(f.person_id, f.person_color);
            return (
              <button
                key={f.id}
                type="button"
                disabled={!f.person_id}
                onClick={() => f.person_id && router.push(`/people?person=${f.person_id}` as Route)}
                title={f.person_name ?? "Unknown"}
                style={{
                  left: `${(x1 / nat.w) * 100}%`,
                  top: `${(y1 / nat.h) * 100}%`,
                  width: `${((x2 - x1) / nat.w) * 100}%`,
                  height: `${((y2 - y1) / nat.h) * 100}%`,
                  borderColor: color,
                }}
                className="absolute rounded border-2 transition-[box-shadow] enabled:cursor-pointer enabled:hover:shadow-[0_0_0_3px_rgba(0,0,0,0.15)]"
              >
                {f.person_name && (
                  <span
                    className="absolute -top-5 left-0 max-w-32 truncate rounded px-1 py-0.5 text-[10px] font-medium text-white"
                    style={{ backgroundColor: color }}
                  >
                    {f.person_name}
                  </span>
                )}
              </button>
            );
          })}

        {showObjects &&
          nat &&
          objects.map((o, i) => {
            const [x1, y1, x2, y2] = o.bbox;
            if (x2 <= x1 || y2 <= y1) return null;
            return (
              <button
                // biome-ignore lint/suspicious/noArrayIndexKey: stable order per file
                key={`${o.label}-${i}`}
                type="button"
                onClick={() => router.push(`/search?tag=${encodeURIComponent(o.label)}` as Route)}
                title={`${o.label} · ${Math.round(o.score * 100)}% — search`}
                style={{
                  left: `${(x1 / nat.w) * 100}%`,
                  top: `${(y1 / nat.h) * 100}%`,
                  width: `${((x2 - x1) / nat.w) * 100}%`,
                  height: `${((y2 - y1) / nat.h) * 100}%`,
                }}
                className="absolute cursor-pointer rounded border-2 border-emerald-400 transition-[box-shadow] hover:shadow-[0_0_0_3px_rgba(16,185,129,0.25)]"
              >
                <span className="absolute -top-5 left-0 max-w-32 truncate rounded bg-emerald-500 px-1 py-0.5 text-[10px] font-medium text-white">
                  {o.label}
                </span>
              </button>
            );
          })}
      </div>

      {tags.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {tags.map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => router.push(`/search?tag=${encodeURIComponent(t)}` as Route)}
              className="rounded-full border border-border px-2 py-0.5 text-xs text-muted-foreground transition-colors hover:border-primary/50 hover:text-foreground"
            >
              {t}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/** Modal wrapper using Shader's Dialog: pass a file to open the viewer, `null` to close. */
export function FilePreviewDialog({ file, onClose }: { file: FileItem | null; onClose: () => void }) {
  const kb =
    !file
      ? ""
      : file.size >= 1024 * 1024
        ? `${(file.size / 1024 / 1024).toFixed(1)} MB`
        : `${Math.max(1, Math.round(file.size / 1024))} KB`;
  return (
    <Dialog open={!!file} onOpenChange={(open) => !open && onClose()}>
      <DialogContent fullScreenOnMobile className="max-h-[92vh] max-w-4xl overflow-hidden">
        {file ? (
          <>
            <DialogHeader>
              <DialogTitle className="truncate text-base">{file.name}</DialogTitle>
              <p className="truncate text-xs text-muted-foreground">
                {file.modality} · {file.mime || "?"} · {kb}
              </p>
            </DialogHeader>
            <div className="overflow-auto">
              <FileViewer file={file} />
            </div>
          </>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

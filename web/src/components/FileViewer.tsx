"use client";

import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@drekis/shader";
import { useEffect, useState } from "react";

import { getEndpoint, getUuid } from "@/lib/config";
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

  if (file.modality === "image")
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={url!} alt={file.name} className={`${frame} mx-auto max-h-[72vh] w-auto object-contain`} />;

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

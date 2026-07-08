"use client";

import { cn } from "@drekis/shader";
import { FileText, Image as ImageIcon, Music, Play, Video } from "lucide-react";
import { useEffect, useState } from "react";
import { fileBlobUrl } from "@/lib/api";
import { dimsLabel, durationLabel, fileKind } from "@/lib/filetype";
import type { FileItem, Modality } from "@/lib/types";

const MOD_ICON: Record<Modality, typeof FileText> = {
  text: FileText,
  image: ImageIcon,
  audio: Music,
  video: Video,
};

/** Preview surface for a file card. Real (lazy-loaded) thumbnail for raster images;
 *  a type-tinted placeholder with the modality icon + a dims/duration hint for
 *  everything else — mirroring the Drive grid mockup without faking data we lack. */
export function FileThumb({ file, className }: { file: FileItem; className?: string }) {
  const kind = fileKind(file);
  const Icon = MOD_ICON[file.modality];
  const dims = dimsLabel(file);
  const dur = durationLabel(file);
  const raster = file.modality === "image" && !file.name.toLowerCase().endsWith(".svg");
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!raster) return;
    let live = true;
    let made: string | null = null;
    fileBlobUrl(file.id)
      .then((u) => {
        if (live) {
          made = u;
          setUrl(u);
        } else {
          URL.revokeObjectURL(u);
        }
      })
      .catch(() => {});
    return () => {
      live = false;
      if (made) URL.revokeObjectURL(made);
    };
  }, [file.id, raster]);

  if (raster && url) {
    return (
      <div className={cn("relative overflow-hidden", className)}>
        {/* biome-ignore lint/nursery/noImgElement: object-url thumbnail, next/image can't help */}
        <img src={url} alt={file.name} className="size-full object-cover" />
        {dims && (
          <span className="absolute bottom-1.5 right-1.5 rounded bg-black/55 px-1.5 py-0.5 text-[10px] font-medium text-white/90">
            {dims}
          </span>
        )}
      </div>
    );
  }

  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center gap-1.5 text-muted-foreground",
        kind.tint,
        className,
      )}
    >
      {file.modality === "video" ? (
        <span className="flex size-9 items-center justify-center rounded-full bg-background/70 text-primary">
          <Play className="size-4 translate-x-[1px] fill-current" />
        </span>
      ) : (
        <Icon className="size-7 opacity-70" strokeWidth={1.75} />
      )}
      {(dims || dur) && <span className="text-[11px] font-medium">{dims ?? dur}</span>}
    </div>
  );
}

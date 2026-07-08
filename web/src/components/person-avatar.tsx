"use client";

import { cn } from "@drekis/shader";
import { useEffect, useState } from "react";
import { type EntityOut, entityPhotoBlobUrl } from "@/lib/api";

/** A person's profile photo (lazy-loaded blob) with an initial-letter fallback. */
export function PersonAvatar({
  person,
  className,
}: {
  person: EntityOut;
  className?: string;
}) {
  const hasPhoto = Boolean(person.meta?.photo_key);
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!hasPhoto) {
      setUrl(null);
      return;
    }
    let live = true;
    let made: string | null = null;
    entityPhotoBlobUrl(person.id)
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
  }, [person.id, hasPhoto]);

  if (hasPhoto && url) {
    // biome-ignore lint/nursery/noImgElement: object-url avatar, next/image can't help
    return <img src={url} alt={person.name} className={cn("object-cover", className)} />;
  }
  return (
    <span
      className={cn(
        "flex items-center justify-center bg-primary/10 font-bold text-primary",
        className,
      )}
    >
      {person.name.charAt(0).toUpperCase()}
    </span>
  );
}

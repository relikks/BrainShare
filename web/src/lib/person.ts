import type { EntityOut } from "./api";

// Mirrors the backend's default palette so front-derived and stored colours agree.
export const PERSON_PALETTE = [
  "#8b5cf6", "#6366f1", "#3b82f6", "#06b6d4", "#10b981", "#84cc16",
  "#f59e0b", "#f97316", "#ef4444", "#ec4899", "#a855f7", "#14b8a6",
];

function hashColor(id: string): string {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return PERSON_PALETTE[h % PERSON_PALETTE.length];
}

/** A person's colour: their stored meta.color, else a stable colour from their id
 *  (so people created before colours still render a consistent hue). */
export function personColor(p: EntityOut): string {
  const c = p.meta?.color;
  return typeof c === "string" ? c : hashColor(p.id);
}

/** Colour for a face box: the person's stored colour, else a stable hue from the
 *  person id, else neutral for an unnamed face. */
export function faceColor(personId: string | null, storedColor: string | null): string {
  if (storedColor) return storedColor;
  if (personId) return hashColor(personId);
  return "#94a3b8"; // slate — unnamed
}

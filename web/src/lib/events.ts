import type { EntityOut } from "./api";

/** Read a string field off an entity's meta (empty string if absent). */
export const emeta = (e: EntityOut, k: string): string =>
  typeof e.meta?.[k] === "string" ? (e.meta[k] as string) : "";

/** An event's colour comes from its event-type; falls back to the brand accent. */
export const eventColor = (type?: EntityOut): string =>
  type && typeof type.meta?.color === "string" ? (type.meta.color as string) : "var(--primary)";

/** Legacy events stored date-only ("YYYY-MM-DD") = all-day. New events carry an
 *  explicit `all_day` flag and may use datetimes ("YYYY-MM-DDTHH:mm"). */
export function isAllDay(e: EntityOut): boolean {
  if (typeof e.meta?.all_day === "boolean") return e.meta.all_day as boolean;
  return !emeta(e, "start").includes("T");
}

function parse(iso: string): Date | null {
  if (!iso) return null;
  const d = new Date(iso.includes("T") ? iso : `${iso}T00:00:00`);
  return Number.isNaN(d.getTime()) ? null : d;
}

const DAY = { month: "short", day: "numeric", year: "numeric" } as const;
const DAY_TIME = { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" } as const;
const TIME = { hour: "2-digit", minute: "2-digit" } as const;

/** Human "when" label for an event, honouring all-day vs timed + multi-day spans. */
export function fmtWhen(e: EntityOut): string {
  const s = parse(emeta(e, "start"));
  const en = parse(emeta(e, "end") || emeta(e, "start"));
  if (!s) return "No date";
  const allDay = isAllDay(e);
  const sameDay = en && s.toDateString() === en.toDateString();
  if (allDay) {
    if (!en || sameDay) return s.toLocaleDateString("en-US", DAY);
    return `${s.toLocaleDateString("en-US", { month: "short", day: "numeric" })} – ${en.toLocaleDateString("en-US", DAY)}`;
  }
  if (en && sameDay) {
    return `${s.toLocaleDateString("en-US", DAY)} · ${s.toLocaleTimeString("en-US", TIME)}–${en.toLocaleTimeString("en-US", TIME)}`;
  }
  if (en) return `${s.toLocaleDateString("en-US", DAY_TIME)} – ${en.toLocaleDateString("en-US", DAY_TIME)}`;
  return s.toLocaleDateString("en-US", DAY_TIME);
}

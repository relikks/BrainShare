"use client";

import { Grid2x2, LayoutGrid, List } from "lucide-react";
import { useEffect, useState } from "react";

export type DriveView = "large" | "grid" | "list";

export const VIEW_OPTIONS = [
  { value: "large" as const, icon: Grid2x2, label: "Large grid" },
  { value: "grid" as const, icon: LayoutGrid, label: "Grid" },
  { value: "list" as const, icon: List, label: "List" },
];

/** Remember a section's chosen layout across visits, keyed per section. */
export function useView(key: string, initial: DriveView = "grid") {
  const [view, setView] = useState<DriveView>(initial);
  useEffect(() => {
    const saved = localStorage.getItem(key) as DriveView | null;
    if (saved === "large" || saved === "grid" || saved === "list") setView(saved);
  }, [key]);
  const change = (v: DriveView) => {
    setView(v);
    localStorage.setItem(key, v);
  };
  return [view, change] as const;
}

"use client";

import { Badge, Dialog, DialogContent, DialogHeader, DialogTitle, Switch, toast } from "@drekis/shader";
import { useEffect, useState } from "react";

import { getModules, setModules } from "@/lib/api";
import type { ModuleInfo } from "@/lib/types";

/** Per-collection AI module config — which models index this collection's files.
 *  Mirrors CardForge's settings-page pattern (Card rows + Switch + toast on change). */
export function ModulesDialog({
  collectionId,
  canEdit,
  open,
  onClose,
}: {
  collectionId: string;
  canEdit: boolean;
  open: boolean;
  onClose: () => void;
}) {
  const [modules, setMods] = useState<ModuleInfo[] | null>(null);
  const [saving, setSaving] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setMods(null);
    getModules(collectionId)
      .then((r) => setMods(r.modules))
      .catch((e) => toast.error(String((e as Error).message)));
  }, [open, collectionId]);

  async function toggle(m: ModuleInfo) {
    if (!canEdit || saving) return;
    setSaving(m.name);
    try {
      const r = await setModules(collectionId, { [m.name]: !m.enabled });
      setMods(r.modules);
      toast.success(`${m.label} ${m.enabled ? "disabled" : "enabled"}`);
    } catch (e) {
      toast.error(String((e as Error).message));
    } finally {
      setSaving(null);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90vh] max-w-lg overflow-auto">
        <DialogHeader>
          <DialogTitle className="text-base">AI modules</DialogTitle>
          <p className="text-xs text-muted-foreground">
            Choose which models index this collection. Changes apply to files added afterwards.
          </p>
        </DialogHeader>

        <div className="flex flex-col gap-2">
          {modules === null
            ? Array.from({ length: 4 }, (_, i) => (
                <div
                  key={i}
                  className="h-[68px] animate-pulse rounded-xl border border-border bg-muted/40"
                />
              ))
            : modules.map((m) => (
                <div
                  key={m.name}
                  className="flex items-start gap-3 rounded-xl border border-border bg-card p-3"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="text-sm font-medium">{m.label}</span>
                      {m.modalities.map((mod) => (
                        <Badge key={mod} variant="secondary" className="capitalize">
                          {mod}
                        </Badge>
                      ))}
                    </div>
                    <p className="mt-0.5 text-xs text-muted-foreground">{m.desc}</p>
                  </div>
                  <Switch
                    checked={m.enabled}
                    disabled={!canEdit || saving === m.name}
                    onCheckedChange={() => toggle(m)}
                    aria-label={m.label}
                  />
                </div>
              ))}
        </div>

        {!canEdit && (
          <p className="text-xs text-muted-foreground">You need editor access to change modules.</p>
        )}
      </DialogContent>
    </Dialog>
  );
}

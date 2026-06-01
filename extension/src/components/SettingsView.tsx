import { useState } from "react";
import { Copy, LogOut, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ping } from "@/lib/api";
import { clearSettings, saveSettings } from "@/lib/settings";
import type { Settings } from "@/types";

export function SettingsView({
  settings,
  onChange,
  onSignOut,
}: {
  settings: Settings;
  onChange: (s: Settings) => void;
  onSignOut: () => void;
}) {
  const [endpoint, setEndpoint] = useState(settings.endpoint);
  const [topK, setTopK] = useState(settings.topK);
  const [msg, setMsg] = useState<string | null>(null);

  async function handleSave() {
    setMsg(null);
    const ok = await ping(endpoint);
    const next = await saveSettings({ endpoint, topK });
    onChange(next);
    setMsg(ok ? "Saved — backend is reachable." : "Saved, but backend not reachable.");
  }

  async function handleSignOut() {
    await clearSettings();
    onSignOut();
  }

  return (
    <div className="space-y-4">
      <div className="space-y-1">
        <Label>Signed in as</Label>
        <div className="rounded-md border bg-muted/30 p-2 text-sm">
          {settings.username}
        </div>
      </div>

      <div className="space-y-1">
        <Label>UUID (your only credential)</Label>
        <div className="flex gap-2">
          <div className="flex-1 rounded-md border bg-muted/30 p-2 font-mono text-xs break-all">
            {settings.uuid}
          </div>
          <Button
            variant="outline"
            size="icon"
            onClick={() => navigator.clipboard.writeText(settings.uuid)}
          >
            <Copy />
          </Button>
        </div>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="endpoint">Endpoint</Label>
        <Input
          id="endpoint"
          value={endpoint}
          onChange={(e) => setEndpoint(e.target.value)}
        />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="topk">Results per search</Label>
        <Input
          id="topk"
          type="number"
          min={1}
          max={50}
          value={topK}
          onChange={(e) => setTopK(parseInt(e.target.value || "10", 10))}
        />
      </div>

      <div className="flex gap-2">
        <Button className="flex-1" onClick={handleSave}>
          <Save /> Save
        </Button>
        <Button variant="outline" onClick={handleSignOut}>
          <LogOut /> Sign out
        </Button>
      </div>

      {msg && <p className="text-xs text-muted-foreground">{msg}</p>}
    </div>
  );
}

import { useState } from "react";
import { Copy, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { registerUser, ping } from "@/lib/api";
import { saveSettings } from "@/lib/settings";
import type { Settings } from "@/types";

type Mode = "register" | "import";

export function Setup({
  onReady,
  onEndpointChange,
}: {
  onReady: (s: Settings) => void;
  onEndpointChange?: (endpoint: string) => void;
}) {
  const [endpoint, setEndpoint] = useState("http://localhost:8000");
  const [mode, setMode] = useState<Mode>("register");
  const [username, setUsername] = useState("");
  const [importedUuid, setImportedUuid] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [issuedUuid, setIssuedUuid] = useState<string | null>(null);

  async function handleRegister() {
    setErr(null);
    setBusy(true);
    try {
      if (!(await ping(endpoint))) {
        throw new Error("Backend not reachable at " + endpoint);
      }
      const user = await registerUser(endpoint, username.trim());
      const next = await saveSettings({
        endpoint,
        username: user.username,
        uuid: user.uuid,
      });
      setIssuedUuid(user.uuid);
      // Don't auto-jump — let the user copy the UUID first.
      void next;
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function handleImport() {
    setErr(null);
    setBusy(true);
    try {
      // We do a search with empty query against the backend just to validate uuid.
      // Easier: rely on /search; if the uuid is invalid the backend 401s.
      const probe = await fetch(endpoint.replace(/\/+$/, "") + "/search", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${importedUuid.trim()}`,
        },
        body: JSON.stringify({ query: "ping", top_k: 1 }),
      });
      if (probe.status === 401) throw new Error("Invalid UUID");
      if (!probe.ok) throw new Error(`Backend error ${probe.status}`);
      const next = await saveSettings({
        endpoint,
        username: "(imported)",
        uuid: importedUuid.trim(),
      });
      onReady(next);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function continueAfterIssue() {
    const s = await saveSettings({});
    onReady(s);
  }

  if (issuedUuid) {
    return (
      <div className="space-y-4">
        <h2 className="text-lg font-semibold">Save your UUID</h2>
        <p className="text-sm text-muted-foreground">
          This is your only credential. Store it somewhere safe — you'll need it to
          access your corpus from another device.
        </p>
        <div className="rounded-md border bg-muted/30 p-3 font-mono text-xs break-all">
          {issuedUuid}
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            className="flex-1"
            onClick={() => navigator.clipboard.writeText(issuedUuid)}
          >
            <Copy className="mr-1" /> Copy UUID
          </Button>
          <Button className="flex-1" onClick={continueAfterIssue}>
            I saved it — continue
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="space-y-1">
        <h2 className="text-lg font-semibold">Connect to your corpus</h2>
        <p className="text-xs text-muted-foreground">
          Configure once. Your UUID is the only key — keep it safe.
        </p>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="endpoint">Backend endpoint</Label>
        <Input
          id="endpoint"
          value={endpoint}
          onChange={(e) => setEndpoint(e.target.value)}
          onBlur={(e) => onEndpointChange?.(e.target.value)}
          placeholder="http://localhost:8000"
        />
      </div>

      <div className="flex gap-1 rounded-md bg-muted p-1 text-xs">
        <button
          className={`flex-1 rounded px-2 py-1 transition ${
            mode === "register" ? "bg-background shadow-sm" : "text-muted-foreground"
          }`}
          onClick={() => setMode("register")}
        >
          New user
        </button>
        <button
          className={`flex-1 rounded px-2 py-1 transition ${
            mode === "import" ? "bg-background shadow-sm" : "text-muted-foreground"
          }`}
          onClick={() => setMode("import")}
        >
          Import UUID
        </button>
      </div>

      {mode === "register" ? (
        <div className="space-y-1.5">
          <Label htmlFor="username">Username</Label>
          <Input
            id="username"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            placeholder="alice"
            disabled={busy}
          />
          <Button
            className="w-full"
            disabled={busy || username.trim().length < 2}
            onClick={handleRegister}
          >
            {busy ? <Loader2 className="animate-spin" /> : "Generate UUID"}
          </Button>
        </div>
      ) : (
        <div className="space-y-1.5">
          <Label htmlFor="uuid">Your existing UUID</Label>
          <Input
            id="uuid"
            value={importedUuid}
            onChange={(e) => setImportedUuid(e.target.value)}
            placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
            disabled={busy}
          />
          <Button
            className="w-full"
            disabled={busy || importedUuid.trim().length < 8}
            onClick={handleImport}
          >
            {busy ? <Loader2 className="animate-spin" /> : "Connect"}
          </Button>
        </div>
      )}

      {err && (
        <p className="text-sm text-destructive border border-destructive/30 rounded-md p-2 bg-destructive/5">
          {err}
        </p>
      )}
    </div>
  );
}

"use client";

import { Button, Card, CardContent, CardHeader, CardTitle, Input, Label, toast } from "@drekis/shader";
import { Copy, LogOut } from "lucide-react";
import { useEffect, useState } from "react";
import { registerUser } from "@/lib/api";
import {
  DEFAULT_ENDPOINT,
  clearIdentity,
  getEndpoint,
  getUsername,
  getUuid,
  setEndpoint,
  setIdentity,
} from "@/lib/config";

export default function SettingsPage() {
  const [endpoint, setEp] = useState(DEFAULT_ENDPOINT);
  const [username, setUsername] = useState("");
  const [uuid, setUuid] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setEp(getEndpoint());
    setUuid(getUuid());
    setUsername(getUsername() ?? "");
  }, []);

  async function register() {
    if (!username.trim()) return;
    setBusy(true);
    try {
      setEndpoint(endpoint);
      const u = await registerUser(endpoint, username.trim());
      setIdentity(endpoint, u.uuid, u.username);
      setUuid(u.uuid);
      toast.success(`Identity created for ${u.username}`);
    } catch (e) {
      toast.error(String((e as Error).message));
    } finally {
      setBusy(false);
    }
  }

  function restore() {
    if (!uuid || !username.trim()) return;
    setIdentity(endpoint, uuid, username.trim());
    toast.success("Identity saved");
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6 p-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>
        <p className="text-sm text-muted-foreground">
          Your UUID is the only credential — keep it safe, there is no recovery.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Backend</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <Label htmlFor="ep">Endpoint</Label>
          <Input id="ep" value={endpoint} onChange={(e) => setEp(e.target.value)} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Identity</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="space-y-2">
            <Label htmlFor="user">Username</Label>
            <Input
              id="user"
              value={username}
              placeholder="your-handle"
              onChange={(e) => setUsername(e.target.value)}
            />
          </div>

          {uuid ? (
            <div className="space-y-2">
              <Label>Your UUID</Label>
              <div className="flex items-center gap-2">
                <code className="flex-1 truncate rounded-md border border-border bg-muted px-3 py-2 text-xs">
                  {uuid}
                </code>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    navigator.clipboard.writeText(uuid);
                    toast.success("Copied");
                  }}
                >
                  <Copy className="size-4" />
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    clearIdentity();
                    setUuid(null);
                    toast.message("Identity forgotten");
                  }}
                >
                  <LogOut className="size-4" />
                </Button>
              </div>
              <Button variant="outline" onClick={restore}>
                Save endpoint + username
              </Button>
            </div>
          ) : (
            <Button onClick={register} disabled={busy || !username.trim()}>
              {busy ? "Creating…" : "Create identity"}
            </Button>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

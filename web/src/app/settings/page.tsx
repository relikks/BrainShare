"use client";

import { Button, Card, CardContent, CardHeader, CardTitle, Input, Label, toast } from "@drekis/shader";
import { Copy, KeyRound, LogIn, LogOut, Plus, Trash2 } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { createApiKey, listApiKeys, registerUser, revokeApiKey } from "@/lib/api";
import {
  DEFAULT_ENDPOINT,
  clearIdentity,
  getEndpoint,
  getUsername,
  getUuid,
  setEndpoint,
  setIdentity,
} from "@/lib/config";
import {
  signInWithGoogle,
  signOutSupabase,
  supabaseEnabled,
  useSupabaseSession,
} from "@/lib/supabase";
import type { ApiKeyOut } from "@/lib/types";

function copy(text: string) {
  navigator.clipboard.writeText(text);
  toast.success("Copied");
}

/** Sign in with Google (Supabase Auth) — the real account identity. */
function AccountCard() {
  const session = useSupabaseSession();
  if (!supabaseEnabled) return null;
  const email = session?.user?.email;
  return (
    <Card>
      <CardHeader>
        <CardTitle>Account</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {email ? (
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <div className="text-sm font-medium">Signed in</div>
              <div className="truncate text-sm text-muted-foreground">{email}</div>
            </div>
            <Button variant="outline" size="sm" onClick={() => signOutSupabase()}>
              <LogOut className="size-4" /> Sign out
            </Button>
          </div>
        ) : (
          <>
            <p className="text-sm text-muted-foreground">
              Sign in to use your real account across devices.
            </p>
            <Button onClick={() => signInWithGoogle()}>
              <LogIn className="size-4" /> Sign in with Google
            </Button>
          </>
        )}
      </CardContent>
    </Card>
  );
}

/** Create/list/revoke API keys — a key acts AS you (the secretary uses one). */
function ApiKeysCard() {
  const [keys, setKeys] = useState<ApiKeyOut[]>([]);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [fresh, setFresh] = useState<string | null>(null); // the just-created raw key

  const refresh = useCallback(() => {
    listApiKeys()
      .then(setKeys)
      .catch(() => setKeys([]));
  }, []);
  useEffect(refresh, [refresh]);

  async function create() {
    setBusy(true);
    try {
      const k = await createApiKey(name.trim() || "api key");
      setFresh(k.key);
      setName("");
      refresh();
    } catch (e) {
      toast.error(String((e as Error).message));
    } finally {
      setBusy(false);
    }
  }

  async function revoke(id: string) {
    try {
      await revokeApiKey(id);
      refresh();
    } catch (e) {
      toast.error(String((e as Error).message));
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <KeyRound className="size-4" /> API keys
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-muted-foreground">
          A key acts as your account for uploads and search — give one to the secretary.
        </p>

        {/* The raw key is shown ONCE, right after creation. */}
        {fresh && (
          <div className="space-y-2 rounded-lg border border-primary/40 bg-primary/5 p-3">
            <div className="text-xs font-medium text-primary">
              Copy this key now — it won’t be shown again
            </div>
            <div className="flex items-center gap-2">
              <code className="flex-1 truncate rounded-md border border-border bg-background px-3 py-2 text-xs">
                {fresh}
              </code>
              <Button variant="outline" size="sm" onClick={() => copy(fresh)}>
                <Copy className="size-4" />
              </Button>
            </div>
          </div>
        )}

        <div className="flex items-end gap-2">
          <div className="flex-1 space-y-1">
            <Label htmlFor="kn">New key name</Label>
            <Input
              id="kn"
              value={name}
              placeholder="secretary (apple watch)"
              onChange={(e) => setName(e.target.value)}
            />
          </div>
          <Button onClick={create} disabled={busy}>
            <Plus className="size-4" /> Create
          </Button>
        </div>

        {keys.length > 0 && (
          <ul className="divide-y divide-border rounded-lg border border-border">
            {keys.map((k) => (
              <li key={k.id} className="flex items-center justify-between gap-3 px-3 py-2">
                <div className="min-w-0">
                  <div className="truncate text-sm font-medium">
                    {k.name || "api key"}
                    {k.revoked && <span className="ml-2 text-xs text-destructive">revoked</span>}
                  </div>
                  <div className="truncate text-xs text-muted-foreground">
                    {k.prefix}…{" · "}
                    {k.last_used_at ? `last used ${new Date(k.last_used_at).toLocaleDateString()}` : "never used"}
                  </div>
                </div>
                {!k.revoked && (
                  <Button variant="ghost" size="sm" onClick={() => revoke(k.id)} title="Revoke">
                    <Trash2 className="size-4" />
                  </Button>
                )}
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

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
          Sign in with Google for your real account, or use the legacy UUID identity.
        </p>
      </div>

      <AccountCard />
      <ApiKeysCard />

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
          <CardTitle>Legacy identity (UUID)</CardTitle>
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
                <Button variant="outline" size="sm" onClick={() => copy(uuid)}>
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

"use client";

// Supabase-Auth client for the web login. The access token it mints is sent as the
// API Bearer (see lib/config getBearer). If the NEXT_PUBLIC_ vars aren't set the
// client is disabled and the app falls back to the legacy UUID identity.

import { createClient, type Session } from "@supabase/supabase-js";
import { useEffect, useState } from "react";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

export const supabaseEnabled = Boolean(url && anon);

export const supabase = supabaseEnabled
  ? createClient(url as string, anon as string, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
    })
  : null;

// Cached current access token, kept fresh by the auth listener so the synchronous
// api `auth()` header can read it without awaiting a session lookup each call.
let _token: string | null = null;
export function getAccessToken(): string | null {
  return _token;
}

if (supabase && typeof window !== "undefined") {
  supabase.auth.getSession().then(({ data }) => {
    _token = data.session?.access_token ?? null;
  });
  supabase.auth.onAuthStateChange((_event, session) => {
    _token = session?.access_token ?? null;
  });
}

export async function signInWithGoogle(): Promise<void> {
  if (!supabase) return;
  await supabase.auth.signInWithOAuth({
    provider: "google",
    options: { redirectTo: `${window.location.origin}/settings` },
  });
}

export async function signOutSupabase(): Promise<void> {
  if (!supabase) return;
  await supabase.auth.signOut();
  _token = null;
}

/** React to the login state (email shown / buttons) in components. */
export function useSupabaseSession(): Session | null {
  const [session, setSession] = useState<Session | null>(null);
  useEffect(() => {
    if (!supabase) return;
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => setSession(s));
    return () => sub.subscription.unsubscribe();
  }, []);
  return session;
}

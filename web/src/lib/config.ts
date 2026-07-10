"use client";

import { getAccessToken } from "./supabase";

// Identity = the backend endpoint + the per-user UUID (the only credential),
// stored locally exactly like the extension. No secrets server-side.

const ENDPOINT_KEY = "brainshare.endpoint";
const UUID_KEY = "brainshare.uuid";
const USER_KEY = "brainshare.username";

// Same-origin proxy route (web/src/app/api/be) → backend over localhost.
// Works both deployed and in local dev (where Next also proxies).
export const DEFAULT_ENDPOINT = "/api/be";

// Temporary: sessions without a stored identity default to the seeded
// "relik" account so the deployed demo works without Settings setup.
const DEFAULT_UUID = "e2c578bf-1061-4488-9879-ca1b76b0b796";
const DEFAULT_USERNAME = "relik";

export function getEndpoint(): string {
  if (typeof window === "undefined") return DEFAULT_ENDPOINT;
  return localStorage.getItem(ENDPOINT_KEY) || DEFAULT_ENDPOINT;
}
export function getUuid(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(UUID_KEY) || DEFAULT_UUID;
}

// The Bearer the API sends: a live Supabase-Auth token when signed in, otherwise
// the legacy UUID (keeps the app working through the OAuth transition).
export function getBearer(): string | null {
  if (typeof window === "undefined") return null;
  return getAccessToken() || getUuid();
}
export function getUsername(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(USER_KEY) || DEFAULT_USERNAME;
}
export function setIdentity(endpoint: string, uuid: string, username: string) {
  localStorage.setItem(ENDPOINT_KEY, endpoint.replace(/\/+$/, ""));
  localStorage.setItem(UUID_KEY, uuid);
  localStorage.setItem(USER_KEY, username);
}
export function setEndpoint(endpoint: string) {
  localStorage.setItem(ENDPOINT_KEY, endpoint.replace(/\/+$/, ""));
}
export function clearIdentity() {
  localStorage.removeItem(UUID_KEY);
  localStorage.removeItem(USER_KEY);
}

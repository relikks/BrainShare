import type { Settings } from "@/types";

const DEFAULTS: Settings = {
  endpoint: "http://localhost:8000",
  username: "",
  uuid: "",
  topK: 10,
};

const KEY = "settings";

export async function loadSettings(): Promise<Settings> {
  const raw = await chrome.storage.local.get(KEY);
  return { ...DEFAULTS, ...(raw[KEY] ?? {}) };
}

export async function saveSettings(patch: Partial<Settings>): Promise<Settings> {
  const current = await loadSettings();
  const next = { ...current, ...patch };
  await chrome.storage.local.set({ [KEY]: next });
  return next;
}

export async function clearSettings(): Promise<void> {
  await chrome.storage.local.remove(KEY);
}

export function isConfigured(s: Settings): boolean {
  return Boolean(s.endpoint && s.uuid && s.username);
}

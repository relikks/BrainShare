"use client";

import { getEndpoint, getUuid } from "./config";
import type {
  Browse,
  Collection,
  Directory,
  FileItem,
  MemberOut,
  MetaFilter,
  Modality,
  ModuleInfo,
  Role,
  SearchResults,
  UserOut,
} from "./types";

async function asError(res: Response): Promise<Error> {
  let detail = res.statusText;
  try {
    const body = await res.json();
    const d = body?.detail;
    detail = typeof d === "string" ? d : JSON.stringify(d ?? body);
  } catch {
    /* keep statusText */
  }
  return new Error(`${res.status}: ${detail}`);
}

function auth(): HeadersInit {
  const uuid = getUuid();
  return uuid ? { Authorization: `Bearer ${uuid}` } : {};
}

async function req<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(getEndpoint() + path, {
    ...init,
    headers: { ...auth(), ...(init.headers ?? {}) },
  });
  if (!res.ok) throw await asError(res);
  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

// ── identity ──
export function registerUser(endpoint: string, username: string): Promise<UserOut> {
  return fetch(endpoint.replace(/\/+$/, "") + "/users/register", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username }),
  }).then(async (r) => {
    if (!r.ok) throw await asError(r);
    return r.json();
  });
}
export const me = () => req<UserOut>("/users/me");

// ── collections ──
export const listCollections = () => req<Collection[]>("/collections");
export const createCollection = (name: string) =>
  req<Collection>("/collections", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name }),
  });
export const getCollection = (id: string) => req<Collection>(`/collections/${id}`);
export const browse = (collectionId: string, directoryId?: string | null) =>
  req<Browse>(
    `/collections/${collectionId}/browse` +
      (directoryId ? `?directory_id=${encodeURIComponent(directoryId)}` : ""),
  );
export const listMembers = (id: string) => req<MemberOut[]>(`/collections/${id}/members`);
export const addMember = (id: string, username: string, role: Role) =>
  req<MemberOut>(`/collections/${id}/members`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, role }),
  });

// ── directories ──
export const createDirectory = (
  collectionId: string,
  parentId: string | null,
  name: string,
) =>
  req<Directory>("/directories", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ collection_id: collectionId, parent_id: parentId, name }),
  });

// ── files ──
export function uploadFile(
  collectionId: string,
  directoryId: string | null,
  file: File,
): Promise<FileItem> {
  const fd = new FormData();
  fd.append("collection_id", collectionId);
  if (directoryId) fd.append("directory_id", directoryId);
  fd.append("file", file);
  return req<FileItem>("/files", { method: "POST", body: fd });
}
export const getFile = (id: string) => req<FileItem>(`/files/${id}`);
export const deleteFile = (id: string) =>
  req<void>(`/files/${id}`, { method: "DELETE" });

export async function fileBlobUrl(id: string): Promise<string> {
  const res = await fetch(getEndpoint() + `/files/${id}/content`, { headers: auth() });
  if (!res.ok) throw await asError(res);
  return URL.createObjectURL(await res.blob());
}

// ── search ──
export interface SearchOpts {
  modalities?: Modality[];
  collection_ids?: string[] | null;
  directory_id?: string | null;
  include_subdirs?: boolean;
  filters?: MetaFilter[]; // §1 type-aware metadata filters
  top_k?: number;
  min_score?: number;
}
export const search = (query: string, opts: SearchOpts = {}) =>
  req<SearchResults>("/search", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ query, ...opts }),
  });

// ── per-collection AI modules ──
export const getModules = (collectionId: string) =>
  req<{ modules: ModuleInfo[] }>(`/collections/${collectionId}/modules`);
export const setModules = (collectionId: string, modules: Record<string, boolean>) =>
  req<{ modules: ModuleInfo[] }>(`/collections/${collectionId}/modules`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ modules }),
  });

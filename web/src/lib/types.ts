export type Modality = "text" | "image" | "audio" | "video";
export type Role = "owner" | "editor" | "viewer";
export type FileStatus = "pending" | "ready" | "failed";

export interface UserOut {
  username: string;
  uuid: string;
}
export interface Collection {
  id: string;
  name: string;
  slug: string;
  role: Role;
  created_at: string;
}
export interface Directory {
  id: string;
  collection_id: string;
  parent_id: string | null;
  name: string;
  path: string;
  created_at: string;
}
export interface FileItem {
  id: string;
  collection_id: string;
  directory_id: string | null;
  name: string;
  modality: Modality;
  mime: string;
  size: number;
  status: FileStatus;
  error: string | null;
  meta?: Record<string, number | string>; // §1 per-type metadata (dims, duration, word_count…)
  created_at: string;
}

// §1 — a structured filter on file metadata, mirrors the backend MetaFilter.
export type FilterOp = "eq" | "in" | "gte" | "lte" | "gt" | "lt";
export interface MetaFilter {
  field: string;
  op: FilterOp;
  value: number | string | (number | string)[];
}

export interface Crumb {
  id: string | null;
  name: string;
}
export interface Browse {
  collection: Collection;
  directory_id: string | null;
  breadcrumb: Crumb[];
  directories: Directory[];
  files: FileItem[];
}
export interface MemberOut {
  username: string;
  role: Role;
}
export interface Segment {
  space: string;
  pipeline?: string | null; // which search pipeline produced this segment's score
  score: number;
  text: string | null;
  segment: string | null;
  goto_url: string | null;
}
export interface SearchHit {
  file_id: string;
  file_name: string;
  modality: Modality;
  collection_id: string;
  directory_id: string | null;
  dir_path: string;
  breadcrumb: Crumb[];
  score: number;
  best: Segment;
  matched_spaces: string[];
  matched_pipelines?: string[];
}
export interface SearchResults {
  hits: SearchHit[];
}

export const MODALITIES: Modality[] = ["text", "image", "audio", "video"];

// Per-collection AI module (mirrors the backend ModuleInfo).
export interface ModuleInfo {
  name: string;
  label: string;
  desc: string;
  modalities: string[];
  enabled: boolean;
}

// A named search pipeline (mirrors the backend PipelineInfo) — one way of
// searching one file type (image by objects, audio by transcript, …).
export interface PipelineInfo {
  key: string;
  label: string;
  desc: string;
  modality: Modality;
  module: string | null;
}

export interface ChunkAnchor {
  text_prefix: string;
  text_suffix: string | null;
  heading_path: string[];
}

export interface ChunkIn {
  text: string;
  position: number;
  anchor: ChunkAnchor;
}

export interface PageIngest {
  url: string;
  page_title: string;
  chunks: ChunkIn[];
}

export interface IngestResult {
  url: string;
  ingested: number;
  replaced: number;
}

export interface MatchedChunk {
  position: number;
  score: number;
  heading_path: string[];
  text: string;
  goto_url: string;
}

export interface PageResult {
  url: string;
  page_title: string;
  best_score: number;
  matched: MatchedChunk[];
}

export interface PageChunk {
  position: number;
  text: string;
  heading_path: string[];
}

export interface PageContent {
  url: string;
  page_title: string;
  chunks: PageChunk[];
}

export interface UserOut {
  username: string;
  uuid: string;
}

export interface Settings {
  endpoint: string;
  username: string;
  uuid: string;
  topK: number;
}

export interface Branding {
  name: string;
  logo_url: string;
}

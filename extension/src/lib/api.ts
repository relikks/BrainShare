import type {
  Branding,
  IngestResult,
  PageContent,
  PageIngest,
  PageResult,
  UserOut,
} from "@/types";

function joinUrl(base: string, path: string): string {
  return base.replace(/\/+$/, "") + path;
}

async function asError(res: Response): Promise<Error> {
  let detail: string;
  try {
    const body = await res.json();
    console.error("Backend error body:", body);
    const d = body?.detail;
    if (typeof d === "string") {
      detail = d;
    } else if (Array.isArray(d)) {
      detail = d
        .map((e) => {
          const loc = Array.isArray(e?.loc) ? e.loc.join(".") : "";
          return `${loc}: ${e?.msg ?? JSON.stringify(e)}`;
        })
        .join(" | ");
    } else if (d != null) {
      detail = JSON.stringify(d);
    } else {
      detail = JSON.stringify(body);
    }
  } catch {
    detail = await res.text();
  }
  return new Error(`${res.status} ${res.statusText}: ${detail}`);
}

export async function registerUser(
  endpoint: string,
  username: string,
): Promise<UserOut> {
  const res = await fetch(joinUrl(endpoint, "/users/register"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username }),
  });
  if (!res.ok) throw await asError(res);
  return res.json();
}

export async function ingestPage(
  endpoint: string,
  uuid: string,
  payload: PageIngest,
): Promise<IngestResult> {
  const res = await fetch(joinUrl(endpoint, "/ingest"), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${uuid}`,
    },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw await asError(res);
  return res.json();
}

export async function searchCorpus(
  endpoint: string,
  uuid: string,
  query: string,
  topK: number,
): Promise<PageResult[]> {
  const res = await fetch(joinUrl(endpoint, "/search"), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${uuid}`,
    },
    body: JSON.stringify({ query, top_k: topK }),
  });
  if (!res.ok) throw await asError(res);
  return res.json();
}

export async function getPageContent(
  endpoint: string,
  uuid: string,
  url: string,
): Promise<PageContent> {
  const u =
    joinUrl(endpoint, "/page") + `?url=${encodeURIComponent(url)}`;
  const res = await fetch(u, {
    headers: { Authorization: `Bearer ${uuid}` },
  });
  if (!res.ok) throw await asError(res);
  return res.json();
}

export async function fetchBranding(endpoint: string): Promise<Branding> {
  const res = await fetch(joinUrl(endpoint, "/branding"));
  if (!res.ok) throw await asError(res);
  return res.json();
}

export async function ping(endpoint: string): Promise<boolean> {
  try {
    const res = await fetch(joinUrl(endpoint, "/health"));
    return res.ok;
  } catch {
    return false;
  }
}

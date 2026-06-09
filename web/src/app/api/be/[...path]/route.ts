import type { NextRequest } from "next/server";

// Same-origin proxy to the BrainShare backend (kept off the public internet —
// the browser hits this route, Next forwards it over localhost). Mirrors the
// cardforge pattern so the whole app lives behind one auth-gated origin.
const BACKEND = process.env.BACKEND_ORIGIN ?? "http://localhost:8000";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

async function handler(
  req: NextRequest,
  ctx: { params: Promise<{ path: string[] }> },
): Promise<Response> {
  const { path } = await ctx.params;
  const url = `${BACKEND}/${path.join("/")}${req.nextUrl.search}`;

  const headers = new Headers();
  const auth = req.headers.get("authorization");
  const ct = req.headers.get("content-type");
  if (auth) headers.set("authorization", auth);
  if (ct) headers.set("content-type", ct);

  const init: RequestInit & { duplex?: "half" } = { method: req.method, headers };
  if (req.method !== "GET" && req.method !== "HEAD") {
    init.body = req.body;
    init.duplex = "half";
  }

  let upstream: Response;
  try {
    upstream = await fetch(url, init);
  } catch {
    return Response.json({ detail: "Backend unreachable" }, { status: 502 });
  }

  const out = new Headers();
  for (const h of ["content-type", "content-disposition", "cache-control"]) {
    const v = upstream.headers.get(h);
    if (v) out.set(h, v);
  }
  return new Response(upstream.body, { status: upstream.status, headers: out });
}

export const GET = handler;
export const POST = handler;
export const PUT = handler;
export const PATCH = handler;
export const DELETE = handler;

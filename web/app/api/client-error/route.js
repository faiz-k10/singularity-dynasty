import { headers } from "next/headers";
import { logError } from "@/lib/errorLog";
import { allowHit, clientIp } from "@/lib/rateLimit";

// A crash in a visitor's browser (app/error.js reports here). Same-site only, 10 a minute per address; always 204.
const hits = new Map();
export async function POST(request) {
  const origin = request.headers.get("origin");
  if (origin && origin !== request.nextUrl.origin) return new Response(null, { status: 204 });
  if (!allowHit(hits, clientIp(await headers()), Date.now(), 10, 60_000)) return new Response(null, { status: 204 });
  let body = {};
  try {
    body = JSON.parse((await request.text()).slice(0, 4000));
  } catch {
    return new Response(null, { status: 204 });
  }
  await logError({ source: "client", route: "browser", path: body.path, message: body.message, digest: body.digest });
  return new Response(null, { status: 204 });
}

import { NextResponse } from "next/server";

// Relays a player photo so a dashboard can be pictured for sharing (app/snapshot.js): the photos live on Sleeper's image server, which
// doesn't send the header a page needs to copy an image into a picture. Only that host, only images, at most 2 MB, cached a day -- so this
// can't be used to fetch anything else through our site.
const ALLOWED = new Set(["sleepercdn.com"]);
const MAX = 2 * 1024 * 1024;

export async function GET(request) {
  let url;
  try {
    url = new URL(request.nextUrl.searchParams.get("u") || "");
  } catch {
    return new NextResponse(null, { status: 400 });
  }
  if (url.protocol !== "https:" || !ALLOWED.has(url.hostname) || url.username || url.password) return new NextResponse(null, { status: 400 });
  const res = await fetch(url, { redirect: "error", next: { revalidate: 86400 } }).catch(() => null);
  const type = res?.headers.get("content-type") || "";
  if (!res?.ok || !/^image\/(jpeg|png|webp|gif)$/.test(type.split(";")[0])) return new NextResponse(null, { status: 404 });
  const bytes = await res.arrayBuffer();
  if (bytes.byteLength > MAX) return new NextResponse(null, { status: 413 });
  return new NextResponse(bytes, { headers: { "Content-Type": type, "Cache-Control": "public, max-age=86400", "X-Content-Type-Options": "nosniff" } });
}

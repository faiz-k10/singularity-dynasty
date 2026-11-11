// A small per-server-instance rate limit for open endpoints (the Lab's share upload, the public Sleeper lookup). It stops a loop or a casual abuser,
// not a determined one spread over many addresses or instances -- a table-backed limit would be the next step. Pure; tested in test/rateLimit.test.mjs.

// Allows `limit` hits per key in any `windowMs`; `hits` is a Map the caller keeps for the life of the instance. Returns false when over the limit.
// Keys whose hits have all aged out are dropped once the map grows past MAX_KEYS, so a stream of new addresses can't grow it without end.
const MAX_KEYS = 5000;
export function allowHit(hits, key, now, limit, windowMs) {
  if (hits.size > MAX_KEYS) {
    for (const [k, times] of hits) if (!times.length || now - times[times.length - 1] >= windowMs) hits.delete(k);
  }
  const recent = (hits.get(key) || []).filter((t) => now - t < windowMs);
  if (recent.length >= limit) {
    hits.set(key, recent);
    return false;
  }
  recent.push(now);
  hits.set(key, recent);
  return true;
}

// The caller's address. Vercel's own headers first (x-vercel-forwarded-for / x-real-ip are set by Vercel's edge, not the visitor), then the
// first x-forwarded-for entry (also rewritten by Vercel). "local" when there is none (dev).
export function clientIp(headerList) {
  const first = (v) => (v || "").split(",")[0].trim();
  return first(headerList.get("x-vercel-forwarded-for")) || first(headerList.get("x-real-ip")) || first(headerList.get("x-forwarded-for")) || "local";
}

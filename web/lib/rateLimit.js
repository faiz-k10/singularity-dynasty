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

// The caller's address from the proxy headers (Vercel sets x-forwarded-for; the first entry is the client). "local" when there is none (dev).
export function clientIp(headerList) {
  return (headerList.get("x-forwarded-for") || "").split(",")[0].trim() || headerList.get("x-real-ip") || "local";
}

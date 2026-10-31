// Paywall telemetry: cleans one event sent by the browser tracker (app/WallTracker.js) before the server stores it (app/api/wall/route.js ->
// table wall_hits, migration 0040). Pure, so it is tested (test/wallEvents.test.mjs). Anything unexpected returns null and is dropped.

export const WALL_TYPES = ["view", "click"];
// A wall is the name a teaser block carries in its data-wall attribute ("weekly-rankings", "lab-compare", ...), or "nav" / "other" for a pricing link
// outside any wall. Lowercase letters, digits and dashes only, so nothing a visitor sends can smuggle in markup or a long string.
const WALL_RE = /^[a-z0-9-]{1,40}$/;

export function cleanWallEvent(body) {
  if (!body || typeof body !== "object") return null;
  const { type, wall, page } = body;
  if (!WALL_TYPES.includes(type)) return null;
  if (typeof wall !== "string" || !WALL_RE.test(wall)) return null;
  if (typeof page !== "string" || !page.startsWith("/")) return null;
  // the path only: no query string or hash (they can carry names, share ids or tokens), and a sane length
  const path = page.split(/[?#]/)[0].slice(0, 80);
  return { type, wall, page: path };
}

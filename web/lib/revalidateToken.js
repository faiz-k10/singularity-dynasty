import { createHmac, timingSafeEqual } from "node:crypto";

// The token that lets the weekly publish job (scripts/weekly-run.mjs) tell the live site "new data is in, refresh now" (app/api/revalidate).
// It is derived from the Supabase service-role key, which both the site (Vercel) and the publish job (GitHub Actions / this Mac) already hold,
// so no new secret has to be set anywhere. Never sent to a browser.
export function revalidateToken(key = process.env.SUPABASE_SERVICE_ROLE_KEY) {
  if (!key) return null;
  return createHmac("sha256", key).update("revalidate:model-data:v1").digest("hex");
}

export function tokenMatches(given) {
  const want = revalidateToken();
  if (!want || typeof given !== "string" || given.length !== want.length) return false;
  return timingSafeEqual(Buffer.from(given), Buffer.from(want));
}

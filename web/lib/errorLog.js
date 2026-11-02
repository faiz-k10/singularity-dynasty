import { createAdminClient } from "@/lib/supabase/admin";
import { allowHit } from "@/lib/rateLimit";

// Records one error in `app_errors` (migration 0042) for /admin and the hourly health alert. Never throws -- logging must not
// turn into a second failure -- and is capped per server instance so a crash loop can't flood the table.
const hits = new Map();
const LIMIT = 60; // per minute per instance

const clip = (v, n) => (v == null ? null : String(v).slice(0, n));
// Path only: query strings can carry ids, codes or emails.
const pathOnly = (p) => clip(String(p || "").split("?")[0], 300);

export async function logError({ source, route, path, message, digest }) {
  try {
    if (!allowHit(hits, "all", Date.now(), LIMIT, 60_000)) return;
    const { error } = await createAdminClient()
      .from("app_errors")
      .insert({ source: source === "client" ? "client" : "server", route: clip(route, 200), path: pathOnly(path), message: clip(message, 500), digest: clip(digest, 100) });
    if (error) console.error("[errorLog] insert failed:", error.message);
  } catch (e) {
    console.error("[errorLog]", e?.message || e);
  }
}

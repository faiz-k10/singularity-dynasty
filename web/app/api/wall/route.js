import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { resolveTier } from "@/lib/tier";
import { cleanWallEvent } from "@/lib/wallEvents";
import { allowHit, clientIp } from "@/lib/rateLimit";

// Paywall telemetry (see supabase/migrations/0040_wall_hits.sql and app/WallTracker.js): the browser reports "saw this wall" / "clicked toward pricing".
// Open to any visitor, so it takes only a small cleaned event, limits one address to 120 a minute (per server instance), and ALWAYS answers 204 -- a
// beacon has nobody to tell, and a missing table (before the migration is run) or a database error must never show up as a broken page.
const hits = new Map();

export async function POST(request) {
  if (!allowHit(hits, clientIp(request.headers), Date.now(), 120, 60 * 1000)) return new Response(null, { status: 204 });
  try {
    const event = cleanWallEvent(await request.json());
    if (!event) return new Response(null, { status: 204 });
    const { user, tier } = await resolveTier(await createClient());
    await createAdminClient().from("wall_hits").insert({ ...event, tier, user_id: user?.id ?? null });
  } catch {
    // dropped on purpose
  }
  return new Response(null, { status: 204 });
}

import { NextResponse } from "next/server";
import { loadHealth } from "@/lib/health";

// For the hourly uptime check (.github/workflows/uptime.yml): 200 when healthy, 503 when data is stale or errors spike. Shows
// only pass / fail and ages -- nothing private.
// The checks run a handful of database reads, and the URL is public: one answer is shared for 60 seconds (and callers that arrive while it is
// being worked out wait for that one), so hammering it can't load the database (Nov 10 2026 load test: 200 at once took up to 189s and
// pushed the database into timeouts).
let last = null;
let lastAt = 0;
let inflight = null;
async function health() {
  if (last && Date.now() - lastAt < 60e3) return last;
  inflight ||= loadHealth()
    .then((h) => {
      last = h;
      lastAt = Date.now();
      return h;
    })
    .finally(() => {
      inflight = null;
    });
  return inflight;
}

export async function GET() {
  const h = await health();
  return NextResponse.json(
    { ok: h.ok, inSeason: h.inSeason, checks: h.checks },
    { status: h.ok ? 200 : 503, headers: { "Cache-Control": "no-store" } }
  );
}

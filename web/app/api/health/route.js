import { NextResponse } from "next/server";
import { loadHealth } from "@/lib/health";

// For the hourly uptime check (.github/workflows/uptime.yml): 200 when healthy, 503 when data is stale or errors spike. Shows
// only pass / fail and ages -- nothing private.
export async function GET() {
  const h = await loadHealth();
  return NextResponse.json(
    { ok: h.ok, inSeason: h.inSeason, checks: h.checks },
    { status: h.ok ? 200 : 503, headers: { "Cache-Control": "no-store" } }
  );
}

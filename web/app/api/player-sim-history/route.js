import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { resolveTier } from "@/lib/tier";
import { getPlayerBiosByNamePos } from "@/lib/sleeper";
import { findBio } from "@/lib/portfolio";
import { loadSimHistoryContext, buildSnapshots, buildPeersByWeek } from "@/lib/simHistory";

// Same gate as the Player Season Simulations page: Singularity sees every
// player, everyone else only the top-10 teaser by median.
const TEASER_LIMIT = 10;

export async function GET(request) {
  const supabase = await createClient();
  const { tier } = await resolveTier(supabase);
  const full = tier === "singularity";
  const ctx = await loadSimHistoryContext();
  if (!ctx) return NextResponse.json({ snapshots: [], peersByWeek: {} });

  const visible = new Set((full ? ctx.latestRows : ctx.latestRows.slice(0, TEASER_LIMIT)).map((r) => r.player_name));
  const params = request.nextUrl.searchParams;
  const headers = { "Cache-Control": "private, max-age=60" };

  const player = params.get("player");
  if (player) {
    if (!visible.has(player)) return NextResponse.json({ snapshots: [] }, { status: 403 });
    const bio = findBio(await getPlayerBiosByNamePos(), player, ctx.rowByName[player]?.position);
    return NextResponse.json({ snapshots: buildSnapshots(ctx, player, bio?.yearsExp === 0) }, { headers });
  }
  if (params.get("peers")) {
    const bios = await getPlayerBiosByNamePos();
    return NextResponse.json({ peersByWeek: buildPeersByWeek(ctx, visible, bios) }, { headers });
  }
  return NextResponse.json({ error: "bad request" }, { status: 400 });
}

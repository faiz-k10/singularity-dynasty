import { NextResponse } from "next/server";
import { getUserTier } from "@/lib/tier";
import { getDynastyProfile } from "@/lib/dynastyData";
import { getPlayerBiosByNamePos } from "@/lib/sleeper";
import { findBio } from "@/lib/portfolio";

// What the Dynasty Draft Board's player profile loads when it opens: his last games and his bio (headshot, size, years in
// the league). Same gate as the board itself: a player this tier can't see on the board gets a 403.
const PAID_TIERS = ["explorer", "singularity"];

export async function GET(request) {
  const id = request.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "bad request" }, { status: 400 });
  const { tier } = await getUserTier();
  const found = getDynastyProfile(id, PAID_TIERS.includes(tier));
  if (!found) return NextResponse.json({ error: "not available" }, { status: 403 });
  const bios = await getPlayerBiosByNamePos();
  const bio = findBio(bios, found.row.name, found.row.pos);
  return NextResponse.json(
    { log: found.log, bio: bio && { headshot: bio.headshot, height: bio.height, weight: bio.weight, yearsExp: bio.yearsExp } },
    { headers: { "Cache-Control": "private, max-age=300" } }
  );
}

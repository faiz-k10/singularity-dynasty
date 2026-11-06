import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { fetchWeekGameStates } from "@/lib/gameStatus";
import { loadGameStats, statChips } from "@/lib/gameStats";
import { normName } from "@/lib/playByPlay";
import { allowHit, clientIp } from "@/lib/rateLimit";

// One player's box-score line for a past game (the Recent Games panel's dropdown): the same ESPN numbers the Game Board shows when you click a score.
// Public data, so no sign-in; limited per address.
const hits = new Map();
// The game log uses nflverse's team codes, the scoreboard Sleeper's: they differ only on the Rams (LA vs LAR).
const TEAM_ALIAS = { LA: "LAR" };

export async function GET(req) {
  const h = await headers();
  if (!allowHit(hits, clientIp(h), Date.now(), 90, 60 * 1000)) return NextResponse.json({ chips: [] }, { status: 429 });
  const q = new URL(req.url).searchParams;
  const season = Number(q.get("season"));
  const week = Number(q.get("week"));
  const rawTeam = String(q.get("team") || "").slice(0, 4).toUpperCase();
  const team = TEAM_ALIAS[rawTeam] || rawTeam;
  const name = String(q.get("name") || "").slice(0, 60);
  const pos = String(q.get("pos") || "").slice(0, 4);
  if (!Number.isInteger(season) || season < 2000 || season > 2100 || !Number.isInteger(week) || week < 1 || week > 25 || !team || !name) {
    return NextResponse.json({ chips: [] }, { status: 400 });
  }
  try {
    const states = await fetchWeekGameStates(season, week);
    const lines = await loadGameStats([{ name, team, pos }], states);
    const line = lines[`${team}|${normName(name)}`];
    // A game that hasn't finished (or a player ESPN has no line for) answers with no chips; the panel says so.
    return NextResponse.json({ chips: statChips(pos, line) }, { headers: { "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=86400" } });
  } catch {
    return NextResponse.json({ chips: [] });
  }
}

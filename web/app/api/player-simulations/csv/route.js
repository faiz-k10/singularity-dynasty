import { createClient } from "@/lib/supabase/server";
import { createPublicClient } from "@/lib/supabase/public";
import { resolveTier } from "@/lib/tier";
import { fetchAllRows } from "@/lib/fetchAllRows";
import { toCsv } from "@/lib/csv";

const GAMES_PER_SEASON = 17;

const COLUMNS = [
  { key: "player_name", label: "Player" },
  { key: "position", label: "Position" },
  { key: "team", label: "Team" },
  { key: "floor", label: "Floor (PPG)" },
  { key: "median", label: "Median (PPG)" },
  { key: "ceiling", label: "Ceiling (PPG)" },
  { key: "trend", label: "Trend" },
  { key: "sample_confidence", label: "Confidence" },
];

// Singularity-only download of the latest week's simulations, in points per
// game, best median first. Built here on request instead of being embedded in
// the page: the page no longer carries a second, full copy of every row just
// so a rarely-clicked button has something to export.
export async function GET() {
  const supabase = await createClient();
  const { tier } = await resolveTier(supabase);
  if (tier !== "singularity") {
    return new Response("Singularity members only.", { status: 403 });
  }

  const pub = createPublicClient();
  const { data: latest } = await pub
    .from("player_simulations")
    .select("season, week")
    .order("season", { ascending: false })
    .order("week", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!latest) return new Response("No simulations published yet.", { status: 404 });

  const rows = await fetchAllRows(
    pub,
    "player_simulations",
    "player_name, position, team, floor, median, ceiling, trend, sample_confidence",
    (q) => q.eq("season", latest.season).eq("week", latest.week).order("median", { ascending: false })
  );
  const perGame = (v) => Math.round((v / GAMES_PER_SEASON) * 10) / 10;
  const csv = toCsv(
    COLUMNS,
    rows.map((r) => ({ ...r, floor: perGame(r.floor), median: perGame(r.median), ceiling: perGame(r.ceiling) }))
  );
  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="player-simulations-week${latest.week}-${latest.season}.csv"`,
      "Cache-Control": "private, no-store",
    },
  });
}

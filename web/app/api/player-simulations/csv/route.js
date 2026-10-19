import { createPublicClient } from "@/lib/supabase/public";
import { fetchAllRows } from "@/lib/fetchAllRows";
import { csvResponse, requireSingularity } from "@/lib/csvDownload";

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
// game, best median first.
export async function GET() {
  const denied = await requireSingularity();
  if (denied) return denied;

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
    (q) => q.eq("season", latest.season).eq("week", latest.week).order("median", { ascending: false }).order("player_name", { ascending: true })
  );
  const perGame = (v) => Math.round((v / GAMES_PER_SEASON) * 10) / 10;
  return csvResponse({
    filename: `player-simulations-week${latest.week}-${latest.season}.csv`,
    columns: COLUMNS,
    rows: rows.map((r) => ({ ...r, floor: perGame(r.floor), median: perGame(r.median), ceiling: perGame(r.ceiling) })),
  });
}

import { createPublicClient } from "@/lib/supabase/public";
import { fetchAllRows } from "@/lib/fetchAllRows";
import { csvResponse, requireSingularity } from "@/lib/csvDownload";
import { isBye, BYE_LABEL } from "@/lib/bye";
import { publicNote } from "@/lib/format";

const COLUMNS = [
  { key: "rank", label: "Rank" },
  { key: "player_name", label: "Player" },
  { key: "position", label: "Position" },
  { key: "team", label: "Team" },
  { key: "opponent", label: "Opponent" },
  { key: "floor", label: "Floor" },
  { key: "ceiling", label: "Ceiling" },
  { key: "trend", label: "Trend" },
  { key: "sample_confidence", label: "Confidence" },
  { key: "notes", label: "Notes" },
];

// Singularity-only download of the latest week's full ranking, best rank first.
export async function GET() {
  const denied = await requireSingularity();
  if (denied) return denied;

  const pub = createPublicClient();
  const { data: latest } = await pub
    .from("redraft_rankings")
    .select("season, week")
    .order("season", { ascending: false })
    .order("week", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!latest) return new Response("No rankings published yet.", { status: 404 });

  const rows = await fetchAllRows(
    pub,
    "redraft_rankings",
    "rank, player_name, position, team, opponent, floor, ceiling, trend, sample_confidence, notes",
    (q) => q.eq("season", latest.season).eq("week", latest.week).order("rank", { ascending: true })
  );
  return csvResponse({
    filename: `redraft-rankings-week${latest.week}-${latest.season}.csv`,
    columns: COLUMNS,
    // A team on a bye shows only who he is: no rank, range, trend or notes.
    rows: rows.map((r) =>
      isBye(r.opponent)
        ? { player_name: r.player_name, position: r.position, team: r.team, opponent: BYE_LABEL }
        : { ...r, notes: publicNote(r.notes) }
    ),
  });
}

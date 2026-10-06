import { createPublicClient } from "@/lib/supabase/public";
import { fetchAllRows } from "@/lib/fetchAllRows";
import { csvResponse, requireSingularity } from "@/lib/csvDownload";

const COLUMNS = [
  { key: "rank", label: "Rank" },
  { key: "player_name", label: "Player" },
  { key: "position", label: "Position" },
  { key: "school", label: "School" },
  { key: "comp", label: "Comp" },
];

// Singularity-only download of the latest class's prospect boards: wide
// receivers by rank, then quarterbacks by rank.
export async function GET() {
  const denied = await requireSingularity();
  if (denied) return denied;

  const pub = createPublicClient();
  const { data: latest } = await pub
    .from("prospect_rankings")
    .select("draft_class")
    .order("draft_class", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!latest) return new Response("No prospect boards published yet.", { status: 404 });

  const byPosition = (position) =>
    fetchAllRows(pub, "prospect_rankings", "rank, player_name, position, school, comp", (q) =>
      q.eq("draft_class", latest.draft_class).eq("position", position).order("rank", { ascending: true })
    );
  const [wrs, qbs] = await Promise.all([byPosition("WR"), byPosition("QB")]);
  return csvResponse({
    filename: `prospect-rankings-${latest.draft_class}.csv`,
    columns: COLUMNS,
    rows: [...wrs, ...qbs],
  });
}

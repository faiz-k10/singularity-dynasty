import { createPublicClient } from "@/lib/supabase/public";
import { fetchAllRows } from "@/lib/fetchAllRows";
import { csvResponse, requireSingularity } from "@/lib/csvDownload";

const COLUMNS = [
  { key: "round", label: "Round" },
  { key: "pick", label: "Pick" },
  { key: "player_name", label: "Player" },
  { key: "position", label: "Position" },
  { key: "team", label: "Team" },
  { key: "is_stack", label: "Stack" },
  { key: "stack_note", label: "Stack Note" },
];

// Singularity-only download of the latest startup or rookie board
// (?type=startup|rookie), in draft order.
export async function GET(request) {
  const denied = await requireSingularity();
  if (denied) return denied;

  const boardType = request.nextUrl.searchParams.get("type") === "rookie" ? "rookie" : "startup";
  const pub = createPublicClient();
  const { data: latest } = await pub
    .from("draft_board")
    .select("season")
    .eq("board_type", boardType)
    .order("season", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!latest) return new Response("This board hasn't been published yet.", { status: 404 });

  const rows = await fetchAllRows(
    pub,
    "draft_board",
    "round, pick, player_name, position, team, is_stack, stack_note",
    (q) =>
      q
        .eq("board_type", boardType)
        .eq("season", latest.season)
        .order("round", { ascending: true })
        .order("pick", { ascending: true })
  );
  return csvResponse({ filename: `draft-board-${boardType}-${latest.season}.csv`, columns: COLUMNS, rows });
}

import Link from "next/link";
import { unstable_cache } from "next/cache";
import { createPublicClient } from "@/lib/supabase/public";
import { getUserTier } from "@/lib/tier";
import { resolveSort, sortRows } from "@/lib/sortLink";
import InteractiveScript from "../../InteractiveScript";
import SortableTh from "../SortableTh";
import ExportCsvButton from "../ExportCsvButton";
import DynastyBoard from "./DynastyBoard";
import { FREE_ROWS, getDynastyRows } from "@/lib/dynastyData";

export const metadata = {
  title: "Dynasty Startup & Rookie Draft Board — Singularity Dynasty",
  description:
    "Round-by-round dynasty startup and rookie draft rankings with correlated stacks auto-flagged via roster-construction analysis. Full board with Explorer or Singularity.",
};

const PAID_TIERS = ["explorer", "singularity"];
const COLUMN_TYPES = {
  pick: "number",
  player_name: "string",
  position: "string",
  team: "string",
};

// Public-read table that changes by hand a few times a month: cached for a minute per board and access level instead of
// three sequential round trips to Supabase on every visit.
const getCachedBoard = unstable_cache(
  async (boardType, hasFullAccess) => {
    const supabase = createPublicClient();
    const { data: latest } = await supabase
      .from("draft_board")
      .select("season")
      .eq("board_type", boardType)
      .order("season", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (!latest) return { latest: null, picks: [], totalRounds: 0 };

    let picksQuery = supabase
      .from("draft_board")
      .select("round, pick, player_name, position, team, is_stack, stack_note")
      .eq("board_type", boardType)
      .eq("season", latest.season)
      .order("round", { ascending: true })
      .order("pick", { ascending: true });
    if (!hasFullAccess) picksQuery = picksQuery.lte("round", 1);

    // The round count and the picks don't depend on each other, so they run together.
    const [{ data: roundStats }, { data }] = await Promise.all([
      supabase
        .from("draft_board")
        .select("round")
        .eq("board_type", boardType)
        .eq("season", latest.season)
        .order("round", { ascending: false })
        .limit(1)
        .maybeSingle(),
      picksQuery,
    ]);
    return { latest, picks: data || [], totalRounds: roundStats?.round || 0 };
  },
  ["draft-board-picks"],
  { revalidate: 60 }
);

// Rankings (the tabular recipe board) | Startup | Rookie (the round-by-round tables below)
function BoardToggle({ active }) {
  return (
    <div className="board-toggle">
      {[["rankings", "Rankings"], ["startup", "Startup"], ["rookie", "Rookie"]].map(([key, text]) => (
        <Link key={key} href={`?type=${key}`} className={active === key ? "active" : ""}>
          {text}
        </Link>
      ))}
    </div>
  );
}

async function RankingsView({ hasFullAccess }) {
  const { rows, built, total, meta } = getDynastyRows(hasFullAccess);
  return (
    <>
      <InteractiveScript />
      <main className="wrap tool-wrap">
        <div className="tool-header-split">
          <div className="tool-header-left">
            <div className="eyebrow">{`Dynasty · built ${built}`}</div>
            <h1>Dynasty Draft Board</h1>
            <p className="tool-sub">
              Every player ranked by dynasty value, with the ranking drawn as a recipe: who is tied, which tier, which group.
            </p>
          </div>
          <div className="tool-header-right">
            <BoardToggle active="rankings" />
          </div>
        </div>
        <DynastyBoard rows={rows} meta={meta} complete={rows.length === total} />
        {!hasFullAccess && (
          <div className="tool-paywall reveal in">
            <p>
              You&apos;re seeing the top {FREE_ROWS} of {total} ranked players. Unlock the full board with Explorer or Singularity.
            </p>
            <Link href="/#pricing" className="btn-primary">
              See Pricing
            </Link>
          </div>
        )}
      </main>
    </>
  );
}

export default async function DraftBoardPage({ searchParams }) {
  const params = await searchParams;
  const boardType = params?.type === "rookie" ? "rookie" : params?.type === "startup" ? "startup" : "rankings";

  const { tier } = await getUserTier();
  const hasFullAccess = PAID_TIERS.includes(tier);
  if (boardType === "rankings") return <RankingsView hasFullAccess={hasFullAccess} />;

  const { latest, picks, totalRounds } = await getCachedBoard(boardType, hasFullAccess);

  const rounds = {};
  picks.forEach((p) => {
    (rounds[p.round] ??= []).push(p);
  });
  const roundNumbers = Object.keys(rounds)
    .map(Number)
    .sort((a, b) => a - b);

  const isTeaser = !hasFullAccess && totalRounds > 1;
  const canExport = tier === "singularity" && picks.length > 0;

  return (
    <>
      <InteractiveScript />

      <main className="wrap tool-wrap">
        <div className="tool-header-split">
          <div className="tool-header-left">
            <div className="eyebrow">{latest ? `${latest.season} Board` : "Draft Board"}</div>
            <h1>Dynasty Draft Board</h1>
            <p className="tool-sub">
              A full startup and rookie draft board, laid out round by round,
              with correlated stacks auto-flagged via roster-construction
              analysis.
            </p>
          </div>
          <div className="tool-header-right">
            <div className="toggle-row-flex">
              <BoardToggle active={boardType} />
              {canExport && (
                <ExportCsvButton
                  filename={`draft-board-${boardType}-${latest.season}.csv`}
                  href={`/api/draft-board/csv?type=${boardType}`}
                />
              )}
            </div>
          </div>
        </div>

        {picks.length === 0 ? (
          <div className="tool-empty">
            <p>This board hasn&apos;t been published yet — check back soon.</p>
          </div>
        ) : (
          <>
            {roundNumbers.map((roundNum) => {
              const sortParam = `r${roundNum}_sort`;
              const dirParam = `r${roundNum}_dir`;
              const { sortKey, sortDir } = resolveSort(
                params,
                "pick",
                "asc",
                sortParam,
                dirParam
              );
              const sortProps = {
                activeSort: sortKey,
                activeDir: sortDir,
                currentParams: params,
                sortParam,
                dirParam,
              };
              const roundRows = sortRows(rounds[roundNum], sortKey, sortDir, COLUMN_TYPES);
              return (
                <div className="draft-round" key={roundNum}>
                  <div className="draft-round-title">Round {roundNum}</div>
                  <div className="rankings-table-wrap">
                    <table className="rankings-table">
                      <thead>
                        <tr>
                          <SortableTh label="Pick" sortKey="pick" {...sortProps} />
                          <SortableTh label="Player" sortKey="player_name" {...sortProps} />
                          <SortableTh label="Pos" sortKey="position" {...sortProps} />
                          <SortableTh label="Team" sortKey="team" {...sortProps} />
                          <th></th>
                        </tr>
                      </thead>
                      <tbody>
                        {roundRows.map((p) => (
                          <tr key={p.pick}>
                            <td className="mono">
                              {roundNum}.{String(p.pick).padStart(2, "0")}
                            </td>
                            <td>{p.player_name}</td>
                            <td className="mono">{p.position}</td>
                            <td className="mono">{p.team || "—"}</td>
                            <td>
                              {p.is_stack && (
                                <span
                                  className="stack-badge"
                                >
                                  STACK
                                </span>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              );
            })}

            {isTeaser && (
              <div className="tool-paywall reveal in">
                <p>
                  You&apos;re seeing Round 1 of {totalRounds} rounds. Unlock
                  the full board with Explorer or Singularity.
                </p>
                <Link href="/#pricing" className="btn-primary">
                  See Pricing
                </Link>
              </div>
            )}
          </>
        )}
      </main>
    </>
  );
}

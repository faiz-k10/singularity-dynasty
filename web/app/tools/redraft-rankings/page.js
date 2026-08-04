import Link from "next/link";
import { getUserTier } from "@/lib/tier";
import { resolveSort, sortRows } from "@/lib/sortLink";
import ThemeToggle from "../../ThemeToggle";
import InteractiveScript from "../../InteractiveScript";
import ExportCsvButton from "../ExportCsvButton";
import RankingsSearch from "../RankingsSearch";

export const metadata = {
  title: "Redraft Weekly Rankings — Singularity Dynasty",
};

const POSITION_ORDER = ["QB", "RB", "WR", "TE"];
const OVERALL_COLUMN_TYPES = {
  rank: "number",
  player_name: "string",
  position: "string",
  team: "string",
  opponent: "string",
  projection: "number",
};

function sortPositions(positions) {
  return [...positions].sort((a, b) => {
    const ai = POSITION_ORDER.indexOf(a);
    const bi = POSITION_ORDER.indexOf(b);
    if (ai === -1 && bi === -1) return a.localeCompare(b);
    if (ai === -1) return 1;
    if (bi === -1) return -1;
    return ai - bi;
  });
}

// Free for everyone (Stargazer) per the pricing copy — no tier gating here.
export default async function RedraftRankingsPage({ searchParams }) {
  const params = await searchParams;

  const { supabase, tier } = await getUserTier();

  const { data: latest } = await supabase
    .from("redraft_rankings")
    .select("season, week")
    .order("season", { ascending: false })
    .order("week", { ascending: false })
    .limit(1)
    .maybeSingle();

  let rankings = [];

  if (latest) {
    const { data } = await supabase
      .from("redraft_rankings")
      .select(
        "rank, player_name, position, team, opponent, projection, matchup_mult, trend, sample_confidence, notes"
      )
      .eq("season", latest.season)
      .eq("week", latest.week)
      .order("rank", { ascending: true });

    // Position-relative rank (RB1, WR23, ...) computed once from the
    // natural rank order -- stays fixed on each row even if the table is
    // later re-sorted by a different column via SortableTh.
    const positionCounters = {};
    rankings = (data || []).map((r) => {
      positionCounters[r.position] = (positionCounters[r.position] || 0) + 1;
      return { ...r, positionLabel: `${r.position}${positionCounters[r.position]}` };
    });

    // Projection heat-tint is position-relative -- QBs score far higher
    // raw totals than TEs, so a global min/max would make every QB look
    // "hot" regardless of how they actually rank among their own position.
    const projRangeByPos = {};
    for (const r of rankings) {
      const range = projRangeByPos[r.position] || { min: Infinity, max: -Infinity };
      range.min = Math.min(range.min, r.projection);
      range.max = Math.max(range.max, r.projection);
      projRangeByPos[r.position] = range;
    }
    rankings = rankings.map((r) => {
      const range = projRangeByPos[r.position];
      const heat = range && range.max > range.min ? (r.projection - range.min) / (range.max - range.min) : 0;
      return { ...r, heat };
    });
  }

  const positions = sortPositions([...new Set(rankings.map((r) => r.position))]);

  const { sortKey, sortDir } = resolveSort(params, "rank", "asc");
  const overallRows = sortRows(
    rankings.map((r) => ({ ...r, displayRank: r.rank })),
    sortKey,
    sortDir,
    OVERALL_COLUMN_TYPES
  );
  const canExport = tier === "singularity" && rankings.length > 0;

  return (
    <div className="tool-page">
      <ThemeToggle />
      <Link href="/" className="brandmark brandmark-nav">
        <span className="ring"></span>Singularity Dynasty
      </Link>

      <main className="wrap tool-wrap">
        <div className="eyebrow">
          {latest ? `Week ${latest.week} · ${latest.season}` : "Redraft"}
        </div>
        <h1>Redraft Weekly Rankings</h1>
        <p className="tool-sub">
          Standard redraft rankings, refreshed every week of the season and
          adjusted for opponent-strength and matchup efficiency data. Free
          for every Stargazer.
        </p>

        {rankings.length === 0 ? (
          <div className="tool-empty">
            <p>
              Rankings publish weekly during the season — check back soon.
            </p>
          </div>
        ) : (
          <>
            <div className="toggle-row-flex">
              <div className="toggle-row-actions">
                <Link href="/tools/compare-players" className="hub-panel-link">
                  Compare Players →
                </Link>
                {canExport && (
                  <ExportCsvButton
                    id="csv-redraft-rankings"
                    filename={`redraft-rankings-week${latest.week}-${latest.season}.csv`}
                    columns={[
                      { key: "rank", label: "Rank" },
                      { key: "player_name", label: "Player" },
                      { key: "position", label: "Position" },
                      { key: "team", label: "Team" },
                      { key: "opponent", label: "Opponent" },
                      { key: "projection", label: "Projection" },
                      { key: "trend", label: "Trend" },
                      { key: "sample_confidence", label: "Confidence" },
                      { key: "notes", label: "Notes" },
                    ]}
                    rows={overallRows}
                  />
                )}
              </div>
            </div>

            <RankingsSearch
              rows={overallRows}
              sortKey={sortKey}
              sortDir={sortDir}
              currentParams={params}
              positions={positions}
            />
          </>
        )}
      </main>
      <InteractiveScript />
    </div>
  );
}

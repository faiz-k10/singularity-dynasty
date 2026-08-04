import Link from "next/link";
import { getUserTier } from "@/lib/tier";
import { resolveSort, sortRows } from "@/lib/sortLink";
import ThemeToggle from "../../ThemeToggle";
import InteractiveScript from "../../InteractiveScript";
import ExportCsvButton from "../ExportCsvButton";
import OverallSearch from "../OverallSearch";
import PositionFilterSearch from "../PositionFilterSearch";

export const metadata = {
  title: "Redraft Weekly Rankings — Singularity Dynasty",
};

const POSITION_ORDER = ["QB", "RB", "WR", "TE"];
const OVERALL_COLUMN_TYPES = {
  rank: "number",
  player_name: "string",
  position: "string",
  team: "string",
  projection: "number",
};
const POSITION_COLUMN_TYPES = {
  rank: "number",
  player_name: "string",
  team: "string",
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
  const view = params?.view === "overall" ? "overall" : "position";

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
      .select("rank, player_name, position, team, projection, trend, sample_confidence, notes")
      .eq("season", latest.season)
      .eq("week", latest.week)
      .order("rank", { ascending: true });
    rankings = data || [];
  }

  const byPosition = {};
  rankings.forEach((row) => {
    (byPosition[row.position] ??= []).push(row);
  });
  const positions = sortPositions(Object.keys(byPosition));
  const byPositionLabeled = {};
  positions.forEach((pos) => {
    byPositionLabeled[pos] = byPosition[pos].map((r, i) => ({
      ...r,
      displayRank: `${pos}${i + 1}`,
    }));
  });

  const { sortKey, sortDir } = resolveSort(params, "rank", "asc");
  const overallRows = sortRows(
    rankings.map((r) => ({ ...r, displayRank: r.rank })),
    sortKey,
    sortDir,
    OVERALL_COLUMN_TYPES
  );
  const canExport = tier === "singularity" && rankings.length > 0;

  // Per-position sort still resolves server-side from URL params (each
  // position keeps its own ?xx_sort=/&xx_dir= pair); which positions are
  // VISIBLE and the player-name search are both client-side state, handled
  // by PositionFilterSearch below.
  const positionData = {};
  positions.forEach((pos) => {
    const sortParam = `${pos.toLowerCase()}_sort`;
    const dirParam = `${pos.toLowerCase()}_dir`;
    const { sortKey: posSortKey, sortDir: posSortDir } = resolveSort(
      params,
      "rank",
      "asc",
      sortParam,
      dirParam
    );
    positionData[pos] = {
      rows: sortRows(byPositionLabeled[pos], posSortKey, posSortDir, POSITION_COLUMN_TYPES),
      sortKey: posSortKey,
      sortDir: posSortDir,
      sortParam,
      dirParam,
    };
  });

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
              <div className="board-toggle">
                <Link href="?view=overall" className={view === "overall" ? "active" : ""}>
                  Overall
                </Link>
                <Link href="?view=position" className={view === "position" ? "active" : ""}>
                  By Position
                </Link>
              </div>
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

            {view === "overall" ? (
              <OverallSearch
                rows={overallRows}
                sortKey={sortKey}
                sortDir={sortDir}
                currentParams={params}
              />
            ) : (
              <PositionFilterSearch
                positions={positions}
                positionData={positionData}
                currentParams={params}
              />
            )}
          </>
        )}
      </main>
      <InteractiveScript />
    </div>
  );
}

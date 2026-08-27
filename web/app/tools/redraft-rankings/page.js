import Link from "next/link";
import { getUserTier } from "@/lib/tier";
import { resolveSort, sortRows } from "@/lib/sortLink";
import SiteHeader from "../../SiteHeader";
import ExportCsvButton from "../ExportCsvButton";
import RedraftRankingsClient from "./RedraftRankingsClient";

export const metadata = {
  title: "Weekly Fantasy Football Rankings (PPR) — Singularity Dynasty",
  description:
    "Standard redraft fantasy football rankings for every position, refreshed weekly and adjusted for matchup and opponent-strength data. Free top-50 access for every Stargazer.",
};

const PAID_TIERS = ["explorer", "singularity"];
const POSITION_ORDER = ["QB", "RB", "WR", "TE"];
// Flattened onto each row (see the scoring_stats spread below) so
// SortableTh/sortRows can reach them the same way as every other
// column -- sortRows compares row[sortKey] directly, no nested-path
// support, so these have to live at the top level, not buried in
// row.scoring_stats.
const STAT_COLUMN_KEYS = [
  "passing_yards", "passing_tds", "passing_interceptions",
  "rushing_yards", "rushing_tds",
  "receptions", "receiving_yards", "receiving_tds",
];
const OVERALL_COLUMN_TYPES = {
  rank: "number",
  player_name: "string",
  position: "string",
  team: "string",
  opponent: "string",
  projection: "number",
  notes: "string",
  ...Object.fromEntries(STAT_COLUMN_KEYS.map((k) => [k, "number"])),
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

// Stargazer sees the top 50 only; Explorer/Singularity see the full
// list — matches the pricing copy's "Weekly Projection Rankings (Top
// 100)" Stargazer bullet.
export default async function RedraftRankingsPage({ searchParams }) {
  const params = await searchParams;

  const { supabase, tier } = await getUserTier();
  const hasFullAccess = PAID_TIERS.includes(tier);

  const { data: latest } = await supabase
    .from("redraft_rankings")
    .select("season, week")
    .order("season", { ascending: false })
    .order("week", { ascending: false })
    .limit(1)
    .maybeSingle();

  let rankings = [];
  let totalCount = 0;

  if (latest) {
    const { count } = await supabase
      .from("redraft_rankings")
      .select("*", { count: "exact", head: true })
      .eq("season", latest.season)
      .eq("week", latest.week);
    totalCount = count || 0;

    let query = supabase
      .from("redraft_rankings")
      .select(
        "rank, player_name, position, team, opponent, projection, matchup_mult, trend, sample_confidence, scoring_stats, notes"
      )
      .eq("season", latest.season)
      .eq("week", latest.week)
      .order("rank", { ascending: true });

    if (!hasFullAccess) {
      query = query.limit(50);
    }

    const { data } = await query;

    // Position-relative rank (RB1, WR23, ...) computed once from the
    // natural rank order -- stays fixed on each row even if the table is
    // later re-sorted by a different column via SortableTh.
    const positionCounters = {};
    rankings = (data || []).map((r) => {
      positionCounters[r.position] = (positionCounters[r.position] || 0) + 1;
      return { ...r, ...r.scoring_stats, positionLabel: `${r.position}${positionCounters[r.position]}` };
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
  const isTeaser = !hasFullAccess && totalCount > 50;

  return (
    <div className="tool-page">
      <SiteHeader />

      <main className="wrap tool-wrap redraft-wrap">
        {rankings.length === 0 ? (
          <>
            <div className="eyebrow">
              {latest ? `Week ${latest.week} · ${latest.season}` : "Redraft"}
            </div>
            <h1>Redraft Weekly Rankings</h1>
            <p className="tool-sub">
              Standard redraft rankings, refreshed every week of the season and
              adjusted for opponent-strength and matchup efficiency data.
              Weekly projection rankings — top 50 free for every Stargazer.
            </p>
            <div className="tool-empty">
              <p>
                Rankings publish weekly during the season — check back soon.
              </p>
            </div>
          </>
        ) : (
          <>
            <RedraftRankingsClient
              rawRows={overallRows}
              sortKey={sortKey}
              sortDir={sortDir}
              currentParams={params}
              positions={positions}
              header={
                <>
                  <div className="eyebrow">
                    {latest ? `Week ${latest.week} · ${latest.season}` : "Redraft"}
                  </div>
                  <h1>Redraft Weekly Rankings</h1>
                  <p className="tool-sub">
                    Standard redraft rankings, refreshed every week of the season and
                    adjusted for opponent-strength and matchup efficiency data.
                    Weekly projection rankings — top 50 free for every Stargazer.
                  </p>
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
                </>
              }
            />

            {isTeaser && (
              <div className="tool-paywall reveal in">
                <p>
                  You&apos;re seeing the top 50 of {totalCount} players. Unlock
                  the full list with Explorer or Singularity.
                </p>
                <Link href="/#pricing" className="btn-primary">
                  See Pricing
                </Link>
              </div>
            )}
          </>
        )}
      </main>
    </div>
  );
}

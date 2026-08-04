import Link from "next/link";
import { getUserTier } from "@/lib/tier";
import { resolveSort, sortRows } from "@/lib/sortLink";
import ThemeToggle from "../../ThemeToggle";
import InteractiveScript from "../../InteractiveScript";
import ExportCsvButton from "../ExportCsvButton";
import BestBallSearch from "../BestBallSearch";

export const metadata = {
  title: "Best Ball Rankings — Singularity Dynasty",
};

const TEASER_LIMIT = 10;
const PAID_TIERS = ["explorer", "singularity"];
const POSITION_ORDER = ["QB", "RB", "WR", "TE"];
const COLUMN_TYPES = {
  rank: "number",
  player_name: "string",
  position: "string",
  team: "string",
  opponent: "string",
  ceiling_score: "number",
  playoff_ceiling_score: "number",
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

export default async function BestBallRankingsPage({ searchParams }) {
  const params = await searchParams;
  const { supabase, tier } = await getUserTier();
  const hasFullAccess = PAID_TIERS.includes(tier);

  const { data: latest } = await supabase
    .from("best_ball_rankings")
    .select("season, week")
    .order("season", { ascending: false })
    .order("week", { ascending: false })
    .limit(1)
    .maybeSingle();

  let rankings = [];
  let totalCount = 0;

  if (latest) {
    let query = supabase
      .from("best_ball_rankings")
      .select(
        "rank, player_name, position, team, opponent, ceiling_score, ceiling_range_low, ceiling_probability, playoff_ceiling_score, trend, sample_confidence, notes",
        { count: "exact" }
      )
      .eq("season", latest.season)
      .eq("week", latest.week)
      .order("rank", { ascending: true });

    if (!hasFullAccess) {
      query = query.limit(TEASER_LIMIT);
    }

    const { data, count } = await query;

    // Position-relative rank (RB1, WR23, ...) computed once from the
    // natural rank order -- stays fixed on each row even if the table is
    // later re-sorted by a different column via SortableTh.
    const positionCounters = {};
    rankings = (data || []).map((r) => {
      positionCounters[r.position] = (positionCounters[r.position] || 0) + 1;
      return { ...r, positionLabel: `${r.position}${positionCounters[r.position]}` };
    });
    totalCount = count || 0;
  }

  const isTeaser = !hasFullAccess && totalCount > rankings.length;
  const { sortKey, sortDir } = resolveSort(params, "rank", "asc");
  const sortedRankings = sortRows(rankings, sortKey, sortDir, COLUMN_TYPES);
  const canExport = tier === "singularity" && rankings.length > 0;
  const positions = sortPositions([...new Set(rankings.map((r) => r.position))]);

  return (
    <div className="tool-page">
      <ThemeToggle />
      <Link href="/" className="brandmark brandmark-nav">
        <span className="ring"></span>Singularity Dynasty
      </Link>

      <main className="wrap tool-wrap">
        <div className="eyebrow">
          {latest ? `Updated Week ${latest.week} · ${latest.season}` : "Best Ball"}
        </div>
        <h1>Best Ball Rankings</h1>
        <p className="tool-sub">
          Rankings tuned specifically for best ball formats, regression-
          weighted for weekly ceiling and variance instead of week-to-week
          consistency.
        </p>

        {rankings.length === 0 ? (
          <div className="tool-empty">
            <p>Rankings publish through the season — check back soon.</p>
          </div>
        ) : (
          <>
            <div className="toggle-row-flex">
              <div className="toggle-row-actions">
                <Link href="/tools/compare-best-ball" className="hub-panel-link">
                  Compare Players →
                </Link>
                {canExport && (
                  <ExportCsvButton
                    id="csv-best-ball-rankings"
                    filename={`best-ball-rankings-week${latest.week}-${latest.season}.csv`}
                    columns={[
                      { key: "rank", label: "Rank" },
                      { key: "player_name", label: "Player" },
                      { key: "position", label: "Position" },
                      { key: "team", label: "Team" },
                      { key: "opponent", label: "Opponent" },
                      { key: "ceiling_score", label: "This Week" },
                      { key: "ceiling_range_low", label: "This Week Low" },
                      { key: "ceiling_probability", label: "This Week %" },
                      { key: "playoff_ceiling_score", label: "Playoffs (Wk 15-17)" },
                      { key: "trend", label: "Trend" },
                      { key: "sample_confidence", label: "Confidence" },
                      { key: "notes", label: "Notes" },
                    ]}
                    rows={sortedRankings}
                  />
                )}
              </div>
            </div>
            <BestBallSearch
              rows={sortedRankings}
              sortKey={sortKey}
              sortDir={sortDir}
              currentParams={params}
              positions={positions}
            />

            {isTeaser && (
              <div className="tool-paywall reveal in">
                <p>
                  You&apos;re seeing the top {TEASER_LIMIT} of {totalCount}{" "}
                  ranked players. Unlock the full board with Explorer or
                  Singularity.
                </p>
                <Link href="/#pricing" className="btn-primary">
                  See Pricing
                </Link>
              </div>
            )}
          </>
        )}
      </main>
      <InteractiveScript />
    </div>
  );
}

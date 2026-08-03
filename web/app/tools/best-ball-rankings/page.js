import Link from "next/link";
import { getUserTier } from "@/lib/tier";
import { resolveSort, sortRows } from "@/lib/sortLink";
import ThemeToggle from "../../ThemeToggle";
import InteractiveScript from "../../InteractiveScript";
import SortableTh from "../SortableTh";
import ExportCsvButton from "../ExportCsvButton";

export const metadata = {
  title: "Best Ball Rankings — Singularity Dynasty",
};

const TEASER_LIMIT = 10;
const PAID_TIERS = ["explorer", "singularity"];
const COLUMN_TYPES = {
  rank: "number",
  player_name: "string",
  position: "string",
  team: "string",
  ceiling_score: "number",
  playoff_ceiling_score: "number",
};

function formatScore(value) {
  return value === null || value === undefined ? "—" : Math.round(Number(value));
}

// "21-25" when a range is published, falling back to the single ceiling
// number if ceiling_range_low hasn't been uploaded for this row yet.
// Whole numbers throughout — easier to scan at a glance than decimals.
function formatCeilingRange(row) {
  if (row.ceiling_score === null || row.ceiling_score === undefined) return "—";
  const high = Math.round(Number(row.ceiling_score));
  if (row.ceiling_range_low === null || row.ceiling_range_low === undefined) return String(high);
  return `${Math.round(Number(row.ceiling_range_low))}-${high}`;
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
        "rank, player_name, position, team, ceiling_score, ceiling_range_low, ceiling_probability, playoff_ceiling_score, notes",
        { count: "exact" }
      )
      .eq("season", latest.season)
      .eq("week", latest.week)
      .order("rank", { ascending: true });

    if (!hasFullAccess) {
      query = query.limit(TEASER_LIMIT);
    }

    const { data, count } = await query;
    rankings = data || [];
    totalCount = count || 0;
  }

  const isTeaser = !hasFullAccess && totalCount > rankings.length;
  const { sortKey, sortDir } = resolveSort(params, "rank", "asc");
  const sortedRankings = sortRows(rankings, sortKey, sortDir, COLUMN_TYPES);
  const canExport = tier === "singularity" && rankings.length > 0;
  const sortProps = { activeSort: sortKey, activeDir: sortDir, currentParams: params };

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
            {canExport && (
              <div className="tool-export-row">
                <ExportCsvButton
                  id="csv-best-ball-rankings"
                  filename={`best-ball-rankings-week${latest.week}-${latest.season}.csv`}
                  columns={[
                    { key: "rank", label: "Rank" },
                    { key: "player_name", label: "Player" },
                    { key: "position", label: "Position" },
                    { key: "team", label: "Team" },
                    { key: "ceiling_score", label: "This Week" },
                    { key: "ceiling_range_low", label: "This Week Low" },
                    { key: "ceiling_probability", label: "This Week %" },
                    { key: "playoff_ceiling_score", label: "Playoffs (Wk 15-17)" },
                    { key: "notes", label: "Notes" },
                  ]}
                  rows={sortedRankings}
                />
              </div>
            )}
            <div className="rankings-table-wrap">
              <table className="rankings-table">
                <thead>
                  <tr>
                    <SortableTh label="Rank" sortKey="rank" {...sortProps} />
                    <SortableTh label="Player" sortKey="player_name" {...sortProps} />
                    <SortableTh label="Pos" sortKey="position" {...sortProps} />
                    <SortableTh label="Team" sortKey="team" {...sortProps} />
                    <SortableTh label="This Week" sortKey="ceiling_score" {...sortProps} />
                    <SortableTh
                      label="Playoffs (Wk 15-17)"
                      sortKey="playoff_ceiling_score"
                      {...sortProps}
                    />
                    <th>Notes</th>
                  </tr>
                </thead>
                <tbody>
                  {sortedRankings.map((row) => (
                    <tr key={row.rank}>
                      <td className="mono">{row.rank}</td>
                      <td>{row.player_name}</td>
                      <td className="mono">{row.position}</td>
                      <td className="mono">{row.team || "—"}</td>
                      <td className="mono ceiling-cell">
                        {formatCeilingRange(row)}
                        {row.ceiling_probability !== null &&
                          row.ceiling_probability !== undefined && (
                            <span className="ceiling-pct">{row.ceiling_probability}%</span>
                          )}
                      </td>
                      <td className="mono">{formatScore(row.playoff_ceiling_score)}</td>
                      <td className="tool-notes">{row.notes || ""}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

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

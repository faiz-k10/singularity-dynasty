import Link from "next/link";
import { getUserTier } from "@/lib/tier";
import { resolveSort, sortRows } from "@/lib/sortLink";
import ThemeToggle from "../../ThemeToggle";
import InteractiveScript from "../../InteractiveScript";
import SortableTh from "../SortableTh";
import ExportCsvButton from "../ExportCsvButton";
import TrendTag from "../TrendTag";
import ConfidenceBadge from "../ConfidenceBadge";

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
const POSITION_COLUMN_TYPES = { rank: "number", player_name: "string" };

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

function formatProjection(value) {
  return value === null || value === undefined ? "—" : Number(value).toFixed(1);
}

function PlayerCell({ row, withPopover }) {
  if (!withPopover) {
    return (
      <td>
        <ConfidenceBadge confidence={row.sample_confidence} /> {row.player_name}{" "}
        <TrendTag trend={row.trend} />
      </td>
    );
  }
  return (
    <td>
      <span className="player-hover" tabIndex={0}>
        <ConfidenceBadge confidence={row.sample_confidence} /> {row.player_name}
        <div className="player-popover">
          <div className="player-popover-card">
            <div className="player-popover-row">
              <span>Team</span>
              <span>{row.team || "—"}</span>
            </div>
            <div className="player-popover-row">
              <span>Proj</span>
              <span>{formatProjection(row.projection)}</span>
            </div>
            <div className="player-popover-row">
              <span>Trend</span>
              <span><TrendTag trend={row.trend} /></span>
            </div>
            {row.notes && <div className="player-popover-notes">{row.notes}</div>}
            <Link
              href={`/tools/compare-players?p1=${encodeURIComponent(row.player_name)}`}
              className="player-popover-compare"
            >
              + Compare
            </Link>
          </div>
        </div>
      </span>
    </td>
  );
}

function RankingsTable({
  rows,
  showPosition,
  showTeam = true,
  showProjection = false,
  showNotes = true,
  popoverOnName = false,
  sortKey,
  sortDir,
  currentParams,
  sortParam = "sort",
  dirParam = "dir",
}) {
  const sortProps = { activeSort: sortKey, activeDir: sortDir, currentParams, sortParam, dirParam };
  return (
    <div className="rankings-table-wrap">
      <table className="rankings-table">
        <thead>
          <tr>
            <SortableTh label="Rank" sortKey="rank" {...sortProps} />
            <SortableTh label="Player" sortKey="player_name" {...sortProps} />
            {showPosition && <SortableTh label="Pos" sortKey="position" {...sortProps} />}
            {showTeam && <SortableTh label="Team" sortKey="team" {...sortProps} />}
            {showProjection && (
              <SortableTh label="Proj" sortKey="projection" {...sortProps} />
            )}
            {showNotes && <th>Notes</th>}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={`${row.position}-${row.rank}`}>
              <td className="mono">{row.displayRank}</td>
              <PlayerCell row={row} withPopover={popoverOnName} />
              {showPosition && <td className="mono">{row.position}</td>}
              {showTeam && <td className="mono">{row.team || "—"}</td>}
              {showProjection && (
                <td className="mono">{formatProjection(row.projection)}</td>
              )}
              {showNotes && <td className="tool-notes">{row.notes || ""}</td>}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
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
              <RankingsTable
                rows={overallRows}
                showPosition
                showProjection
                sortKey={sortKey}
                sortDir={sortDir}
                currentParams={params}
              />
            ) : (
              <>
                <p className="tool-hint">
                  Hover or tap a name for projection, team, and notes.
                </p>
                <div className="position-columns">
                  {positions.map((pos) => {
                    const sortParam = `${pos.toLowerCase()}_sort`;
                    const dirParam = `${pos.toLowerCase()}_dir`;
                    const { sortKey: posSortKey, sortDir: posSortDir } = resolveSort(
                      params,
                      "rank",
                      "asc",
                      sortParam,
                      dirParam
                    );
                    return (
                      <div className="position-col" key={pos}>
                        <div className="draft-round-title">
                          {pos} · {byPosition[pos].length}
                        </div>
                        <RankingsTable
                          rows={sortRows(
                            byPositionLabeled[pos],
                            posSortKey,
                            posSortDir,
                            POSITION_COLUMN_TYPES
                          )}
                          showPosition={false}
                          showTeam={false}
                          showNotes={false}
                          popoverOnName
                          sortKey={posSortKey}
                          sortDir={posSortDir}
                          currentParams={params}
                          sortParam={sortParam}
                          dirParam={dirParam}
                        />
                      </div>
                    );
                  })}
                </div>
              </>
            )}
          </>
        )}
      </main>
      <InteractiveScript />
    </div>
  );
}

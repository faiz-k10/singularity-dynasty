import Link from "next/link";
import { getUserTier } from "@/lib/tier";
import ThemeToggle from "../../ThemeToggle";
import InteractiveScript from "../../InteractiveScript";

export const metadata = {
  title: "Redraft Weekly Rankings — Singularity Dynasty",
};

const POSITION_ORDER = ["QB", "RB", "WR", "TE"];

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
    return <td>{row.player_name}</td>;
  }
  return (
    <td>
      <span className="player-hover" tabIndex={0}>
        {row.player_name}
        <div className="player-popover">
          <div className="player-popover-row">
            <span>Team</span>
            <span>{row.team || "—"}</span>
          </div>
          <div className="player-popover-row">
            <span>Proj</span>
            <span>{formatProjection(row.projection)}</span>
          </div>
          {row.notes && <div className="player-popover-notes">{row.notes}</div>}
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
}) {
  return (
    <div className="rankings-table-wrap">
      <table className="rankings-table">
        <thead>
          <tr>
            <th>Rank</th>
            <th>Player</th>
            {showPosition && <th>Pos</th>}
            {showTeam && <th>Team</th>}
            {showProjection && <th>Proj</th>}
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

  const { supabase } = await getUserTier();

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
      .select("rank, player_name, position, team, projection, notes")
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
              <Link href="/tools/compare-players" className="hub-panel-link">
                Compare Players →
              </Link>
            </div>

            {view === "overall" ? (
              <RankingsTable
                rows={rankings.map((r) => ({ ...r, displayRank: r.rank }))}
                showPosition
                showProjection
              />
            ) : (
              <>
                <p className="tool-hint">
                  Hover or tap a name for projection, team, and notes.
                </p>
                <div className="position-columns">
                  {positions.map((pos) => (
                    <div className="position-col" key={pos}>
                      <div className="draft-round-title">
                        {pos} · {byPosition[pos].length}
                      </div>
                      <RankingsTable
                        rows={byPosition[pos].map((r, i) => ({
                          ...r,
                          displayRank: `${pos}${i + 1}`,
                        }))}
                        showPosition={false}
                        showTeam={false}
                        showNotes={false}
                        popoverOnName
                      />
                    </div>
                  ))}
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

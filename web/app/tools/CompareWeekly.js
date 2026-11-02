import TeamBadge from "./TeamBadge";
import CompareTabs from "./CompareTabs";
import Define from "../Define";
import { PlayerHeaderPanel, PlayerStatsRow, OutcomeCurvePanel, UsageTdPanel, GameLogPanel } from "./WeeklyDetailRow";

// Compare Players (Weekly Projection Rankings), as two tabs: HEAD TO HEAD (a table of the numbers that matter) and PLAYER PROFILES (the same
// dashboard panels the opened-player row shows (identity + badges, this week / last week, outcome curve, usage or
// touchdown profile, recent games), laid out in one grid row per panel so the players line up side by side.

const f1 = (v) => v.toFixed(1);
const f2 = (v) => v.toFixed(2);
const pct1 = (v) => `${v.toFixed(1)}%`;
const int = (v) => String(Math.round(v));
const signed2 = (v) => `${v >= 0 ? "+" : ""}${v.toFixed(2)}`;

// best: "high" | "low" -- which end wins. Rows with fewer than two values, or all equal, highlight nobody.
const ROWS = [
  { label: "Overall rank", get: (r) => r.rank, fmt: int, best: "low" },
  { label: "Median proj", term: "projection-median", get: (r) => r.projection, fmt: f1, best: "high", strong: true },
  { label: "Floor", term: "floor", get: (r) => r.floor, fmt: f1, best: "high" },
  { label: "Ceiling", term: "ceiling", get: (r) => r.ceiling, fmt: f1, best: "high" },
  { label: "Last week (pts)", get: (r) => r.lastWeekRank?.points, fmt: f1, best: "high" },
  { group: "Projected stat line (per game)" },
  { label: "Pass yds", get: (r) => r.passing_yards, fmt: f1, best: "high", skipZero: true },
  { label: "Pass TD", get: (r) => r.passing_tds, fmt: f2, best: "high", skipZero: true },
  { label: "INT", get: (r) => r.passing_interceptions, fmt: f2, best: "low", skipZero: true },
  { label: "Rush yds", get: (r) => r.rushing_yards, fmt: f1, best: "high", skipZero: true },
  { label: "Rush TD", get: (r) => r.rushing_tds, fmt: f2, best: "high", skipZero: true },
  { label: "Receptions", get: (r) => r.receptions, fmt: f1, best: "high", skipZero: true },
  { label: "Rec yds", get: (r) => r.receiving_yards, fmt: f1, best: "high", skipZero: true },
  { label: "Rec TD", get: (r) => r.receiving_tds, fmt: f2, best: "high", skipZero: true },
  { group: "Usage and touchdown profile" },
  { label: "xFP / game", term: "avgXfp", get: (r) => r.avgXfp, fmt: f1, best: "high" },
  { label: "WOPR", term: "wopr", get: (r) => r.wopr, fmt: f2, best: "high" },
  { label: "Target share", term: "u_tgt_share", get: (r) => r.targetShare, fmt: pct1, best: "high" },
  { label: "YAC above exp", term: "yac-above-exp", get: (r) => r.yacAboveExp, fmt: f2, best: "high" },
  { label: "RYOE / att", term: "ryoe", get: (r) => r.ryoe, fmt: signed2, best: "high" },
  { label: "Scramble rate", term: "scrambleRate", get: (r) => r.scrambleRate, fmt: pct1, best: "high" },
  { label: "Play-action rate", term: "playActionRate", get: (r) => r.playActionRate, fmt: pct1, best: "high" },
  { label: "2+ TD chance", term: "p2Td", get: (r) => r.p2Td, fmt: pct1, best: "high" },
  { label: "In-10 tgts / G", term: "i10Pg", get: (r) => r.i10Pg, fmt: f2, best: "high" },
  { label: "In-10 share", term: "i10Share", get: (r) => r.i10Share, fmt: pct1, best: "high" },
];

function bestIndexes(values, best) {
  const have = values.filter((v) => v != null);
  if (have.length < 2) return new Set();
  const target = best === "low" ? Math.min(...have) : Math.max(...have);
  if (have.every((v) => v === target)) return new Set();
  return new Set(values.map((v, i) => (v === target ? i : -1)).filter((i) => i >= 0));
}

function MatchupCell({ row }) {
  if (!row.opponent || row.opponent === "NA") return <span className="mono">BYE</span>;
  const sep = row.is_home === true ? "vs" : row.is_home === false ? "@" : "·";
  const lean = row.defLean;
  return (
    <span className="compare-matchup">
      <span className="matchup-sep">{sep}</span>
      <TeamBadge team={row.opponent} />
      {lean && (
        <span className="compare-matchup-lean">
          <span className={`player-achv-dot ${lean.call === "SMASH" ? "smash" : "tough"}`} />
          {lean.call === "SMASH" ? "Smash" : "Tough"}
        </span>
      )}
    </span>
  );
}

export default function CompareWeekly({ players, maxSpread }) {
  const n = players.length;
  const rows = ROWS.map((def) => {
    if (def.group) return { group: def.group };
    const values = players.map((p) => {
      const v = def.get(p);
      return v == null || Number.isNaN(Number(v)) ? null : Number(v);
    });
    const hasAny = def.skipZero ? values.some((v) => v) : values.some((v) => v != null);
    return hasAny ? { def, values, best: bestIndexes(values, def.best) } : null;
  }).filter(Boolean);
  // Drop a group heading that ended up with no rows under it.
  const shown = rows.filter((r, i) => !r.group || (rows[i + 1] && !rows[i + 1].group));

  return (
    <CompareTabs
      tabs={[
        {
          key: "h2h",
          label: "Head to Head",
          node: (
            <>
          <div className="compare-table-wrap compare-h2h">
            <table className="compare-table" style={{ "--cmp-n": n }}>
              <thead>
                <tr>
                  <th></th>
                  {players.map((p) => (
                    <th key={p.player_name}>{p.player_name}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                <tr>
                  <th>Position</th>
                  {players.map((p) => (
                    <td className="mono" key={p.player_name}>
                      <span className="compare-pos">
                    {p.positionLabel || p.position}
                    <span aria-hidden="true">·</span>
                    <TeamBadge team={p.team} />
                  </span>
                    </td>
                  ))}
                </tr>
                <tr>
                  <th>Matchup</th>
                  {players.map((p) => (
                    <td key={p.player_name}>
                      <MatchupCell row={p} />
                    </td>
                  ))}
                </tr>
                {shown.map((r) =>
                  r.group ? (
                    <tr className="compare-group-row" key={r.group}>
                      <th colSpan={n + 1}>{r.group}</th>
                    </tr>
                  ) : (
                    <tr key={r.def.label}>
                      <th>{r.def.term ? <Define term={r.def.term}>{r.def.label}</Define> : r.def.label}</th>
                      {r.values.map((v, i) => (
                        <td
                          key={players[i].player_name}
                          className={`mono${r.best.has(i) ? " compare-best" : ""}${r.def.strong ? " compare-strong" : ""}`}
                        >
                          {v == null ? "—" : r.def.fmt(v)}
                        </td>
                      ))}
                    </tr>
                  )
                )}
              </tbody>
            </table>
          </div>
          <p className="compare-legend">Gold marks the leader in each row. Projected stats are per-game averages.</p>
            </>
          ),
        },
        {
          key: "profiles",
          label: "Player Profiles",
          node: (
            <div className="compare-panels" style={{ "--cmp-n": n }}>
              <div className="compare-panel-row">
                {players.map((p) => (
                  <PlayerHeaderPanel key={p.player_name} row={p} />
                ))}
              </div>
              <div className="compare-panel-row">
                {players.map((p) => (
                  <PlayerStatsRow key={p.player_name} row={p} />
                ))}
              </div>
              <div className="compare-panel-row">
                {players.map((p) => (
                  <OutcomeCurvePanel key={p.player_name} row={p} maxSpread={maxSpread} />
                ))}
              </div>
              <div className="compare-panel-row">
                {players.map((p) => (
                  <UsageTdPanel key={p.player_name} row={p} />
                ))}
              </div>
              <div className="compare-panel-row">
                {players.map((p) => (
                  <GameLogPanel key={p.player_name} games={p.recentGames} />
                ))}
              </div>
            </div>
          ),
        },
      ]}
    />
  );
}

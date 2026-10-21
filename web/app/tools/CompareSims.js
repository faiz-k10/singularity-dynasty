import TeamBadge from "./TeamBadge";
import ArchetypePill from "./ArchetypePill";
import STAT_LABELS from "./statLabels";
import { GameLogPanel } from "./WeeklyDetailRow";

// Compare Player Season Simulations: a head-to-head table (role tags, season floor / median / ceiling with the range bar,
// season-to-date pace, and every projected stat as median with its floor-ceiling range), then -- in the page -- the
// percentile shapes and each player's recent games. The leader in each row is marked in gold.

const int = (v) => String(Math.round(v));
const signed1 = (v) => `${v >= 0 ? "+" : ""}${v.toFixed(1)}`;

function bestIndexes(values, best = "high") {
  const have = values.filter((v) => v != null);
  if (have.length < 2) return new Set();
  const target = best === "low" ? Math.min(...have) : Math.max(...have);
  if (have.every((v) => v === target)) return new Set();
  return new Set(values.map((v, i) => (v === target ? i : -1)).filter((i) => i >= 0));
}

function SimRow({ r, players }) {
  return (
    <tr>
      <th>{r.label}</th>
      {r.values.map((v, i) => (
        <td key={players[i].player_name} className={`mono${r.best.has(i) ? " compare-best" : ""}${r.strong ? " compare-strong" : ""}`}>
          {v == null ? "—" : r.fmt(v)}
        </td>
      ))}
    </tr>
  );
}

function GroupRow({ label, n }) {
  return (
    <tr className="compare-group-row">
      <th colSpan={n + 1}>{label}</th>
    </tr>
  );
}

export default function CompareSims({ players, maxCeiling }) {
  const n = players.length;
  const statRows = STAT_LABELS.map(([key, label]) => {
    const ranges = players.map((p) => p.stat_ranges?.[key] || null);
    if (!ranges.some(Boolean)) return null;
    const isPct = key === "target_share";
    const fmt = (v) => (isPct ? `${v.toFixed(1)}%` : int(v));
    return { key, label, ranges, fmt, best: bestIndexes(ranges.map((r) => (r ? r.median : null)), key === "passing_interceptions" ? "low" : "high") };
  }).filter(Boolean);

  const simple = (label, get, fmt, opts = {}) => {
    const values = players.map((p) => {
      const v = get(p);
      return v == null || Number.isNaN(Number(v)) ? null : Number(v);
    });
    if (!values.some((v) => v != null)) return null;
    return { label, values, fmt, best: bestIndexes(values, opts.best), strong: opts.strong };
  };
  const seasonRows = [
    simple("Floor", (p) => p.floor, int),
    simple("Median", (p) => p.median, int, { strong: true }),
    simple("Ceiling", (p) => p.ceiling, int),
  ].filter(Boolean);
  const paceRows = [
    simple("Games played", (p) => (p.gamesPlayed ? p.gamesPlayed : null), int),
    simple("Pts / game", (p) => p.currentPPG, (v) => v.toFixed(1)),
    simple("vs pace (pts)", (p) => (p.gamesPlayed ? p.regressionScore : null), signed1),
    simple("Pace season total", (p) => p.paceSeasonTotal, int),
    simple("Pace percentile", (p) => p.outcomePercentile, (v) => `${Math.round(v)}`),
  ].filter(Boolean);

  return (
    <>
      <div className="compare-table-wrap compare-h2h">
        <table className="compare-table">
          <thead>
            <tr>
              <th></th>
              {players.map((p) => (
                <th key={p.player_name}>
                  <span className="compare-sims-head">
                    {p.headshot && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img className="compare-sims-photo" src={p.headshot} alt="" />
                    )}
                    {p.player_name}
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            <tr>
              <th>Position</th>
              {players.map((p) => (
                <td className="mono" key={p.player_name}>
                  {p.position}
                  {p.positionRank} · <TeamBadge team={p.team} />
                </td>
              ))}
            </tr>
            {players.some((p) => p.archetype || p.sus || p.stage) && (
              <>
                <tr>
                  <th>Role</th>
                  {players.map((p) => (
                    <td key={p.player_name}>{p.archetype ? <ArchetypePill name={p.archetype} compact /> : "—"}</td>
                  ))}
                </tr>
                <tr>
                  <th>Production</th>
                  {players.map((p) => (
                    <td key={p.player_name}>{p.sus ? <ArchetypePill name={p.sus} compact /> : "—"}</td>
                  ))}
                </tr>
                <tr>
                  <th>Career stage</th>
                  {players.map((p) => (
                    <td key={p.player_name}>{p.stage ? <ArchetypePill name={p.stage} compact /> : "—"}</td>
                  ))}
                </tr>
              </>
            )}

            <GroupRow label="Season outlook (fantasy points)" n={n} />
            {seasonRows.map((r) => (
              <SimRow key={r.label} r={r} players={players} />
            ))}
            <tr>
              <th>Range</th>
              {players.map((p) => (
                <td key={p.player_name}>
                  <div className="sim-bar-track">
                    <div
                      className="sim-bar-typical"
                      style={{ left: `${(p.floor / maxCeiling) * 100}%`, width: `${((p.median - p.floor) / maxCeiling) * 100}%` }}
                    ></div>
                    <div
                      className="sim-bar-upside"
                      style={{ left: `${(p.median / maxCeiling) * 100}%`, width: `${((p.ceiling - p.median) / maxCeiling) * 100}%` }}
                    ></div>
                  </div>
                </td>
              ))}
            </tr>

            {paceRows.length > 0 && <GroupRow label="Season to date" n={n} />}
            {paceRows.map((r) => (
              <SimRow key={r.label} r={r} players={players} />
            ))}

            {statRows.length > 0 && <GroupRow label="Projected season stats (median, with floor – ceiling)" n={n} />}
            {statRows.map((s) => (
              <tr key={s.key}>
                <th>{s.label}</th>
                {s.ranges.map((rg, i) => (
                  <td key={players[i].player_name} className={`mono${s.best.has(i) ? " compare-best" : ""}`}>
                    {rg ? (
                      <span className="compare-stat">
                        <strong>{s.fmt(rg.median)}</strong>
                        <span className="compare-stat-range">
                          {s.fmt(rg.floor)} – {s.fmt(rg.ceiling)}
                        </span>
                      </span>
                    ) : (
                      "—"
                    )}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="compare-legend">Gold marks the leader in each row. Season stats are projected totals.</p>

      {players.some((p) => p.recentGames?.length) && (
        <div className="compare-panels" style={{ "--cmp-n": n }}>
          <div className="compare-panel-row">
            {players.map((p) => (
              <GameLogPanel key={p.player_name} games={p.recentGames.map((g) => ({ ...g, position: p.position }))} />
            ))}
          </div>
        </div>
      )}
    </>
  );
}

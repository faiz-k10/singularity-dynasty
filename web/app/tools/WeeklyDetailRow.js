import OutcomeCurveDetail from "./OutcomeCurveDetail";
import TeamBadge from "./TeamBadge";

// Season-level usage/efficiency metrics, not weekly stats -- attached
// server-side in page.js's fetchSimsMetrics()/fetchSeasonXfp() (joined
// in from Player Season Simulations and player_game_log, two separate
// tables from this page's own redraft_rankings). Replaced the raw
// per-game stat columns (Rush Yds, Rec, ...) that used to sit here by
// request -- those are already visible as their own inline table
// columns; these say more about WHY a player is projected where they
// are, purely as isolated context -- none of them feed the projection
// itself (matches player_simulations.wopr/epa's own "display-only"
// treatment, migration 0020, extended by ryoe/scramble_rate/
// play_action_rate in migration 0033). wopr/ryoe are null for anyone but
// RB/QB or RB (respectively -- see each's own model-side comment);
// targetShare/yacAboveExp are WR/TE only; scrambleRate/playActionRate
// are QB only; avgXfp is null until at least one game of this season
// has a published game log row.
const ADVANCED_METRICS = [
  { key: "wopr", label: "WOPR", format: (v) => v.toFixed(2) },
  { key: "targetShare", label: "Target Share", format: (v) => `${v.toFixed(1)}%` },
  { key: "yacAboveExp", label: "YAC Above Exp", format: (v) => v.toFixed(2) },
  { key: "avgXfp", label: "xFP/G (season)", format: (v) => v.toFixed(1) },
  { key: "ryoe", label: "RYOE/Att", format: (v) => `${v >= 0 ? "+" : ""}${v.toFixed(2)}` },
  { key: "scrambleRate", label: "Scramble Rate", format: (v) => `${v.toFixed(1)}%` },
  { key: "playActionRate", label: "Play-Action Rate", format: (v) => `${v.toFixed(1)}%` },
];

function ordinal(n) {
  const rounded = Math.round(n);
  const mod100 = rounded % 100;
  if (mod100 >= 11 && mod100 <= 13) return `${rounded}th`;
  switch (rounded % 10) {
    case 1: return `${rounded}st`;
    case 2: return `${rounded}nd`;
    case 3: return `${rounded}rd`;
    default: return `${rounded}th`;
  }
}

// Same break points/labels as PercentileCard.js's tier() (Player Season
// Simulations) -- kept as its own small copy rather than a shared import
// since the two pages' percentile shapes differ (one value+percentile
// per stat here, vs. floor/median/ceiling triples there); duplicating
// five lines is cheaper than threading a shared dependency between two
// otherwise-unrelated tool pages for this.
function tier(pctile) {
  if (pctile >= 90) return { label: "Elite", cls: "elite" };
  if (pctile >= 70) return { label: "Above Average", cls: "above" };
  if (pctile >= 40) return { label: "Average", cls: "avg" };
  if (pctile >= 15) return { label: "Below Average", cls: "below" };
  return { label: "Weak", cls: "weak" };
}

function formatValue(value) {
  if (value == null) return "—";
  return Number.isInteger(value) ? String(value) : String(Math.round(value * 100) / 100);
}

// One horizontal bar -- reuses the same .pctile-bar/.pctile-bar-fill/
// .pctile-bar-midtick classes Player Season Simulations' PercentileCard
// already styles globally, just with this page's own row shape (label +
// raw value + one percentile, not three). `format` lets a caller override
// the generic integer/2-decimal default -- ADVANCED_METRICS' four rows
// each need their own real-world formatting (a percent sign on Target
// Share, fixed decimal places on WOPR/xFP) rather than one shared rule.
function PctRow({ label, value, pctile, format = formatValue }) {
  if (pctile == null) return null;
  const t = tier(pctile);
  return (
    <div className="weekly-pct-row">
      <span className="weekly-pct-label">{label}</span>
      <span className="weekly-pct-value">{value == null ? "—" : format(value)}</span>
      <div className="pctile-bar">
        <div className={`pctile-bar-fill pctile-bar-${t.cls}`} style={{ width: `${Math.max(pctile, 2)}%` }} />
        <div className="pctile-bar-midtick" />
        <span className="pctile-bar-midtick-label">50</span>
      </div>
      <span className="weekly-pct-ordinal">{ordinal(pctile)}</span>
    </div>
  );
}

// Last 5 logged games (player_game_log, via page.js's fetchGameLogData) --
// rolls back past a season boundary on its own when the current season
// hasn't logged 5 games yet (early in the year, this naturally shows the
// tail of last season instead of coming up empty). No tier/percentile
// here -- unlike everything else in this row, this is just the raw
// record, not a rate stat to rank against a pool.
function GameLogPanel({ games }) {
  if (!games || games.length === 0) return null;
  return (
    <div className="stat-panel weekly-gamelog-panel">
      <div className="weekly-pct-head">
        <span className="pctile-card-title">Recent Games</span>
      </div>
      <div className="weekly-gamelog-rows">
        {games.map((g) => {
          const sep = g.is_home === true ? "vs" : g.is_home === false ? "@" : "·";
          return (
            <div key={`${g.season}-${g.week}`} className="weekly-gamelog-row">
              <span className="weekly-gamelog-week mono">{g.season} Wk{g.week}</span>
              <span className="weekly-gamelog-opp mono">
                {sep} {g.opponent || "—"}
              </span>
              <span className="weekly-gamelog-pts mono">
                {g.fantasy_points_ppr != null ? g.fantasy_points_ppr.toFixed(1) : "—"}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// Opponent-strength context for THIS week's matchup -- matchup_mult is
// already computed and published on every redraft_rankings row
// (compute_matchup_multipliers() in projection_engine.R): the ratio of
// fantasy PPR points that defense allows to this exact position vs. the
// league average at that position, shrunk toward 1.0 for a small
// defensive sample and clamped to [0.90, 1.10]. Shown here as a plain
// +/-% read (positive = softer matchup, allows more than average; green/
// red follow that same "more is good for this offense" direction, not a
// generic up/down). Explicitly NOT folded into the floor/projection/
// ceiling numbers above yet -- APPLY_MATCHUP_MULTIPLIER is off in the
// model while defenses build a real early-season sample, so this caption
// exists to stop that from reading as a bug once someone compares this
// panel's percentage to the numbers elsewhere in the row.
function OpponentPanel({ row }) {
  if (row.matchup_mult == null || !row.opponent) return null;
  const pct = Math.round((row.matchup_mult - 1) * 100);
  const sep = row.is_home === true ? "vs" : row.is_home === false ? "@" : "·";
  return (
    <div className="stat-panel weekly-opp-panel">
      <div className="weekly-pct-head">
        <span className="pctile-card-title">Opponent Defense</span>
      </div>
      <div className="weekly-opp-matchup">
        <TeamBadge team={row.team} />
        <span className="matchup-sep">{sep}</span>
        <TeamBadge team={row.opponent} />
      </div>
      <div className="weekly-opp-stat">
        <span className={`weekly-opp-pct ${pct >= 0 ? "weekly-opp-pct-soft" : "weekly-opp-pct-tough"}`}>
          {pct >= 0 ? "+" : ""}
          {pct}%
        </span>
        <span className="weekly-opp-desc">fantasy points allowed to {row.position} vs. league average</span>
      </div>
      <p className="weekly-opp-caption">
        Not yet factored into the numbers above -- off while defenses build a real early-season sample.
      </p>
    </div>
  );
}

// Row unfolded below a player on Weekly Projection Rankings -- same
// click-to-expand/collapse mechanic as Player Season Simulations'
// StatDetailRow (RankingsTable.js owns the open/close state and single-
// row-open-at-a-time behavior), but built for this page's own data shape:
// single-point weekly stats + one overall floor/median/ceiling, not a
// full per-stat floor/median/ceiling distribution. Four panels: (1) a
// bigger, fully-labeled version of the Curve cell, (2) where this week's
// floor/projection/ceiling AND the season-level usage metrics
// (ADVANCED_METRICS above) actually rank against the same-position pool
// -- the inline heat-tints only show relative color, never the real
// percentile number, (3) the player's actual recent game log, and (4)
// how tough this week's opponent is for this position specifically.
export default function WeeklyDetailRow({ row, colSpan, maxSpread }) {
  const pct = row.statPct || {};
  const advancedEntries = ADVANCED_METRICS.filter((m) => row[m.key] != null && pct[m.key] != null);

  return (
    <tr className="stat-detail-row weekly-detail-row">
      <td colSpan={colSpan}>
        <div className="weekly-detail-grid">
          <div className="stat-panel weekly-detail-curve-panel">
            <OutcomeCurveDetail
              floor={row.floor}
              median={row.projection}
              ceiling={row.ceiling}
              maxSpread={maxSpread}
            />
          </div>
          <div className="stat-panel weekly-detail-pct-panel">
            <div className="weekly-pct-head">
              <span className="pctile-card-title">This week vs. the {row.position} pool</span>
            </div>
            <PctRow label="Floor" value={row.floor} pctile={pct.floor} />
            <PctRow label="Projection" value={row.projection} pctile={pct.projection} />
            <PctRow label="Ceiling" value={row.ceiling} pctile={pct.ceiling} />
            {advancedEntries.length > 0 && (
              <>
                <div className="weekly-pct-divider" />
                {advancedEntries.map((m) => (
                  <PctRow key={m.key} label={m.label} value={row[m.key]} pctile={pct[m.key]} format={m.format} />
                ))}
              </>
            )}
          </div>
          <GameLogPanel games={row.recentGames} />
          <OpponentPanel row={row} />
        </div>
      </td>
    </tr>
  );
}

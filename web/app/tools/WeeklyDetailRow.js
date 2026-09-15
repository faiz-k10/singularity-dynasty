import { useState } from "react";
import OutcomeCurveDetail from "./OutcomeCurveDetail";
import TeamBadge from "./TeamBadge";
import PositionBadge from "./PositionBadge";
import ConfidenceBadge from "./ConfidenceBadge";
import BounceBadge from "./BounceBadge";

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
// are QB only; avgXfp is null until at least one game of THIS season
// has a published game log row -- it's already scoped to the current
// season only (page.js's fetchGameLogData filters on g.season ===
// season before averaging), so at week 2 it's just week 1's own xFP,
// never blended with last season's games even though player_game_log
// itself holds two trailing seasons. Label is just "xFP" -- it's really
// a per-game average (this season's games so far, currently 1 early in
// the year), not literally "per game" in the box-score sense the other
// raw stat columns are, so spelling that out ("xFP/G (this season)")
// read as more machinery than the row needed; the exact scope is in
// this comment for whoever touches the number next, not the UI.
const ADVANCED_METRICS = [
  { key: "wopr", label: "WOPR", format: (v) => v.toFixed(2) },
  { key: "targetShare", label: "Target Share", format: (v) => `${v.toFixed(1)}%` },
  { key: "yacAboveExp", label: "YAC Above Exp", format: (v) => v.toFixed(2) },
  { key: "avgXfp", label: "xFP", format: (v) => v.toFixed(1) },
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
//
// The leading dot reads as "beat expectation" (green) / "missed it"
// (red) / "exact tie" (yellow), not win/loss -- redraft_rankings only
// ever holds the CURRENT week's projections (it's a live snapshot, not
// a historical archive), so there's no stored median projection to
// compare a PAST week's result against. exp_points_ppr (ffopportunity's
// xFP, already fetched per game for the Usage panel's own "xFP" row and
// the same "expected production" baseline My Analysis' points-over-
// expected metric uses) is the closest real substitute this data
// actually supports. A tie gets its own color
// rather than silently counting as a "beat" -- confirmed live (Javonte
// Williams, 2025 Wk17: 11.4 actual vs. 11.4 xFP exactly) that an
// actual-vs-expected match is a real, not-hypothetical case. Dim/
// neutral, not red, for the ~12% of games with no xFP row (see
// CLAUDE.md) -- a missing comparison isn't the same as underperforming.
function GameLogPanel({ games }) {
  if (!games || games.length === 0) return null;
  return (
    <div className="stat-panel weekly-gamelog-panel">
      <div className="weekly-pct-head">
        <span className="weekly-panel-title">Recent Games</span>
      </div>
      <div className="weekly-gamelog-rows">
        {games.map((g) => {
          const sep = g.is_home === true ? "vs" : g.is_home === false ? "@" : "·";
          const hasXfp = g.exp_points_ppr != null && g.fantasy_points_ppr != null;
          const isTie = hasXfp && g.fantasy_points_ppr === g.exp_points_ppr;
          const beatXfp = hasXfp && g.fantasy_points_ppr > g.exp_points_ppr;
          const dotCls = !hasXfp ? "neutral" : isTie ? "tie" : beatXfp ? "above" : "below";
          const dotTitle = hasXfp
            ? `${g.fantasy_points_ppr.toFixed(1)} actual vs. ${g.exp_points_ppr.toFixed(1)} expected (xFP) this game`
            : "No xFP data for this game";
          return (
            <div key={`${g.season}-${g.week}`} className="weekly-gamelog-row">
              <span className="weekly-gamelog-week mono">
                <span className={`weekly-gamelog-dot ${dotCls}`} title={dotTitle} />
                {g.season} W{g.week}
              </span>
              <span className="weekly-gamelog-sep mono">{sep}</span>
              <TeamBadge team={g.opponent} />
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
// model while defenses build a real early-season sample. That caveat,
// and the "fantasy pts allowed to X vs. league avg" description line,
// both used to be permanent on-panel text; both are now on a single
// title tooltip on the panel itself (hover/long-press) instead --
// removed by request to keep the panel to just the badges + number, but
// the explanation isn't gone, just off by default.
const MATCHUP_TOOLTIP = (position) =>
  `Fantasy points allowed to ${position} vs. league average. Not yet factored into the numbers above -- ` +
  `off while defenses build a real early-season sample.`;

function OpponentPanel({ row }) {
  if (row.matchup_mult == null || !row.opponent) return null;
  const pct = Math.round((row.matchup_mult - 1) * 100);
  const sep = row.is_home === true ? "vs" : row.is_home === false ? "@" : "·";
  return (
    <div className="stat-panel weekly-opp-panel" title={MATCHUP_TOOLTIP(row.position)}>
      <div className="weekly-pct-head">
        <span className="weekly-panel-title">Opponent Defense</span>
      </div>
      <div className="weekly-opp-matchup">
        <TeamBadge team={row.team} />
        <span className="matchup-sep">{sep}</span>
        <TeamBadge team={row.opponent} />
      </div>
      <span className={`weekly-opp-pct ${pct >= 0 ? "weekly-opp-pct-soft" : "weekly-opp-pct-tough"}`}>
        {pct >= 0 ? "+" : ""}
        {pct}%
      </span>
    </div>
  );
}

// Sleeper stores height as inches ("71"); duplicated from MyTeamClient.js's
// own copy since that page's bio card and this one otherwise share no
// code -- five lines isn't worth threading a shared import for.
function formatHeight(h) {
  if (h == null || h === "") return null;
  const str = String(h);
  if (str.includes("'")) return str;
  const n = parseInt(str, 10);
  if (!Number.isFinite(n) || n <= 0) return null;
  return `${Math.floor(n / 12)}'${n % 12}"`;
}

const TREND_COPY = {
  RISING: { cls: "up", arrow: "▲", label: "Rising" },
  FALLING: { cls: "down", arrow: "▼", label: "Falling" },
  STEADY: { cls: "steady", arrow: "—", label: "Steady" },
};

// Tap-to-reveal, not hover-only -- the badges themselves are already
// self-explanatory via a `title` tooltip on desktop, but that's invisible
// on a touch device with no hover state. Click/tap slides a plain 1-2
// word answer out to the right instead, closed by tapping the badge
// again. One open flag per badge (not shared across the row) so opening
// the trend badge doesn't collapse the confidence star, etc.
function ExpandableBadge({ variant, label, children }) {
  const [open, setOpen] = useState(false);
  return (
    <span
      className={`weekly-achievement-badge ${variant}${open ? " open" : ""}`}
      onClick={() => setOpen((v) => !v)}
      role="button"
      tabIndex={0}
      aria-expanded={open}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          setOpen((v) => !v);
        }
      }}
    >
      {children}
      <span className="weekly-achievement-label">{label}</span>
    </span>
  );
}

// Plain colored medallion + an emoji glyph -- unlike the other three
// achievement badges (Confidence/Bounce/Trend), these four have no
// existing icon component of their own, and an emoji reads as more of a
// game-medal than a stroked SVG would at this size.
function GlyphBadge({ variant, glyph, title }) {
  return (
    <span className={`weekly-glyph-badge ${variant}`} title={title}>
      {glyph}
    </span>
  );
}

// "Heating Up" / "On Ice" -- the last 3 logged games (recentGames is
// already ordered most-recent-first by page.js's fetchGameLogData) all
// beating, or all missing, their own game's xFP. Same beat/below
// comparison GameLogPanel's dot already makes per game, just requiring
// all 3 to agree before calling it a real streak rather than reading one
// good or bad week as a trend. Any of the 3 missing an xFP row (~12% of
// games, see CLAUDE.md) voids the streak rather than skipping past it --
// a 2-game streak isn't the 3-game one this badge promises.
function xfpStreak(games) {
  if (!games || games.length < 3) return null;
  const last3 = games.slice(0, 3);
  if (last3.some((g) => g.exp_points_ppr == null || g.fantasy_points_ppr == null)) return null;
  if (last3.every((g) => g.fantasy_points_ppr > g.exp_points_ppr)) return "heating";
  if (last3.every((g) => g.fantasy_points_ppr < g.exp_points_ppr)) return "cold";
  return null;
}

// "Risky Icarus" / "Steady Eddy" -- this week's own floor-ceiling spread
// relative to maxSpread, the same widest-range-in-the-pool value the
// Curve cell/panel is already drawn against, so "wide"/"tight" means
// relative to this week's real pool rather than an arbitrary point
// count. Thresholds are round numbers, not fit to any backtest -- there
// was no existing "volatile" label anywhere in the model to match.
const VOLATILE_SPREAD_RATIO = 0.75;
const LOCKED_SPREAD_RATIO = 0.35;
function spreadFlag(floor, ceiling, maxSpread) {
  if (floor == null || ceiling == null || !maxSpread) return null;
  const ratio = (ceiling - floor) / maxSpread;
  if (ratio >= VOLATILE_SPREAD_RATIO) return "volatile";
  if (ratio <= LOCKED_SPREAD_RATIO) return "locked";
  return null;
}

// Full-width identity strip along the top of the expanded row -- name,
// headshot, and physical size on the left (bio is Sleeper's public player
// dictionary, joined server-side in page.js's fetchPlayerBios() by
// normalized name; null for anyone not in Sleeper's dict, which the
// layout just renders around rather than erroring on), then three quick-
// read stats on the right: this week's positional rank, this week's own
// median projection, and last week's actual positional finish
// (lastWeekRank, from fetchGameLogData -- null before the season's first
// game log exists). RISING/FALLING/STEADY moved into the badge row next
// to the name (see weekly-player-achievements below) instead of sitting
// here as a fourth stat.
function PlayerHeaderPanel({ row, maxSpread }) {
  const bio = row.bio || {};
  const ht = formatHeight(bio.height);
  const sizeText = [ht, bio.weight ? `${bio.weight} lbs` : null].filter(Boolean).join(" · ");
  const trend = TREND_COPY[row.trend];
  const lastWeek = row.lastWeekRank;

  const isEstablished = row.sample_confidence === "established";
  const isBuilding = row.sample_confidence === "building";
  const hasBounceNote = typeof row.notes === "string" && row.notes.startsWith("BOUNCEBACK");
  const streak = xfpStreak(row.recentGames);
  const spread = spreadFlag(row.floor, row.ceiling, maxSpread);

  const achievements = [
    (isEstablished || isBuilding) && {
      key: "confidence",
      variant: isEstablished ? "gold" : "silver",
      label: isEstablished ? "Established" : "Building",
      node: <ConfidenceBadge confidence={row.sample_confidence} />,
    },
    hasBounceNote && {
      key: "bounce",
      variant: "blue",
      label: "Bounce-back",
      node: <BounceBadge note={row.notes} />,
    },
    trend && {
      key: "trend",
      variant: trend.cls,
      label: trend.label,
      node: (
        <span className={`weekly-trend-badge ${trend.cls}`} title={`Trend: ${row.trend}`}>
          {trend.arrow}
        </span>
      ),
    },
    streak === "heating" && {
      key: "heating",
      variant: "heat",
      label: "Heating Up",
      node: <GlyphBadge variant="heat" glyph="🔥" title="Beat xFP in each of the last 3 games" />,
    },
    streak === "cold" && {
      key: "cold",
      variant: "ice",
      label: "On Ice",
      node: <GlyphBadge variant="ice" glyph="🧊" title="Missed xFP in each of the last 3 games" />,
    },
    spread === "volatile" && {
      key: "volatile",
      variant: "icarus",
      label: "Risky Icarus",
      node: (
        <GlyphBadge
          variant="icarus"
          glyph="🎲"
          title="Wide floor-to-ceiling range this week -- boom-or-bust"
        />
      ),
    },
    spread === "locked" && {
      key: "locked",
      variant: "eddy",
      label: "Steady Eddy",
      node: (
        <GlyphBadge
          variant="eddy"
          glyph="🔒"
          title="Tight floor-to-ceiling range this week -- a safe, predictable floor"
        />
      ),
    },
  ].filter(Boolean);

  return (
    <div className="stat-panel weekly-player-header">
      <div className="weekly-player-id">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          key={bio.sleeperId || row.player_name}
          className="weekly-player-photo"
          src={bio.sleeperId ? `https://sleepercdn.com/content/nfl/players/thumb/${bio.sleeperId}.jpg` : ""}
          alt=""
          onError={(e) => {
            e.currentTarget.style.display = "none";
          }}
        />
        <div className="weekly-player-idtext">
          <span className="weekly-player-name">{row.player_name}</span>
          <div className="weekly-player-badges">
            <PositionBadge position={row.position} />
            <TeamBadge team={row.team} />
            {sizeText && <span className="weekly-player-size mono">{sizeText}</span>}
            {/* Confidence/bounce-back flags plus the RISING/FALLING/STEADY
                trend, all as one row of flat-fill "achievement" pills --
                these used to be plain glyphs next to the name in the
                collapsed table row, but that duplicated the same info
                twice (dense table cell AND this banner) for no reason;
                this banner has the room to be the one place they live.
                Each is click/tap-to-reveal its own 1-2 word label via
                ExpandableBadge, not just a hover title. */}
            <span className="weekly-player-achievements">
              {achievements.map((a) => (
                <ExpandableBadge key={a.key} variant={a.variant} label={a.label}>
                  {a.node}
                </ExpandableBadge>
              ))}
            </span>
          </div>
        </div>
      </div>
      <div className="weekly-player-stats">
        <div className="weekly-player-stat">
          <span className="weekly-player-stat-label">This Week (Projected)</span>
          <span className="weekly-player-stat-value">{row.positionLabel || "—"}</span>
        </div>
        <div className="weekly-player-stat">
          <span className="weekly-player-stat-label">Median Proj</span>
          <span className="weekly-player-stat-value">{row.projection != null ? row.projection.toFixed(1) : "—"}</span>
        </div>
        <div className="weekly-player-stat">
          <span className="weekly-player-stat-label">Last Week (Finish)</span>
          <span className="weekly-player-stat-value">{lastWeek ? `${row.position}${lastWeek.rank}` : "—"}</span>
        </div>
      </div>
    </div>
  );
}

// Row unfolded below a player on Weekly Projection Rankings -- same
// click-to-expand/collapse mechanic as Player Season Simulations'
// StatDetailRow (RankingsTable.js owns the open/close state and single-
// row-open-at-a-time behavior), but built for this page's own data shape:
// single-point weekly stats + one overall floor/median/ceiling, not a
// full per-stat floor/median/ceiling distribution. A full-width
// PlayerHeaderPanel identity strip sits on top (name/photo/size on the
// left, this-week rank / median projection / last-week finish / trend
// on the right), then four panels across three columns below it: (1) a
// bigger, fully-labeled version of the Curve cell -- each of its own
// three labels (Floor/Median/Ceiling) carries its percentile-vs-pool
// ordinal directly, so that number only has to be shown once, (2) the
// season-level usage metrics (ADVANCED_METRICS above) ranked against the
// same-position pool, and (3+4) Opponent Defense stacked directly above
// Recent Games in one narrow shared column (.weekly-detail-side-col) --
// both are compact/badge-driven, so pairing them vertically instead of
// giving each its own full-width slot keeps the row from running wider
// than it needs to.
export default function WeeklyDetailRow({ row, colSpan, maxSpread }) {
  const pct = row.statPct || {};
  const advancedEntries = ADVANCED_METRICS.filter((m) => row[m.key] != null && pct[m.key] != null);

  return (
    <tr className="stat-detail-row weekly-detail-row">
      <td colSpan={colSpan}>
        <div className="weekly-detail-wrap">
          <PlayerHeaderPanel row={row} maxSpread={maxSpread} />
          <div className="weekly-detail-grid">
            <div className="stat-panel weekly-detail-curve-panel">
              <div className="weekly-pct-head">
                <span className="weekly-panel-title">Outcome Curve</span>
              </div>
              <div className="weekly-panel-body">
                <OutcomeCurveDetail
                  floor={row.floor}
                  median={row.projection}
                  ceiling={row.ceiling}
                  maxSpread={maxSpread}
                  floorPct={pct.floor}
                  medianPct={pct.projection}
                  ceilingPct={pct.ceiling}
                />
              </div>
            </div>
            <div className="stat-panel weekly-detail-pct-panel">
              <div className="weekly-pct-head">
                <span className="weekly-panel-title">Usage vs. the {row.position} pool</span>
              </div>
              <div className="weekly-panel-body">
                {advancedEntries.length > 0 ? (
                  advancedEntries.map((m) => (
                    <PctRow key={m.key} label={m.label} value={row[m.key]} pctile={pct[m.key]} format={m.format} />
                  ))
                ) : (
                  <p className="weekly-opp-caption">No usage metrics published for this player yet.</p>
                )}
              </div>
            </div>
            <div className="weekly-detail-side-col">
              <OpponentPanel row={row} />
              <GameLogPanel games={row.recentGames} />
            </div>
          </div>
        </div>
      </td>
    </tr>
  );
}

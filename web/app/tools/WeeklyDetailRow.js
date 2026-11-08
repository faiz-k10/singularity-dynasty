"use client";

import { useState } from "react";
import OutcomeCurveDetail from "./OutcomeCurveDetail";
import TeamBadge from "./TeamBadge";
import { filledBadgeSvg } from "@/lib/badgeIcons";
import { isBye, BYE_LABEL } from "@/lib/bye";
import PositionBadge from "./PositionBadge";
import ConfidenceBadge from "./ConfidenceBadge";
import { getAchievements } from "./achievements";
import DragonBall from "./DragonBall";
import FitBox from "./FitBox";
import { MyStrip, MyEmpty } from "./MyPlayers";
import { PANEL_KEYS } from "@/lib/statPanel";
import { ageOn, formatHeight } from "@/lib/format";
import { PROFILE_METRICS as METRICS } from "@/lib/statMetrics";
import Define from "../Define";
import ShareCardButton from "../ShareCardButton";

// ROLE = how the offense uses him; PLAYER = what he does with it (which numbers go where: lib/statPanel.js, which also ranks players by group).
// A number he doesn't have (below the volume gate, or not published) is just left out.
const PANEL = PANEL_KEYS;

// One line of the touchdown profile / usage panel: the metric, its value, and where he ranks at his position (#1 = highest).
function RankRow({ k, label, value, format, rank, unrankedHint }) {
  if (!rank && !unrankedHint) return null;
  return (
    <div className="weekly-rank-row" role="row">
      <span className="weekly-rank-label" role="rowheader">
        <Define term={k}>{label}</Define>
      </span>
      {rank ? (
        // The number, then a bar that shows the same rank: full for #1, empty for last at his position.
        <span className="weekly-rank-cell" role="cell">
          <span className="weekly-rank-n">#{rank.rank}</span>
          <span className="weekly-rank-bar">
            <span style={{ width: `${rank.of > 1 ? ((rank.of - rank.rank) / (rank.of - 1)) * 100 : 100}%` }} />
          </span>
        </span>
      ) : (
        <span className="weekly-rank-cell" role="cell">
          <span className="weekly-rank-n">—</span>
          <span className="weekly-rank-bar is-none" />
        </span>
      )}
      <span className="weekly-pct-value" role="cell">{value == null ? "—" : format(value)}</span>
    </div>
  );
}

// The rows of the usage panel: metric | rank (number + bar) | value. No column header row (removed on request, Oct 24 2026).
function RankTable({ children }) {
  return (
    <div className="weekly-rank-table" role="table">
      {children}
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
export function GameLogPanel({ games: all }) {
  // This season's games only (the list is newest first).
  const games = all ? all.filter((g) => g.season === all[0].season) : all;
  const [open, setOpen] = useState(() => new Set());
  // Each game's box score (the same ESPN numbers the Game Board shows), fetched the first time its row opens: key -> "loading" | chips[].
  const [boxes, setBoxes] = useState({});
  if (!games || games.length === 0) return null;
  const toggle = (g, key) => {
    setOpen((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
    if (boxes[key] !== undefined) return;
    setBoxes((b) => ({ ...b, [key]: "loading" }));
    const qs = new URLSearchParams({ season: g.season, week: g.week, team: g.team, name: g.player_name || g.name || "", pos: g.position || "" });
    fetch(`/api/game-box?${qs}`)
      .then((r) => r.json())
      .then((j) => setBoxes((b) => ({ ...b, [key]: Array.isArray(j.chips) ? j.chips : [] })))
      .catch(() => setBoxes((b) => ({ ...b, [key]: [] })));
  };
  // One scale for the whole list so bars and xFP dashes compare across games.
  const scaleMax = Math.max(10, ...games.map((g) => Math.max(g.fantasy_points_ppr ?? 0, g.exp_points_ppr ?? 0))) * 1.05;
  return (
    <div className="stat-panel weekly-gamelog-panel">
      <div className="weekly-pct-head">
        <span className="weekly-panel-title">{games[0].season} Games</span>
      </div>
      <div className="weekly-gamelog-rows">
        {games.map((g) => {
          const key = `${g.season}-${g.week}`;
          const sep = g.is_home === true ? "vs" : g.is_home === false ? "@" : "·";
          const pts = g.fantasy_points_ppr;
          const hasXfp = g.exp_points_ppr != null && pts != null;
          const dotCls = !hasXfp ? "neutral" : pts === g.exp_points_ppr ? "tie" : pts > g.exp_points_ppr ? "above" : "below";
          const pct = (v) => `${Math.min(100, Math.max(0, (v / scaleMax) * 100)).toFixed(1)}%`;
          const canOpen = !!(g.team && g.position && (g.player_name || g.name) && pts != null);
          const isOpen = canOpen && open.has(key);
          const box = boxes[key];
          return (
            <div key={key} className={`weekly-gamelog-item${isOpen ? " is-open" : ""}`}>
              <div
                className={`weekly-gamelog-row${canOpen ? " is-clickable" : ""}`}
                role={canOpen ? "button" : undefined}
                tabIndex={canOpen ? 0 : undefined}
                aria-expanded={canOpen ? isOpen : undefined}
                onClick={canOpen ? () => toggle(g, key) : undefined}
                onKeyDown={
                  canOpen
                    ? (e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          toggle(g, key);
                        }
                      }
                    : undefined
                }
              >
                <span className="weekly-gamelog-week mono">W{g.week}</span>
                {/* vs / @ and the opponent */}
                <span className="weekly-gamelog-opp">
                  <span className="weekly-gamelog-sep mono">{sep}</span>
                  <TeamBadge team={g.opponent} />
                </span>
                {/* his points as a bar (mint = beat his expected points, red = fell short), a dash where his expected points (xFP) were */}
                <span className="weekly-gamelog-bar" aria-label={hasXfp ? `${pts.toFixed(1)} points, ${g.exp_points_ppr.toFixed(1)} expected` : undefined}>
                  {pts != null && <em className={dotCls} style={{ width: pct(pts) }} />}
                  {hasXfp && <u style={{ left: pct(g.exp_points_ppr) }} title={`xFP ${Number(g.exp_points_ppr).toFixed(1)}`} />}
                </span>
                <span className="weekly-gamelog-pts mono">{pts != null ? pts.toFixed(1) : "—"}</span>
                <span className="weekly-gamelog-rank mono">{g.posRank != null ? `${g.position}${g.posRank}` : "—"}</span>
              </div>
              {canOpen && (
                <div className="weekly-gamelog-more" aria-hidden={!isOpen}>
                  <div className="weekly-gamelog-more-inner" style={{ "--cols": Array.isArray(box) ? (box.length >= 7 || box.length === 4 ? 4 : Math.min(3, box.length)) : 1 }}>
                    {box === "loading" || box === undefined ? (
                      <span className="weekly-gamelog-note mono">Loading box score…</span>
                    ) : box.length === 0 ? (
                      <span className="weekly-gamelog-note mono">No box score available for this game.</span>
                    ) : (
                      box.map((c) => (
                        <span key={c.label} className="weekly-gamelog-chip">
                          <b className="mono">{c.value}</b>
                          <small className="mono">{c.label}</small>
                        </span>
                      ))
                    )}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// Tap-to-reveal, not hover-only -- the badges themselves are already
// self-explanatory via a `title` tooltip on desktop, but that's invisible
// on a touch device with no hover state. Click/tap slides a plain 1-2
// word answer out to the right instead, closed by tapping the badge
// again. One open flag per badge (not shared across the row) so opening
// one badge doesn't collapse another, e.g. the confidence star.
// `open` / `onToggle` come from the badge row, which keeps only one label open at a time (founder, Nov 8 2026).
function ExpandableBadge({ variant, label, children, open, onToggle }) {
  return (
    <span
      className={`weekly-achievement-badge ${variant}${open ? " open" : ""}`}
      onClick={onToggle}
      role="button"
      tabIndex={0}
      aria-expanded={open}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onToggle();
        }
      }}
    >
      {children}
      <span className="weekly-achievement-label">{label}</span>
    </span>
  );
}

// Plain colored medallion + a glyph -- unlike Confidence (its own
// ConfidenceBadge component), every other achievement flag renders
// through this one shared shell instead of having its own component.
// A badge glyph from the shared set (lib/badgeIcons.js); display:contents so the <svg> itself is the badge's child for sizing.
function BadgeIcon({ k }) {
  return <span className="badge-icon" aria-hidden="true" dangerouslySetInnerHTML={{ __html: filledBadgeSvg(k) }} />;
}

function GlyphBadge({ variant, glyph }) {
  return (
    <span className={`weekly-glyph-badge ${variant}`}>
      {glyph}
    </span>
  );
}








// Matchup badge's icon -- the same solid triangle as the ▲ / ▼ beside the opponent in the table (up = smash spot,
// down = tough spot), so the badge and the mark read as one thing.
function MatchupIcon({ up }) {
  return (
    <svg viewBox="-2.4 -2.4 28.8 28.8" fill="currentColor" aria-hidden="true">
      <path d={up ? "M12 4 19 11.5h-4.5V20h-5v-8.5H5Z" : "M12 20 19 12.5h-4.5V4h-5v8.5H5Z"} />
    </svg>
  );
}

function achievementNode(a, row) {
  switch (a.key) {
    case "eliteRole":
      return <GlyphBadge variant="eliteRole" glyph={<BadgeIcon k="eliteRole" />} />;
    case "elitePlayer":
      return <GlyphBadge variant="elitePlayer" glyph={<BadgeIcon k="elitePlayer" />} />;
    case "plusValue":
      return <GlyphBadge variant="plusValue" glyph={<BadgeIcon k="plusValue" />} />;
    case "minusValue":
      return <GlyphBadge variant="minusValue" glyph={<BadgeIcon k="minusValue" />} />;
    case "solidFloor":
      return <GlyphBadge variant="boulder" glyph={<BadgeIcon k="solidFloor" />} />;
    case "highCeiling":
      return <GlyphBadge variant="cloud" glyph={<BadgeIcon k="highCeiling" />} />;
    case "rookie":
      return <GlyphBadge variant="rookie" glyph={<BadgeIcon k="rookie" />} />;
    case "confidence":
      return <ConfidenceBadge confidence={row.sample_confidence} filled />;
    case "onFire":
      return (
        <GlyphBadge
          variant="heat"
          glyph={<BadgeIcon k="onFire" />}
        />
      );
    case "onIce":
      return (
        <GlyphBadge
          variant="ice"
          glyph={<BadgeIcon k="onIce" />}
        />
      );
    case "volatile":
      return (
        <GlyphBadge
          variant="icarus"
          glyph={<BadgeIcon k="volatile" />}
        />
      );
    case "locked":
      return (
        <GlyphBadge
          variant="eddy"
          glyph={<BadgeIcon k="locked" />}
        />
      );
    case "hero":
      return <GlyphBadge variant="ball" glyph={<DragonBall stars={a.tier} />} />;
    case "buyLow":
      return (
        <GlyphBadge
          variant="sprout"
          glyph={<BadgeIcon k="buyLow" />}
        />
      );
    case "matchup":
      return (
        <GlyphBadge
          variant={a.variant}
          glyph={<MatchupIcon up={a.variant === "smash"} />}
        />
      );
    case "sellHigh":
      return (
        <GlyphBadge
          variant="peak"
          glyph={<BadgeIcon k="sellHigh" />}
        />
      );
    case "honorable":
      return (
        <GlyphBadge
          variant="honorable"
          glyph={<BadgeIcon k="honorable" />}
        />
      );
    case "conArtist":
      return (
        <GlyphBadge
          variant="menace"
          glyph={<BadgeIcon k="conArtist" />}
        />
      );
    default:
      return null;
  }
}

// Full-width identity strip along the top of the expanded row -- name,
// headshot, and physical size on the left (bio is Sleeper's public player
// dictionary, joined server-side in page.js's fetchPlayerBios() by
// normalized name; null for anyone not in Sleeper's dict, which the
// layout just renders around rather than erroring on), then three quick-
// read stats on the right: this week's positional rank, this week's own
// median projection, and last week's actual positional finish
// (lastWeekRank, from fetchGameLogData -- null before the season's first
// game log exists).
// Two small panels above the Outcome Curve: THIS WEEK on the left (projected position rank and median -- emphasised with a gold accent, larger
// numbers and a glow, because it is the number the page is about) and LAST WEEK on the right (his output and position finish --
// muted, it is history). Moved out of the identity strip by request.
export function PlayerStatsRow({ row }) {
  const lastWeek = row.lastWeekRank;
  const bye = isBye(row.opponent);
  return (
    <div className="weekly-stats-split">
      <FitBox className="stat-panel weekly-stats-next">
        <span className="weekly-stats-eyebrow weekly-stats-eyebrow-next" data-fit>
          This week{!bye && ` · ${row.playedThisWeek != null ? "Played" : "Projected"}`}
          {row.opponent && !isBye(row.opponent) && (
            <span className="weekly-stats-opp">
              {row.is_home === true ? "vs" : row.is_home === false ? "@" : null}
              <TeamBadge team={row.opponent} />
            </span>
          )}
          {row.opponent && isBye(row.opponent) && <span className="weekly-stats-opp">· {BYE_LABEL}</span>}
        </span>
        <div className="weekly-stats-pair">
          <div className="weekly-stats-item" data-fit>
            <span className="weekly-player-stat-label">Position rank</span>
            <span className="weekly-stats-value-big weekly-stats-value-gold">{bye ? "—" : row.positionLabel || "—"}</span>
          </div>
          {/* A player who has played this week shows his ACTUAL points here instead of the median projection. */}
          <div className="weekly-stats-item" data-fit>
            <span className="weekly-player-stat-label">{!bye && row.playedThisWeek != null ? "Actual" : "Median proj"}</span>
            <span className="weekly-stats-value-big">
              {bye ? "—" : row.playedThisWeek != null ? row.playedThisWeek.toFixed(1) : row.projection != null ? row.projection.toFixed(1) : "—"}
            </span>
          </div>
        </div>
      </FitBox>
      <FitBox className="stat-panel weekly-stats-last">
        <span className="weekly-stats-eyebrow" data-fit>Last week{lastWeek ? ` · W${lastWeek.week}` : ""}</span>
        <div className="weekly-stats-pair">
          <div className="weekly-stats-item" data-fit>
            <span className="weekly-player-stat-label">Finish</span>
            <span className="weekly-stats-value-dim">{lastWeek ? `${row.position}${lastWeek.rank}` : "—"}</span>
          </div>
          <div className="weekly-stats-item" data-fit>
            <span className="weekly-player-stat-label">Output</span>
            <span className="weekly-stats-value-dim">{lastWeek?.points != null ? lastWeek.points.toFixed(1) : "—"}</span>
          </div>
        </div>
      </FitBox>
    </div>
  );
}

// `share`: a Share button for his card (the opened row on Weekly Projection Rankings; not on the compare page).
// `logoByName`: the team logo sits right after the name instead of in the line under it (the Head to Head cards).
export function PlayerHeaderPanel({ row, share = false, logoByName = false }) {
  const [openBadge, setOpenBadge] = useState(null); // the one badge whose label is showing
  const bio = row.bio || {};
  const ht = formatHeight(bio.height);
  const age = ageOn(bio.birthDate);
  const sizeText = [ht, bio.weight ? `${bio.weight} lbs` : null, age ? `${age} yrs` : null].filter(Boolean).join(" · ");

  // getAchievements (achievements.js) is the one source of truth for
  // which flags apply -- RankingsTable's collapsed-row dot preview calls
  // the exact same function. This just attaches the full icon component
  // each flag renders as here, which the dot preview has no use for.
  const achievements = getAchievements(row).map((a) => ({ ...a, node: achievementNode(a, row) }));

  // Confidence / streak / spread flags as one row of flat-fill pills, each click / tap-to-reveal its own 1-2 word label via ExpandableBadge. They
  // sit beside the name in the opened player's header (share) and on the identity line in the compare profiles.
  const achievementPills = (
    <span className="weekly-player-achievements">
      {achievements.map((a) => (
        <ExpandableBadge key={a.key} variant={a.variant} label={a.label} open={openBadge === a.key} onToggle={() => setOpenBadge((k) => (k === a.key ? null : a.key))}>
          {a.node}
        </ExpandableBadge>
      ))}
    </span>
  );

  const photo = (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      key={bio.headshot || row.player_name}
      className="weekly-player-photo"
      src={bio.headshot || ""}
      alt=""
      onError={(e) => {
        e.currentTarget.style.display = "none";
      }}
    />
  );

  return (
    <div className="stat-panel weekly-player-header">
      <div className="weekly-player-id">
        {share && photo}
        <div className="weekly-player-idtext">
          {/* Compare profiles keep the small photo beside the name; the opened player (share) has it as a full-height column of its own. */}
          <span className={`weekly-player-namewrap${share ? " has-pills" : ""}`}>
            {!share && photo}
            <span className="weekly-player-name">{row.player_name}</span>
            {logoByName && <TeamBadge team={row.team} />}
            {share && achievementPills}
          </span>
          <div className="weekly-player-badges">
            <PositionBadge position={row.position} />
            {!logoByName && <TeamBadge team={row.team} />}
            {sizeText && (
              <span className="weekly-player-size mono">
                {sizeText}
                {!share && <span className="weekly-player-dot">{achievements.length > 0 ? " ·" : ""}</span>}
              </span>
            )}
            {!share && achievementPills}
          </div>
        </div>
      </div>
      {share && (
        <ShareCardButton
          card={{ kind: "p", name: row.player_name, pos: row.position }}
          caption={`${row.player_name} this week: ${isBye(row.opponent) ? "on a bye" : `${row.projection?.toFixed(1)} median, ${row.floor?.toFixed(1)} to ${row.ceiling?.toFixed(1)} range`}.`}
          file={`singularity-${row.player_name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`}
          className="lab-copy weekly-player-share"
        />
      )}
    </div>
  );
}

// The Outcome Curve panel (floor / median / ceiling with each one's percentile vs the pool) -- shared by the opened
// player row and the Compare Players tool.
export function OutcomeCurvePanel({ row, maxSpread }) {
  const pct = row.statPct || {};
  // No range to draw: his team is on its bye, or he is projected for zero (listed out) -- say why instead of leaving the panel blank.
  const bye = isBye(row.opponent);
  if (bye || (row.projection != null && row.projection <= 0)) {
    return (
      <div className="stat-panel weekly-detail-curve-panel">
        <div className="weekly-pct-head">
          <span className="weekly-panel-title">Outcome Curve</span>
        </div>
        <div className="weekly-panel-body">
          <p className="weekly-opp-caption">
            {bye
              ? `${row.team} is on its bye this week, so there is no projected range. He is back in next week's rankings.`
              : "He is listed out this week, so there is no projected range."}
          </p>
        </div>
      </div>
    );
  }
  return (
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
  );
}

// Touchdown profile (WR/TE) or usage (RB/QB) ranked against the same-position pool.
export function UsageTdPanel({ row }) {
  const groups = PANEL[row.position] || { role: [], player: [] };
  const entries = (keys) =>
    keys.map((k) => ({ k, ...METRICS[k] })).filter((m) => row[m.k] != null && (row.metricRank?.[m.k] || m.unrankedHint));
  const sections = [["Player", entries(groups.player)], ["Role", entries(groups.role)]].filter(([, list]) => list.length); // Player first, then Role (Oct 24 2026)
  return (
    <div className="stat-panel weekly-detail-pct-panel">
      <div className="weekly-pct-head">
        <span className="weekly-panel-title">Stats vs. the {row.position} pool</span>
      </div>
      <div className="weekly-panel-body">
        {sections.length > 0 ? (
          <RankTable>
            {sections.map(([name, list]) => (
              <div key={name} className="weekly-rank-group" role="rowgroup">
                <div className="weekly-rank-section" role="row">
                  <span>{name}</span>
                  <span
                    className="weekly-rank-avg"
                  >
                    #{row.groupRank?.[name.toLowerCase()]?.rank ?? "-"}
                  </span>
                </div>
                {list.map((m) => (
                  <RankRow key={m.k} k={m.k} label={m.label} value={row[m.k]} format={m.format} rank={row.metricRank?.[m.k]} unrankedHint={m.unrankedHint} />
                ))}
              </div>
            ))}
          </RankTable>
        ) : (
          <p className="weekly-opp-caption">No usage numbers for this player yet.</p>
        )}
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
// left, this-week rank / median projection / last-week finish on the
// right), then four panels across three columns below it: (1) a
// bigger, fully-labeled version of the Curve cell -- each of its own
// three labels (Floor/Median/Ceiling) carries its percentile-vs-pool
// ordinal directly, so that number only has to be shown once, (2) the
// season-level usage metrics (ADVANCED_METRICS above) ranked against the
// same-position pool, and (3+4) Opponent Defense stacked directly above
// Recent Games in one narrow shared column (.weekly-detail-side-col) --
// both are compact/badge-driven, so pairing them vertically instead of
// giving each its own full-width slot keeps the row from running wider
// than it needs to.
export default function WeeklyDetailRow({ row, colSpan, maxSpread, owned, mineStatus }) {
  // Left: This week / Last week, then the "Your player" panel and the Outcome Curve; middle: Recent Games on its own; right: the usage /
  // touchdown profile (founder, Oct 29 2026: Recent Games swapped places with Your player + Outcome Curve). Without a "Your player"
  // panel the left column is just the boxes and the curve.
  const mine = (owned || mineStatus) && (
    <div className="stat-panel weekly-detail-mine-panel">
      {owned ? <MyStrip owned={owned} vertical /> : <MyEmpty status={mineStatus} />}
    </div>
  );
  return (
    <tr className="stat-detail-row weekly-detail-row">
      <td colSpan={colSpan}>
        <div className="weekly-detail-wrap">
          <PlayerHeaderPanel row={row} share />
          <div className="weekly-detail-grid">
            <div className="weekly-detail-col weekly-detail-col-left">
              <PlayerStatsRow row={row} />
              {mine}
              <OutcomeCurvePanel row={row} maxSpread={maxSpread} />
            </div>
            <div className="weekly-detail-col weekly-detail-col-mid">
              <GameLogPanel games={row.recentGames} />
            </div>
            <div className="weekly-detail-col weekly-detail-col-right">
              <UsageTdPanel row={row} />
            </div>
          </div>
        </div>
      </td>
    </tr>
  );
}

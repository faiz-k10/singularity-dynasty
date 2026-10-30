"use client";

import { Fragment, useState } from "react";
import OutcomeCurveDetail from "./OutcomeCurveDetail";
import TeamBadge from "./TeamBadge";
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

// ROLE = how the offense uses him; PLAYER = what he does with it (which numbers go where: lib/statPanel.js, which also ranks players by group).
// A number he doesn't have (below the volume gate, or not published) is just left out.
const PANEL = PANEL_KEYS;

// One line of the touchdown profile / usage panel: the metric, its value, and where he ranks at his position (#1 = highest).
function RankRow({ label, value, format, rank, unrankedHint }) {
  if (!rank && !unrankedHint) return null;
  return (
    <div className="weekly-rank-row" role="row">
      <span className="weekly-rank-label" role="rowheader">{label}</span>
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
export function GameLogPanel({ games }) {
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
          return (
            <div key={`${g.season}-${g.week}`} className="weekly-gamelog-row">
              <span className="weekly-gamelog-week mono">
                <span className={`weekly-gamelog-dot ${dotCls}`} />
                {g.season} W{g.week}
              </span>
              {/* the team he played FOR that game (players change teams), then vs / @ and the opponent */}
              {g.team ? <TeamBadge team={g.team} /> : <span />}
              <span className="weekly-gamelog-sep mono">{sep}</span>
              <TeamBadge team={g.opponent} />
              <span className="weekly-gamelog-pts mono">
                {g.fantasy_points_ppr != null ? g.fantasy_points_ppr.toFixed(1) : "—"}
              </span>
              <span
                className="weekly-gamelog-rank mono"
              >
                {g.posRank != null ? `${g.position}${g.posRank}` : "—"}
              </span>
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

// Plain colored medallion + a glyph -- unlike Confidence (its own
// ConfidenceBadge component), every other achievement flag renders
// through this one shared shell instead of having its own component.
function GlyphBadge({ variant, glyph }) {
  return (
    <span className={`weekly-glyph-badge ${variant}`}>
      {glyph}
    </span>
  );
}

// Risky Icarus's own icon -- a dice glyph read as generic "randomness"
// clip art, out of step with every other icon on the site (all either a
// flat glyph/team-color pill or something drawn from the site's own
// starfield/void motif). A first pass paired the stars with a crescent
// moon, but the moon was the wrong image for what this badge means --
// dropped it and kept just a scatter of sparkle-stars at different
// sizes: "reaching for the stars" reads as boom-or-bust upside (Icarus
// flying for the sun) far more directly than a night sky did, and it's
// still the same starfield language as the homepage background.
// Heroicons' "sparkles" glyph, three 4-point stars at different scales.
function DiceIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <g transform="rotate(12 12 12)">
        <path fillRule="evenodd" d="M6.9 3.5h10.2a3.4 3.4 0 0 1 3.4 3.4v10.2a3.4 3.4 0 0 1-3.4 3.4H6.9a3.4 3.4 0 0 1-3.4-3.4V6.9a3.4 3.4 0 0 1 3.4-3.4ZM8 6.5a1.55 1.55 0 1 0 0 3.1 1.55 1.55 0 0 0 0-3.1ZM16 6.5a1.55 1.55 0 1 0 0 3.1 1.55 1.55 0 0 0 0-3.1ZM12 10.45a1.55 1.55 0 1 0 0 3.1 1.55 1.55 0 0 0 0-3.1ZM8 14.4a1.55 1.55 0 1 0 0 3.1 1.55 1.55 0 0 0 0-3.1ZM16 14.4a1.55 1.55 0 1 0 0 3.1 1.55 1.55 0 0 0 0-3.1Z" />
      </g>
    </svg>
  );
}

// On Fire's own icon -- Heroicons' solid "fire" glyph, in the same
// flat-fill-plus-currentColor language as every other icon on this row
// instead of a colorful platform emoji (which ignores the badge's own
// color entirely and looks pasted-on next to the flat pills).
function FlameIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path
        fillRule="evenodd"
        clipRule="evenodd"
        d="M12.963 2.286a.75.75 0 00-1.071-.136 9.742 9.742 0 00-3.539 6.176 7.547 7.547 0 01-1.705-1.715.75.75 0 00-1.152-.082A9 9 0 1015.68 4.534a7.46 7.46 0 01-2.717-2.248zM15.75 14.25a3.75 3.75 0 11-7.313-1.172c.628.465 1.35.81 2.133.998a5.27 5.27 0 01-.32-1.83c0-1.014.377-1.94 1-2.647a3.752 3.752 0 014.5 4.65z"
      />
    </svg>
  );
}

// On Thin Ice's own icon -- three icicles hanging from a ledge, the longest in the middle, with a drop about to fall: a solid shape like the rest of the
// row (the stroked snowflake it replaced read as stock clip art).
function IcicleIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M3 3.4h18a1 1 0 0 1 1 1V6.6H2V4.4a1 1 0 0 1 1-1Z" />
      <path d="M3.4 6.6h5.6l-1.9 10.4-.9 1.6-.9-1.6Z" />
      <path d="M9.9 6.6h5.4L13 18.4l-.6 3.6-.8-3.6Z" />
      <path d="M16.2 6.6h4.4l-1.6 6.6-.8 1.4-.9-1.4Z" />
      <path d="M18.4 16.6c.7 1 1.1 1.6 1.1 2.2a1.1 1.1 0 0 1-2.2 0c0-.6.4-1.2 1.1-2.2Z" />
    </svg>
  );
}

// Steady Eddy's own icon -- still a lock (the shape already reads
// clearly at this size and the concept fits), just redrawn as a plain
// filled SVG instead of the platform's own emoji, for the same reason as
// FlameIcon/IcicleIcon/DiceIcon above.
function LockIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M12 2a5 5 0 0 0-5 5v3H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8a2 2 0 0 0-2-2h-1V7a5 5 0 0 0-5-5zm-3 8V7a3 3 0 0 1 6 0v3H9zm3 4a1.6 1.6 0 0 1 1 2.85V18a1 1 0 1 1-2 0v-1.15A1.6 1.6 0 0 1 12 14z" />
    </svg>
  );
}

// Honorable's own icon -- a graduation cap (mortarboard) with its
// tassel hanging off the back, for "kept pace with (or beat) expectation
// two games running."
function GraduationCapIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      {/* The old translate(0.5,1.05) here centered the shape's BOUNDING
          BOX against viewBox-center, but a bbox-centered cap still read
          as shifted right at real badge size -- the tassel is a thin
          line/dot that barely affects the bbox (which only cares about
          the outermost extent) but does drag the actual PIXEL-MASS
          centroid right, since it's real filled area on that side. Fixed
          the same way as StarIcon: rasterized the shape, measured every
          filled pixel's average position, and re-picked this translate
          until that pixel-mass centroid landed within 0.01 units of
          (12,12) -- optical centering, not bbox centering. */}
      <g transform="translate(-0.454,0.974)">
        <path d="M12 3.2 1.5 8l10.5 4.8L20 9.2v5.4h1.5V8L12 3.2z" />
        <path
          d="M5 10.4v4.3c0 1.7 3.1 3.4 7 3.4s7-1.7 7-3.4v-4.3l-7 3.2-7-3.2z"
          opacity="0.85"
        />
        <path d="M18.5 10v6.6" stroke="currentColor" strokeWidth="1.2" fill="none" strokeLinecap="round" />
        <circle cx="18.5" cy="17.6" r="1.1" />
      </g>
    </svg>
  );
}

// Con Artist's own icon -- the classic comedy/tragedy theater masks
// (replaced an earlier rug motif that read as an envelope/dollar sign
// at this size, not a carpet). One mask per game of the 2-game read
// this badge is built on: a dim, sad mask behind (the number you were
// promised) and a solid, grinning mask in front (the one that actually
// showed up) -- "con artist" as in the act put on, not just "missed
// expectations." Each mask is one compound path (fillRule="evenodd") so
// its eyes/mouth punch clean holes straight through to the badge's own
// circle-fill behind it, same flat-fill-plus-glow language as every
// other badge here -- no separate cutout color to keep in sync.
function ConArtistIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      {/* back mask (tragedy) -- dim, frowning, upper-left. A real mask
          silhouette now (arched brow, tapered chin point), not a plain
          oval -- outline+eyes+mouth share one evenodd path so the
          cutouts punch real holes; the top knot is its own separate
          path so it stays solid instead of getting eaten by that same
          evenodd rule where it touches the outline's edge. */}
      <path
        d="M2.245,3.02 C5.71,1.04 9.49,1.04 12.955,3.02 C14.215,9.95 10.3,15.3 7.6,16.29 C4.9,15.3 1.0,9.95 2.245,3.02 Z
           M5.395,7.31 A0.95,0.95 0 1,0 7.295,7.31 A0.95,0.95 0 1,0 5.395,7.31 Z
           M8.905,7.31 A0.95,0.95 0 1,0 10.805,7.31 A0.95,0.95 0 1,0 8.905,7.31 Z
           M4.954,11.27 Q7.6,10.17 10.246,11.27 Q7.6,7.87 4.954,11.27 Z"
        opacity="0.55"
        fillRule="evenodd"
      />
      <path d="M6.8 2.9 8.4 2.9 7.6 0.9Z" opacity="0.55" />
      {/* front mask (comedy) -- solid, grinning, lower-right, overlapping,
          and drawn a size larger than the back mask so it reads as the
          one "in front." */}
      <path
        d="M10.19,8.98 C13.82,6.91 17.78,6.91 21.41,8.98 C22.73,16.225 18.5,21.8 15.8,22.435 C13.1,21.8 8.87,16.225 10.19,8.98 Z
           M13.49,13.465 A1,1 0 1,0 15.49,13.465 A1,1 0 1,0 13.49,13.465 Z
           M17.11,13.465 A1,1 0 1,0 19.11,13.465 A1,1 0 1,0 17.11,13.465 Z
           M13.028,17.605 Q15.8,18.705 18.572,17.605 Q15.8,21.205 13.028,17.605 Z"
        fillRule="evenodd"
      />
      <path d="M15 8.85 16.6 8.85 15.8 6.75Z" />
    </svg>
  );
}

// Buy Low's own icon -- a sprout (stem + two leaves), for real usage
// that hasn't grown into points yet.
function SproutIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M12 20V11" stroke="currentColor" strokeWidth="1.8" fill="none" strokeLinecap="round" />
      <path d="M12 14.2c-3.6 0-6.2-2.3-6.2-6.5C9.9 8 12 10.4 12 14.2z" />
      <path d="M12 11.3c2.9 0 5.1-1.9 5.1-5.4C13.9 6 12 8.1 12 11.3z" opacity="0.85" />
    </svg>
  );
}

// Matchup badge's icon -- the same solid triangle as the ▲ / ▼ beside the opponent in the table (up = smash spot,
// down = tough spot), so the badge and the mark read as one thing.
function MatchupIcon({ up }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d={up ? "M12 4 19 11.5h-4.5V20h-5v-8.5H5Z" : "M12 20 19 12.5h-4.5V4h-5v8.5H5Z"} />
    </svg>
  );
}

// Sell High's own icon -- a cinched money bag with a $ punched through
// it (the $ is filled with var(--peak), the badge's own background
// color, so in both light and dark theme it reads as a genuine cutout
// down to the badge behind the bag, not just a same-color line drawn on
// top). Replaced an earlier "wilting sprout" (SproutIcon rotated 180deg,
// the literal inverse of Buy Low's art) that tested as too abstract to
// read at a glance -- a money bag says "cash out" far more directly.
// Centered by the same pixel-mass-centroid method as the star/graduation
// cap above (rasterized the bag-minus-$ silhouette, measured the average
// position of every filled pixel, translated until that centroid landed
// within 0.01 units of (12,12) -- the bag's neck being narrower than its
// base means a naive bbox-center placement reads low-right otherwise).
function MoneyBagIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <g transform="translate(-1.085,-1.115)">
        <path d="M10.3 4.2c-.5 0-1 .3-1.1.8l-.5 1.7c-2.8 1.1-4.7 3.8-4.7 7 0 4.3 3.9 7.8 9 7.8s9-3.5 9-7.8c0-3.2-1.9-5.9-4.7-7l-.5-1.7c-.1-.5-.6-.8-1.1-.8z" />
        {/* The $ sign's own bbox center (12.2, 13.0) sat 0.8 units left of
            the bag path's own bbox center (13, 12.85) -- this nested
            translate re-centers the $ ON THE BAG specifically, separate
            from the outer translate above (which only centers the
            combined bag+$ shape within the badge circle -- fixing that
            alone doesn't fix the $'s position relative to the bag it
            sits inside). */}
        <g transform="translate(0.8,-0.15)">
          <path
            d="M12 8.3v9.4M14.1 10c-.4-.4-1.2-.8-2-.8-1.1 0-2 .6-2 1.6 0 1 1 1.4 2 1.7 1.3.3 2.3.8 2.3 1.9 0 1-.9 1.7-2.1 1.7-.9 0-1.8-.4-2.3-.9"
            stroke="var(--peak)"
            strokeWidth="1.4"
            fill="none"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </g>
      </g>
    </svg>
  );
}

// The icon each achievement key renders as in the full banner badge --
// keyed by achievements.js's own `key` field so this can't fall out of
// sync with which flags actually exist.
// Elite Role: a luxury mansion (pedimented centre with a spire, two wings, chimneys, steps; windows and the arched door cut out). Elite Player: a front-facing goat's head (the GOAT) -- swept-back horns, ears, slit pupils and a beard.
// One-colour art in currentColor on the badge's solid colour, like every other badge; the eyes and nostrils are cut out of the face.
function EliteRoleIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path fillRule="evenodd" d="M12 3.4 17.9 8.2V9.4H22V20.2H2V9.4H6.1V8.2ZM12 5.7a.9.9 0 1 0 0 1.8.9.9 0 0 0 0-1.8ZM7.1 10.6h1.3v3.8H7.1ZM15.6 10.6h1.3v3.8h-1.3ZM10.9 19.4V15.9a1.1 1.1 0 0 1 2.2 0v3.5ZM3.2 12h1.6v3H3.2ZM19.2 12h1.6v3h-1.6ZM3.2 16.4h1.6v2.2H3.2ZM19.2 16.4h1.6v2.2h-1.6Z" />
      <path d="M11.4 3.6 12 1.2 12.6 3.6Z" />
      <path d="M3.2 7.4h1.4v2.2H3.2Z" />
      <path d="M19.4 7.4h1.4v2.2h-1.4Z" />
      <path d="M9.4 20.2h5.2v1.5H9.4Z" />
      <path d="M10.4 21.7h3.2v1H10.4Z" />
    </svg>
  );
}

// Rookie: the numeral 1 drawn as an outline (a stroked flag-and-stem shape, hollow inside), in the badge's dark colour on the bronze.
function RookieIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" aria-hidden="true">
      <path d="M10 3.6h4.2v16.8h-3.4V8.2L8 9.7V6.6Z" />
    </svg>
  );
}

function ElitePlayerIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M9.6 9C5.4 9.4 2.4 6.6 2.8 1.6C4.8 4.4 7.6 4.8 11 5.6Z" />
      <path d="M14.4 9c4.2.4 7.2-2.4 6.8-7.4-2 2.8-4.8 3.2-8.2 4Z" />
      <path d="M8.4 11 2.4 10C2.6 12.4 4.2 13.8 7 14Z" />
      <path d="M15.6 11l6-1c-.2 2.4-1.8 3.8-4.6 4Z" />
      <path fillRule="evenodd" d="M8.2 8.6h7.6l-.8 7c-.2 1.7-1.3 2.8-3 2.8s-2.8-1.1-3-2.8ZM9.3 11h1.8v1.1H9.3ZM12.9 11h1.8v1.1h-1.8ZM11 15.1a.5.5 0 1 0 0 1 .5.5 0 0 0 0-1ZM13 15.1a.5.5 0 1 0 0 1 .5.5 0 0 0 0-1Z" />
      <path d="M10.6 18.4h2.8L12 22.4Z" />
    </svg>
  );
}

function achievementNode(a, row) {
  switch (a.key) {
    case "eliteRole":
      return <GlyphBadge variant="eliteRole" glyph={<EliteRoleIcon />} />;
    case "elitePlayer":
      return <GlyphBadge variant="elitePlayer" glyph={<ElitePlayerIcon />} />;
    case "rookie":
      return <GlyphBadge variant="rookie" glyph={<RookieIcon />} />;
    case "confidence":
      return <ConfidenceBadge confidence={row.sample_confidence} />;
    case "onFire":
      return (
        <GlyphBadge
          variant="heat"
          glyph={<FlameIcon />}
        />
      );
    case "onIce":
      return (
        <GlyphBadge
          variant="ice"
          glyph={<IcicleIcon />}
        />
      );
    case "volatile":
      return (
        <GlyphBadge
          variant="icarus"
          glyph={<DiceIcon />}
        />
      );
    case "locked":
      return (
        <GlyphBadge
          variant="eddy"
          glyph={<LockIcon />}
        />
      );
    case "hero":
      return <GlyphBadge variant="ball" glyph={<DragonBall stars={a.tier} />} />;
    case "buyLow":
      return (
        <GlyphBadge
          variant="sprout"
          glyph={<SproutIcon />}
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
          glyph={<MoneyBagIcon />}
        />
      );
    case "honorable":
      return (
        <GlyphBadge
          variant="honorable"
          glyph={<GraduationCapIcon />}
        />
      );
    case "conArtist":
      return (
        <GlyphBadge
          variant="menace"
          glyph={<ConArtistIcon />}
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

export function PlayerHeaderPanel({ row }) {
  const bio = row.bio || {};
  const ht = formatHeight(bio.height);
  const age = ageOn(bio.birthDate);
  const sizeText = [ht, bio.weight ? `${bio.weight} lbs` : null, age ? `${age} yrs` : null].filter(Boolean).join(" · ");

  // getAchievements (achievements.js) is the one source of truth for
  // which flags apply -- RankingsTable's collapsed-row dot preview calls
  // the exact same function. This just attaches the full icon component
  // each flag renders as here, which the dot preview has no use for.
  const achievements = getAchievements(row).map((a) => ({ ...a, node: achievementNode(a, row) }));

  return (
    <div className="stat-panel weekly-player-header">
      <div className="weekly-player-id">
        <div className="weekly-player-idtext">
          {/* The name stays centred over the badges row; the (square) photo hangs right beside it on the left. */}
          <span className="weekly-player-namewrap">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              key={bio.headshot || row.player_name}
              className="weekly-player-photo"
              src={bio.headshot || ""}
              alt=""
              onError={(e) => {
                e.currentTarget.style.display = "none";
              }}
            />
            <span className="weekly-player-name">{row.player_name}</span>
          </span>
          <div className="weekly-player-badges">
            <PositionBadge position={row.position} />
            <TeamBadge team={row.team} />
            {sizeText && (
              <span className="weekly-player-size mono">
                {sizeText}
                <span className="weekly-player-dot">{achievements.length > 0 ? " ·" : ""}</span>
              </span>
            )}
            {/* Confidence/streak/spread flags, all as one row
                of flat-fill "achievement" pills -- these used to be plain
                glyphs next to the name in the collapsed table row, but
                that duplicated the same info twice (dense table cell AND
                this banner) for no reason; this banner has the room to be
                the one place they live. Each is click/tap-to-reveal its
                own 1-2 word label via ExpandableBadge, not just a hover
                title. */}
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
              <Fragment key={name}>
                <div className="weekly-rank-section" role="row">
                  <span>{name}</span>
                  <span
                    className="weekly-rank-avg"
                  >
                    #{row.groupRank?.[name.toLowerCase()]?.rank ?? "-"}
                  </span>
                </div>
                {list.map((m) => (
                  <RankRow key={m.k} label={m.label} value={row[m.k]} format={m.format} rank={row.metricRank?.[m.k]} unrankedHint={m.unrankedHint} />
                ))}
              </Fragment>
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
          <PlayerHeaderPanel row={row} />
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

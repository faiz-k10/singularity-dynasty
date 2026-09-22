import { useState } from "react";
import OutcomeCurveDetail from "./OutcomeCurveDetail";
import TeamBadge from "./TeamBadge";
import PositionBadge from "./PositionBadge";
import ConfidenceBadge from "./ConfidenceBadge";
import { getAchievements } from "./achievements";

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
function GlyphBadge({ variant, glyph, title }) {
  return (
    <span className={`weekly-glyph-badge ${variant}`} title={title}>
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
function NightSkyIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.456 2.456L21.75 6l-1.035.259a3.375 3.375 0 00-2.456 2.456zM16.894 20.567L16.5 21.75l-.394-1.183a2.25 2.25 0 00-1.423-1.423L13.5 18.75l1.183-.394a2.25 2.25 0 001.423-1.423l.394-1.183.394 1.183a2.25 2.25 0 001.423 1.423l1.183.394-1.183.394a2.25 2.25 0 00-1.423 1.423z" />
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

// On Thin Ice's own icon -- a plain line-drawn snowflake, same treatment as
// FlameIcon above (a stroked glyph instead of the platform's own colored
// ice-cube emoji).
function SnowflakeIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true">
      <path d="M12 3v18M4.8 7.5l14.4 9M4.8 16.5l14.4-9" />
      <path d="M12 5.2l-1.8 1.5M12 5.2l1.8 1.5M12 18.8l-1.8-1.5M12 18.8l1.8-1.5" />
      <path d="M6 8.6l-.3 2.1-2 .6M18 15.4l.3-2.1 2-.6" />
    </svg>
  );
}

// Steady Eddy's own icon -- still a lock (the shape already reads
// clearly at this size and the concept fits), just redrawn as a plain
// filled SVG instead of the platform's own emoji, for the same reason as
// FlameIcon/SnowflakeIcon/NightSkyIcon above.
function LockIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M12 2a5 5 0 0 0-5 5v3H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8a2 2 0 0 0-2-2h-1V7a5 5 0 0 0-5-5zm-3 8V7a3 3 0 0 1 6 0v3H9zm3 4a1.6 1.6 0 0 1 1 2.85V18a1 1 0 1 1-2 0v-1.15A1.6 1.6 0 0 1 12 14z" />
    </svg>
  );
}

// Weekly Hero's own icon -- was a caped figure with fold-line/dot
// escalation, replaced with a flag (pole + field + canton) by request,
// keeping the patriotic red/white/blue direction. `tier` (1-5, see
// achievements.js's HERO_MAX_TIER) now shows as that many stars in the
// canton -- the same "discrete dots beat parallel lines for at-a-glance
// counting" lesson from the cape version, just inside a canton instead
// of on a cape. The art stops getting busier past 5 stars; the badge's
// `label` text is what keeps counting past that (see GlyphBadge's title
// below).
// Names the actual week(s) a Weekly Hero win happened -- a bare "top
// scorer in 1 week" title next to THIS week's own (unrelated, often much
// lower) positional rank reads as a bug at a glance; naming the real
// past week it happened is what makes an old, real WR1 finish legible
// instead of looking made up. Lists up to 3 most-recent wins by name
// before falling back to "and N more" for a genuinely repeat hero.
function heroTitle(position, weeks) {
  if (!weeks || weeks.length === 0) return `Top 3 at ${position} at least once this season`;
  const shown = weeks.slice(0, 3).map((w) => `${w.season} Wk${w.week}`);
  const rest = weeks.length - shown.length;
  const list = shown.join(", ") + (rest > 0 ? `, +${rest} more` : "");
  return `Top 3 at ${position} in ${list}`;
}

// Canton star layout per tier, dice-pip style (1 centered, 2/3 diagonal,
// 4 corners, 5 corners+center) -- the single most well-established
// "recognize the count without counting" pattern there is (it's how dice
// faces work), which is exactly what a single row of dots inside a
// canton this small couldn't reliably do at 5.
const LEFT_X = 7.2;
const CENTER_X = 9.4;
const RIGHT_X = 11.6;
const TOP_Y = 5.8;
const CENTER_Y = 7.3;
const BOTTOM_Y = 8.8;
const HERO_STAR_LAYOUTS = {
  1: [[CENTER_X, CENTER_Y]],
  2: [
    [LEFT_X, TOP_Y],
    [RIGHT_X, BOTTOM_Y],
  ],
  3: [
    [LEFT_X, TOP_Y],
    [CENTER_X, CENTER_Y],
    [RIGHT_X, BOTTOM_Y],
  ],
  4: [
    [LEFT_X, TOP_Y],
    [RIGHT_X, TOP_Y],
    [LEFT_X, BOTTOM_Y],
    [RIGHT_X, BOTTOM_Y],
  ],
  5: [
    [LEFT_X, TOP_Y],
    [RIGHT_X, TOP_Y],
    [CENTER_X, CENTER_Y],
    [LEFT_X, BOTTOM_Y],
    [RIGHT_X, BOTTOM_Y],
  ],
};

function HeroIcon({ tier }) {
  const count = Math.max(1, Math.min(tier || 1, 5));
  const stars = HERO_STAR_LAYOUTS[count];
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <line x1="4.6" y1="3.5" x2="4.6" y2="21" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      <rect x="5.6" y="4.5" width="14.2" height="10" rx="0.6" />
      {/* Canton is hardcoded Old Glory Blue rather than currentColor --
          deliberately a different hue from the white field, patriotic
          red/white/blue by request (badge background is the red). */}
      <rect x="5.6" y="4.5" width="7.6" height="5.6" fill="#0A3161" />
      {stars.map(([x, y], i) => (
        <circle key={i} cx={x} cy={y} r="0.85" />
      ))}
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

// Sell High's own icon -- the literal inverse of SproutIcon, same paths
// rotated 180deg around center. A wilting sprout for a badge that's the
// literal inverse of Buy Low's logic.
function WiltIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <g transform="rotate(180 12 12)">
        <path d="M12 20V11" stroke="currentColor" strokeWidth="1.8" fill="none" strokeLinecap="round" />
        <path d="M12 14.2c-3.6 0-6.2-2.3-6.2-6.5C9.9 8 12 10.4 12 14.2z" />
        <path d="M12 11.3c2.9 0 5.1-1.9 5.1-5.4C13.9 6 12 8.1 12 11.3z" opacity="0.85" />
      </g>
    </svg>
  );
}

// The icon each achievement key renders as in the full banner badge --
// keyed by achievements.js's own `key` field so this can't fall out of
// sync with which flags actually exist.
function achievementNode(a, row) {
  switch (a.key) {
    case "confidence":
      return <ConfidenceBadge confidence={row.sample_confidence} />;
    case "onFire":
      return (
        <GlyphBadge
          variant="heat"
          glyph={<FlameIcon />}
          title="Hit that week's own ceiling most recently, or beat both xFP and median in each of the last 3 games"
        />
      );
    case "onIce":
      return (
        <GlyphBadge
          variant="ice"
          glyph={<SnowflakeIcon />}
          title="Hit that week's own floor most recently, or missed both xFP and median in each of the last 3 games"
        />
      );
    case "volatile":
      return (
        <GlyphBadge
          variant="icarus"
          glyph={<NightSkyIcon />}
          title="Wide floor-to-ceiling range this week -- boom-or-bust"
        />
      );
    case "locked":
      return (
        <GlyphBadge
          variant="eddy"
          glyph={<LockIcon />}
          title="Tight floor-to-ceiling range this week -- a safe, predictable floor"
        />
      );
    case "hero":
      return <GlyphBadge variant="cape" glyph={<HeroIcon tier={a.tier} />} title={heroTitle(row.position, a.weeks)} />;
    case "buyLow":
      return (
        <GlyphBadge
          variant="sprout"
          glyph={<SproutIcon />}
          title="High usage (WOPR) that hasn't shown up in points the last 2 games -- volume tends to catch up"
        />
      );
    case "sellHigh":
      return (
        <GlyphBadge
          variant="peak"
          glyph={<WiltIcon />}
          title="Low usage (WOPR) despite scoring above median the last 2 games -- results outrunning the opportunity"
        />
      );
    case "honorable":
      return (
        <GlyphBadge
          variant="honorable"
          glyph={<GraduationCapIcon />}
          title="Scored at or above xFP in each of the last 2 games"
        />
      );
    case "conArtist":
      return (
        <GlyphBadge
          variant="menace"
          glyph={<ConArtistIcon />}
          title="Scored below xFP in each of the last 2 games"
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
function PlayerHeaderPanel({ row }) {
  const bio = row.bio || {};
  const ht = formatHeight(bio.height);
  const sizeText = [ht, bio.weight ? `${bio.weight} lbs` : null].filter(Boolean).join(" · ");
  const lastWeek = row.lastWeekRank;

  // getAchievements (achievements.js) is the one source of truth for
  // which flags apply -- RankingsTable's collapsed-row dot preview calls
  // the exact same function. This just attaches the full icon component
  // each flag renders as here, which the dot preview has no use for.
  const achievements = getAchievements(row).map((a) => ({ ...a, node: achievementNode(a, row) }));

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
export default function WeeklyDetailRow({ row, colSpan, maxSpread }) {
  const pct = row.statPct || {};
  const advancedEntries = ADVANCED_METRICS.filter((m) => row[m.key] != null && pct[m.key] != null);

  return (
    <tr className="stat-detail-row weekly-detail-row">
      <td colSpan={colSpan}>
        <div className="weekly-detail-wrap">
          <PlayerHeaderPanel row={row} />
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

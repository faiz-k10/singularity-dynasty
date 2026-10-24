"use client";

import { Fragment, useState } from "react";
import OutcomeCurveDetail from "./OutcomeCurveDetail";
import TeamBadge from "./TeamBadge";
import { isBye, BYE_LABEL } from "@/lib/bye";
import PositionBadge from "./PositionBadge";
import ConfidenceBadge from "./ConfidenceBadge";
import { getAchievements } from "./achievements";
import DragonBall from "./DragonBall";
import { MyStrip, MyEmpty } from "./MyPlayers";
import { PANEL_KEYS } from "@/lib/statPanel";

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
// Every number the usage panel can show, by the key it has on the row. The panel groups them per position into ROLE (how the offense uses him:
// volume, share, scheme) and PLAYER (how well he does with it: efficiency and output) -- PANEL below. Order inside a group is the order shown.
// Sources: avgXfp / wopr / ryoe / scrambleRate / playActionRate from the sims + game log (see the comment above); p2Td / i10Pg / i10Share from
// model/td_profile.R (kind "td_profile"; no touchdown-conversion rate: tested, it carries no signal once role is known); every u_ key from
// model/usage_profile.R (kind "usage_profile", nflreadr player stats, recency-weighted over his last 17 games (a full season), rate numbers only past a volume gate).
// Short labels because the label column is ~110px; the full explanation is in the hover tip.
const f1 = (v) => v.toFixed(1);
const f2 = (v) => v.toFixed(2);
const f3 = (v) => v.toFixed(3);
const pc1 = (v) => `${v.toFixed(1)}%`;
const signed2 = (v) => `${v >= 0 ? "+" : ""}${v.toFixed(2)}`;
const signed3 = (v) => `${v >= 0 ? "+" : ""}${v.toFixed(3)}`;
const METRICS = {
  avgXfp: { label: "xFP", format: f1, hint: "Expected fantasy points a game from his opportunities (ffopportunity), this season." },
  wopr: { label: "WOPR", format: f2, hint: "Weighted opportunity rating: how much of his offense's passing game runs through him (target share and air-yards share together). 0.70+ is a true No. 1 receiver. The same number the Buy Low badge reads." },
  ryoe: { label: "RYOE/Att", format: signed2, hint: "Rushing yards over expected per carry (NGS)." },
  scrambleRate: { label: "Scramble Rate", format: pc1, hint: "Share of his dropbacks that turn into a scramble." },
  playActionRate: { label: "Play-Action Rate", format: pc1, hint: "Share of his dropbacks that are play-action." },
  p2Td: { label: "2+ TD Chance", format: pc1, hint: "Chance of scoring 2 or more touchdowns in a single game, from his expected touchdowns. Treat the order as more reliable than the exact percentage at the very top." },
  i10Pg: { label: "In-10 Tgts/G", format: f2, hint: "Targets per game from inside the opponent's 10-yard line (last 17 games, recent weighted most). Targets there score 30-47% of the time." },
  i10Share: { label: "In-10 Share", format: pc1,
    hint: "Share of his targets that came from inside the opponent's 10-yard line. Ranked only among players averaging 4+ targets a game (6+ games) since the start of last season.",
    unrankedHint: "Not ranked: needs an average of 4+ targets a game (and 6+ games) since the start of last season." },
  u_att_pg: { label: "Pass Att/G", format: f1, hint: "Pass attempts a game (last 17 games, recent weighted most)." },
  u_ypa: { label: "Yds/Att", format: f2, hint: "Passing yards per attempt." },
  u_aypa: { label: "Air Yds/Att", format: f2, hint: "Air yards per attempt: how far downfield he throws. A style number as much as a skill one." },
  u_cpoe: { label: "CPOE", format: signed2, hint: "Completion percentage over expected: how much better (or worse) than the throws' difficulty predicts he completes them." },
  u_epa_db: { label: "EPA/Dropback", format: signed3, hint: "Expected points added per dropback (attempts plus sacks): how much each snap he drops back helps his offense." },
  u_sack_rate: { label: "Sack Rate", format: pc1, hint: "Sacks as a share of his dropbacks. Ranked with the LOWEST first: a fuller bar is fewer sacks." },
  u_rush_ypg: { label: "Rush Yds/G", format: f1, hint: "Rushing yards a game." },
  u_carries_pg: { label: "Carries/G", format: f1, hint: "Carries a game (last 17 games, recent weighted most)." },
  u_touches_pg: { label: "Touches/G", format: f1, hint: "Carries plus catches a game." },
  u_i5_tpg: { label: "In-5 Touches/G", format: f2, hint: "Touches (carries plus catches) a game from inside the opponent's 5-yard line, last 17 games, recent weighted most. The goal-line role: where backfield touchdowns come from." },
  u_i5_share: { label: "In-5 Share", format: pc1, hint: "Share of his touches (carries plus catches) that came inside the opponent's 5-yard line. Ranked only among backs averaging 5+ carries a game." },
  u_ypc: { label: "Yds/Carry", format: f2, hint: "Rushing yards per carry." },
  u_rush_epa: { label: "Rush EPA/Carry", format: signed3, hint: "Expected points added per carry." },
  u_tgt_pg: { label: "Targets/G", format: f1, hint: "Targets a game (last 17 games, recent weighted most)." },
  u_tgt_share: { label: "Target Share", format: pc1, hint: "Share of his team's targets." },
  u_air_share: { label: "Air Yds Share", format: pc1, hint: "Share of his team's air yards: how much of the deep passing game is his." },
  u_rec_ypg: { label: "Rec Yds/G", format: f1, hint: "Receiving yards a game." },
  u_ypt: { label: "Yds/Target", format: f2, hint: "Receiving yards per target." },
  u_yac_rec: { label: "YAC/Rec", format: f2, hint: "Yards after the catch per reception." },
  u_epa_tgt: { label: "EPA/Target", format: signed3, hint: "Expected points added per target." },
};
// ROLE = how the offense uses him; PLAYER = what he does with it (which numbers go where: lib/statPanel.js, which also ranks players by group).
// A number he doesn't have (below the volume gate, or not published) is just left out.
const PANEL = PANEL_KEYS;

// One line of the touchdown profile / usage panel: the metric, its value, and where he ranks at his position (#1 = highest).
function RankRow({ label, value, format, rank, hint, unrankedHint }) {
  if (!rank && !unrankedHint) return null;
  return (
    <div className="weekly-rank-row" role="row">
      <span className="weekly-rank-label" title={hint} role="rowheader">{label}</span>
      {rank ? (
        // The number, then a bar that shows the same rank: full for #1, empty for last at his position (the pool size is in the hover tip).
        <span className="weekly-rank-cell" title={`${ordinal(rank.rank)} of ${rank.of}`} role="cell">
          <span className="weekly-rank-n">#{rank.rank}</span>
          <span className="weekly-rank-bar">
            <span style={{ width: `${rank.of > 1 ? ((rank.of - rank.rank) / (rank.of - 1)) * 100 : 100}%` }} />
          </span>
        </span>
      ) : (
        <span className="weekly-rank-cell" title={unrankedHint} role="cell">
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
              <span
                className="weekly-gamelog-rank mono"
                title={g.posRank != null ? `Finished ${g.position}${g.posRank} that week` : undefined}
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

// Names the actual week(s) a Super Hero win happened -- a bare "top
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
      return <GlyphBadge variant="ball" glyph={<DragonBall stars={a.tier} />} title={heroTitle(row.position, a.weeks)} />;
    case "buyLow":
      return (
        <GlyphBadge
          variant="sprout"
          glyph={<SproutIcon />}
          title="High usage (WOPR) that hasn't shown up in points the last 2 games, while still scoring at or above xFP in 2 of the last 3 -- volume tends to catch up"
        />
      );
    case "matchup":
      return (
        <GlyphBadge
          variant={a.variant}
          glyph={<MatchupIcon up={a.variant === "smash"} />}
          title={a.text}
        />
      );
    case "sellHigh":
      return (
        <GlyphBadge
          variant="peak"
          glyph={<MoneyBagIcon />}
          title="Low usage (WOPR) despite scoring above median the last 2 games -- results outrunning the opportunity"
        />
      );
    case "honorable":
      return (
        <GlyphBadge
          variant="honorable"
          glyph={<GraduationCapIcon />}
          title="Scored at or above xFP in each of the last 3 games"
        />
      );
    case "conArtist":
      return (
        <GlyphBadge
          variant="menace"
          glyph={<ConArtistIcon />}
          title="Scored below xFP in each of the last 3 games"
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
      <div className="stat-panel weekly-stats-next">
        <span className="weekly-stats-eyebrow weekly-stats-eyebrow-next">
          This week{!bye && ` · ${row.playedThisWeek != null ? "Already played" : "Projected"}`}
          {row.opponent && !isBye(row.opponent) && (
            <span className="weekly-stats-opp">
              {row.is_home === true ? "vs" : row.is_home === false ? "@" : null}
              <TeamBadge team={row.opponent} />
            </span>
          )}
          {row.opponent && isBye(row.opponent) && <span className="weekly-stats-opp">· {BYE_LABEL}</span>}
        </span>
        <div className="weekly-stats-pair">
          <div className="weekly-stats-item">
            <span className="weekly-player-stat-label">Position rank</span>
            <span className="weekly-stats-value-big weekly-stats-value-gold">{bye ? "—" : row.positionLabel || "—"}</span>
          </div>
          <div className="weekly-stats-item">
            <span className="weekly-player-stat-label">Median proj</span>
            <span className="weekly-stats-value-big">{!bye && row.projection != null ? row.projection.toFixed(1) : "—"}</span>
          </div>
        </div>
      </div>
      <div className="stat-panel weekly-stats-last">
        <span className="weekly-stats-eyebrow">Last week{lastWeek ? ` · W${lastWeek.week}` : ""}</span>
        <div className="weekly-stats-pair">
          <div className="weekly-stats-item">
            <span className="weekly-player-stat-label">Finish</span>
            <span className="weekly-stats-value-dim">{lastWeek ? `${row.position}${lastWeek.rank}` : "—"}</span>
          </div>
          <div className="weekly-stats-item">
            <span className="weekly-player-stat-label">Output</span>
            <span className="weekly-stats-value-dim">{lastWeek?.points != null ? lastWeek.points.toFixed(1) : "—"}</span>
          </div>
        </div>
      </div>
    </div>
  );
}

export function PlayerHeaderPanel({ row }) {
  const bio = row.bio || {};
  const ht = formatHeight(bio.height);
  const sizeText = [ht, bio.weight ? `${bio.weight} lbs` : null].filter(Boolean).join(" · ");

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
          key={bio.headshot || row.player_name}
          className="weekly-player-photo"
          src={bio.headshot || ""}
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
    </div>
  );
}

// The Outcome Curve panel (floor / median / ceiling with each one's percentile vs the pool) -- shared by the opened
// player row and the Compare Players tool.
export function OutcomeCurvePanel({ row, maxSpread }) {
  const pct = row.statPct || {};
  if (isBye(row.opponent)) {
    return (
      <div className="stat-panel weekly-detail-curve-panel">
        <div className="weekly-pct-head">
          <span className="weekly-panel-title">Outcome Curve</span>
        </div>
        <div className="weekly-panel-body">
          <p className="weekly-opp-caption">{row.team} is on its bye this week, so there is no projected range. He is back in next week&apos;s rankings.</p>
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
  const sections = [["Role", entries(groups.role)], ["Player", entries(groups.player)]].filter(([, list]) => list.length);
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
                  {row.groupRank?.[name.toLowerCase()] && (
                    <span className="weekly-rank-avg" title={`${ordinal(row.groupRank[name.toLowerCase()].rank)} of ${row.groupRank[name.toLowerCase()].of} ${row.position}s on the ${name.toLowerCase()} numbers below (by his average rank on them)`}>
                      #{row.groupRank[name.toLowerCase()].rank}
                    </span>
                  )}
                </div>
                {list.map((m) => (
                  <RankRow key={m.k} label={m.label} value={row[m.k]} format={m.format} rank={row.metricRank?.[m.k]} hint={m.hint} unrankedHint={m.unrankedHint} />
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
  // Middle column: the "Your player" panel over Recent Games; far right: the usage / touchdown profile (these two swapped places on request,
  // Oct 24 2026). Without a "Your player" panel the profile keeps the middle column, as before.
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
              <OutcomeCurvePanel row={row} maxSpread={maxSpread} />
            </div>
            <div className="weekly-detail-col weekly-detail-col-mid">
              {mine || <UsageTdPanel row={row} />}
              <GameLogPanel games={row.recentGames} />
            </div>
            {mine && (
              <div className="weekly-detail-col weekly-detail-col-right">
                <UsageTdPanel row={row} />
              </div>
            )}
          </div>
        </div>
      </td>
    </tr>
  );
}

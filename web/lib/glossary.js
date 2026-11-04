import { PROFILE_METRICS } from "./statMetrics.js";

// Every term the site uses, in plain words: the /glossary page lists them and the tap-to-define labels (app/Define.js) show the
// same text, so a definition lives in exactly one place. The usage / efficiency numbers come straight from lib/statMetrics.js
// (their `hint`), with the abbreviation spelled out here. Each entry: { id (the #anchor), term, full?, def }.
const FULL = {
  avgXfp: "Expected fantasy points",
  wopr: "Weighted opportunity rating",
  ryoe: "Rushing yards over expected, per attempt",
  u_cpoe: "Completion percentage over expected",
  u_epa_db: "Expected points added per dropback",
  u_rush_epa: "Expected points added per carry",
  u_epa_tgt: "Expected points added per target",
  u_yac_rec: "Yards after the catch, per reception",
  i10Pg: "Targets inside the 10-yard line, per game",
  i10Share: "Share of targets inside the 10",
  u_i5_cpg: "Carries inside the 5-yard line, per game",
  u_i5_tpg: "Touches inside the 5-yard line, per game",
  u_i5_share: "Share of touches inside the 5",
};

export const slug = (s) => String(s).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

const CORE = [
  {
    group: "Reading a projection",
    terms: [
      ["Projection (median)", "The middle of a player's range this week: half of the outcomes we simulate land above it, half below. It is not a promise; it is the most even bet."],
      ["Floor", "His 10th-percentile outcome. About 1 game in 10 lands at or below it. A bad week, not his worst possible one."],
      ["Ceiling", "His 90th-percentile outcome. About 1 game in 10 lands at or above it. A big week that really happens, not a fantasy."],
      ["Range", "Floor to ceiling: where 8 of his 10 games should land. A wide range means more boom and more bust."],
      ["Outcome curve", "The shape of his range. The hump is where his points usually land; the shaded ends are the floor (left) and ceiling (right) zones."],
      ["Position rank", "Where his projection ranks among players at his position this week (WR4 = the 4th-highest projected wide receiver)."],
      ["PPR", "Point per reception: every catch is worth 1 point. All projections on the site use PPR unless your own league's scoring is shown (My Team)."],
    ],
  },
  {
    group: "Season simulations",
    terms: [
      ["Season simulation", "We play the rest of the season out thousands of times for every player, using his own game-to-game spread, and keep what he has already scored. The floor, median and ceiling are the 10th, 50th and 90th percentiles of those seasons."],
      ["Pace", "Where his season total ends up if he keeps scoring at his current rate."],
      ["vs Pace", "His pace minus his simulated median: positive means he is running ahead of what we expect."],
      ["Pace %ile", "Where his pace sits inside his own simulated range (90th = at his ceiling, 10th = at his floor)."],
    ],
  },
  {
    group: "Matchups and My Team",
    terms: [
      ["Smash Spot", "His opponent has one of the strongest real trends of giving up points to his position, after adjusting for who they played. Flagged players have beaten their median by about 2.5 points on average."],
      ["Tough Spot", "The reverse: an opponent that has strongly limited his position. Flagged players have fallen short of their median by about 2.3 points on average."],
      ["Win chance", "Your chance to win this week's matchup: points already scored are locked in, and every starter still to play is simulated from his range."],
      ["Playoff odds", "The rest of the regular season played out thousands of times from each team's real scoring strength. Tested on 327 completed Sleeper league-seasons."],
      ["Projected final", "Points already scored plus each starter's median for the part of his game still to come."],
      ["Lineup alert", "Something to fix before kickoff: an empty slot, a starter on a bye or ruled out, an injury tag, or a bench player projected to score more."],
      ["Exposure", "How many of your saved leagues roster a player. High exposure means one player's week moves many of your matchups."],
      ["Superflex", "A lineup slot that can hold a quarterback. In superflex leagues quarterbacks are worth far more."],
      ["BYE", "His team has no game this week. He scores 0 but isn't hurt or ruled out."],
    ],
  },
  {
    group: "Dynasty",
    terms: [
      ["Dynasty score", "Production over replacement and age value blended into one number: 80/20 for a contender, 55/45 for a rebuilder."],
      ["Production over replacement", "His recent points a game (last 34 games, recent ones weighted most) above the player you could pick up to replace him at his position."],
      ["Age value", "How much of his production players of his position and age have kept over the next three seasons, on a 1-10 scale."],
      ["Tier", "Players nobody below can be separated from with real confidence. A tier break is where the numbers say the gap is real."],
    ],
  },
  {
    group: "Badges",
    terms: [
      ["Established", "Enough recent games that his projection stands on his own numbers."],
      ["Building", "Few games so far, so his projection still leans partly on what players like him usually do."],
      ["Rookie", "In his first NFL season. His projection blends his own games with what rookies drafted near him have scored."],
      ["On Fire", "His last two games both reached that week's ceiling, or three straight games beat both his expected points and his median."],
      ["On Thin Ice", "The reverse: two straight games at or under the floor, or three straight short of both his expected points and median."],
      ["Steady Eddy", "A narrow range for his position: you know roughly what you'll get."],
      ["Risky Icarus", "A wide range for his position: big upside, real downside."],
      ["Buy Low", "His usage is among the best at his position but his points haven't caught up yet."],
      ["Sell High", "His points are running ahead of his usage, which tends to come back to earth."],
      ["Honorable", "Met or beat his expected fantasy points in at least 4 of his last 5 games."],
      ["Con Artist", "Fell short of his expected fantasy points in at least 4 of his last 5 games."],
      ["Super Hero", "One star for every top-3 finish at his position this season."],
      ["Elite Role", "Top 5 at his position in how his offense uses him (the Role stats)."],
      ["Elite Player", "Top 5 at his position in what he does with it (the Player stats)."],
    ],
  },
];

export const GLOSSARY = [
  ...CORE.map(({ group, terms }) => ({ group, terms: terms.map(([term, def]) => ({ id: slug(term), term, def })) })),
  {
    group: "Usage and efficiency",
    terms: [
      ...Object.entries(PROFILE_METRICS).map(([key, m]) => ({ id: slug(m.label), key, term: m.label, full: FULL[key] || null, def: m.hint })),
      { id: "yac-above-exp", term: "YAC above exp", full: "Yards after the catch above expected", def: "Yards after the catch beyond what is expected from where and how he caught the ball, per reception. Positive means he makes more happen after the catch than the average receiver would." },
      { id: "epa", term: "EPA", full: "Expected points added", def: "How much a play changes his team's expected points on that drive, from the down, distance and field position before and after it. Positive helps the offense." },
    ],
  },
];

const BY_ID = new Map(GLOSSARY.flatMap((g) => g.terms.map((t) => [t.id, t])));
const BY_KEY = new Map(GLOSSARY.flatMap((g) => g.terms.filter((t) => t.key).map((t) => [t.key, t])));

// A glossary entry by its anchor id ("floor") or by a stat's field key ("avgXfp"); null when unknown.
export const glossaryTerm = (idOrKey) => BY_KEY.get(idOrKey) || BY_ID.get(slug(idOrKey)) || null;

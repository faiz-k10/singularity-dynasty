// Every number The Observatory (app/tools/lab) can chart, in the order its pickers list them. Each one is a number the site already publishes
// somewhere -- this week's projection and stat line (Weekly Projection Rankings), the usage / efficiency / touchdown profile (the opened
// player's stats panel, lib/statMetrics.js), the season so far (player_game_log, as in Recent Games) and the season simulation (Player
// Season Simulations, Singularity only). Nothing here is a new model number.
//   group   the picker's section
//   lower   a LOWER value is better (sack rate, interceptions, overall rank): percentiles and "leader" flip
//   neutral neither end is better (spread of scores): no leader is highlighted
//   tier    "singularity" = only Singularity members get the values (the season simulation is Singularity-only on its own page too)
import { PROFILE_METRICS, f1, f2, signed2 } from "./statMetrics.js";

const int = (v) => String(Math.round(v));
const rankFmt = (v) => `#${Math.round(v)}`;

export const LAB_GROUPS = ["This week", "Projected stat line", "This season", "Usage & role", "Efficiency & output", "Touchdowns", "Season simulation"];

const OWN = [
  { key: "projection", group: "This week", label: "Proj. Points", format: f1, hint: "This week's median projection (PPR), as in Weekly Projection Rankings." },
  { key: "floor", group: "This week", label: "Floor", format: f1, hint: "The low end of his range this week: about 1 game in 10 finishes below it." },
  { key: "ceiling", group: "This week", label: "Ceiling", format: f1, hint: "The high end of his range this week: about 1 game in 10 finishes above it." },
  { key: "range", group: "This week", label: "Range", format: f1, neutral: true, hint: "Ceiling minus floor: how wide his likely outcomes are this week. Wider is riskier, not better." },
  { key: "rank", group: "This week", label: "Overall Rank", format: rankFmt, lower: true, hint: "His rank among every player in this week's Weekly Projection Rankings (#1 = highest projection)." },
  { key: "passing_yards", group: "Projected stat line", label: "Proj. Pass Yds", format: f1, hint: "Projected passing yards this week." },
  { key: "passing_tds", group: "Projected stat line", label: "Proj. Pass TD", format: f2, hint: "Projected passing touchdowns this week." },
  { key: "passing_interceptions", group: "Projected stat line", label: "Proj. INT", format: f2, lower: true, hint: "Projected interceptions thrown this week." },
  { key: "rushing_yards", group: "Projected stat line", label: "Proj. Rush Yds", format: f1, hint: "Projected rushing yards this week." },
  { key: "rushing_tds", group: "Projected stat line", label: "Proj. Rush TD", format: f2, hint: "Projected rushing touchdowns this week." },
  { key: "receptions", group: "Projected stat line", label: "Proj. Rec", format: f1, hint: "Projected receptions this week." },
  { key: "receiving_yards", group: "Projected stat line", label: "Proj. Rec Yds", format: f1, hint: "Projected receiving yards this week." },
  { key: "receiving_tds", group: "Projected stat line", label: "Proj. Rec TD", format: f2, hint: "Projected receiving touchdowns this week." },
  { key: "ppg", group: "This season", label: "Pts/G", format: f1, hint: "PPR points per game he has played this season." },
  { key: "total", group: "This season", label: "Total Pts", format: f1, hint: "PPR points this season." },
  { key: "gp", group: "This season", label: "Games", format: int, hint: "Games he has played this season (a game on the field with no stats counts, as a 0)." },
  { key: "l3", group: "This season", label: "Last 3 Avg", format: f1, hint: "PPR points per game over his last three games." },
  { key: "best", group: "This season", label: "Best Game", format: f1, hint: "His highest-scoring game this season." },
  { key: "sd", group: "This season", label: "Week-to-Week Spread", format: f1, neutral: true, hint: "Standard deviation of his weekly points this season: low = steady, high = boom or bust. Needs 3+ games." },
  { key: "fpoe", group: "This season", label: "Pts − xFP/G", format: signed2, hint: "Points per game above (+) or below (−) what his opportunities were expected to score (ffopportunity). Tends to shrink toward 0 over a season." },
  { key: "lyPpg", group: "This season", label: "Last Season Pts/G", format: f1, hint: "PPR points per game he played last season." },
];

// Which section each profile number belongs in (its label, format and hover tip come from lib/statMetrics.js).
const PROFILE_GROUP = {
  avgXfp: "Usage & role", wopr: "Usage & role", u_att_pg: "Usage & role", u_carries_pg: "Usage & role", u_touches_pg: "Usage & role",
  u_tgt_pg: "Usage & role", u_tgt_share: "Usage & role", u_air_share: "Usage & role", playActionRate: "Usage & role",
  ryoe: "Efficiency & output", scrambleRate: "Efficiency & output", u_ypa: "Efficiency & output", u_aypa: "Efficiency & output",
  u_cpoe: "Efficiency & output", u_epa_db: "Efficiency & output", u_sack_rate: "Efficiency & output", u_rush_ypg: "Efficiency & output",
  u_ypc: "Efficiency & output", u_rush_epa: "Efficiency & output", u_rec_ypg: "Efficiency & output", u_ypt: "Efficiency & output", u_catch_rate: "Efficiency & output",
  u_yac_rec: "Efficiency & output", u_epa_tgt: "Efficiency & output",
  p2Td: "Touchdowns", i10Pg: "Touchdowns", i10Share: "Touchdowns", u_i5_cpg: "Touchdowns", u_i5_tpg: "Touchdowns", u_i5_share: "Touchdowns",
};

const SIMS = [
  { key: "s_median", group: "Season simulation", label: "Season Median", format: f1, tier: "singularity", hint: "Median season total (PPR) across the simulated seasons: points so far plus the rest of the season." },
  { key: "s_floor", group: "Season simulation", label: "Season Floor", format: f1, tier: "singularity", hint: "Season total that about 1 healthy player in 10 finishes below." },
  { key: "s_ceiling", group: "Season simulation", label: "Season Ceiling", format: f1, tier: "singularity", hint: "Season total that about 1 healthy player in 10 finishes above." },
  { key: "s_pace", group: "Season simulation", label: "Vs Pace", format: signed2, tier: "singularity", hint: "Points ahead of (+) or behind (−) the pace his season projection implied through his team's games so far; missed games count against it." },
];

export const LAB_METRICS = [
  ...OWN,
  ...Object.entries(PROFILE_GROUP).map(([key, group]) => ({ key, group, ...PROFILE_METRICS[key] })),
  ...SIMS,
].map((m) => ({ ...m, lower: Boolean(m.lower), neutral: Boolean(m.neutral) }));

export const LAB_METRIC = Object.fromEntries(LAB_METRICS.map((m) => [m.key, m]));

// A value as the site shows it ("—" when missing).
export function formatMetric(key, v) {
  if (typeof v !== "number" || !Number.isFinite(v)) return "—";
  const m = LAB_METRIC[key];
  return m ? m.format(v) : f1(v);
}

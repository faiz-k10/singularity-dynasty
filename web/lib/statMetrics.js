// The usage / efficiency / touchdown numbers shown across the site (Weekly Projection Rankings' opened-player stats panel, the compare
// pages, The Lab): label, display format and hover tip, keyed by the field name a ranked row carries. One table, so every place shows the
// same words for the same number.
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
export const f1 = (v) => v.toFixed(1);
export const f2 = (v) => v.toFixed(2);
export const f3 = (v) => v.toFixed(3);
export const pc1 = (v) => `${v.toFixed(1)}%`;
export const signed2 = (v) => `${v >= 0 ? "+" : ""}${v.toFixed(2)}`;
export const signed3 = (v) => `${v >= 0 ? "+" : ""}${v.toFixed(3)}`;
export const PROFILE_METRICS = {
  avgXfp: { label: "xFP", format: f1, hint: "Expected fantasy points a game: what an average player would score with his targets, carries and where on the field he got them, this season. Points above it are his own doing; below it, opportunities he left on the field." },
  wopr: { label: "WOPR", format: f2, hint: "Weighted opportunity rating: how much of his offense's passing game runs through him (target share and air-yards share together). 0.70+ is a true No. 1 receiver. The same number the Buy Low badge reads." },
  ryoe: { label: "RYOE/Att", format: signed2, hint: "Rushing yards over expected per carry (NFL Next Gen Stats): how many more yards he gains than the blocking and defenders in front of him predict." },
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
  u_sack_rate: { label: "Sack Rate", format: pc1, lower: true, hint: "Sacks as a share of his dropbacks. Ranked with the LOWEST first: a fuller bar is fewer sacks." },
  u_rush_ypg: { label: "Rush Yds/G", format: f1, hint: "Rushing yards a game." },
  u_carries_pg: { label: "Carries/G", format: f1, hint: "Carries a game (last 17 games, recent weighted most)." },
  u_touches_pg: { label: "Touches/G", format: f1, hint: "Carries plus catches a game." },
  u_i5_cpg: { label: "In-5 Carries/G", format: f2, hint: "Carries a game from inside the opponent's 5-yard line (sneaks and goal-line runs), last 17 games, recent weighted most. A rushing-touchdown role most passers don't have." },
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

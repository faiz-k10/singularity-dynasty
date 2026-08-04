// Fixed display order for player_simulations.stat_ranges (matches
// STAT_COLS in projection_engine.R) -- position-dependent, a WR's
// stat_ranges simply won't have passing_* keys, so consumers just skip
// whatever a given row doesn't carry. Shared by PlayerSimSearch.js (the
// per-row expand) and the Compare Players page (side-by-side).
const STAT_LABELS = [
  ["passing_yards", "Pass Yards"],
  ["passing_tds", "Pass TDs"],
  ["passing_interceptions", "INTs"],
  ["rushing_yards", "Rush Yards"],
  ["rushing_tds", "Rush TDs"],
  ["receptions", "Receptions"],
  ["receiving_yards", "Rec Yards"],
  ["receiving_tds", "Rec TDs"],
];

export default STAT_LABELS;

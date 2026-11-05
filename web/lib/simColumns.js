// The Player Season Simulations table's sortable columns and how each compares (lib/sortLink.js sortRows): one copy for the server's first
// order (player-simulations/page.js) and the browser's re-sorts (PlayerSimSearch.js).
export const SIM_COLUMN_TYPES = {
  rank: "number",
  player_name: "string",
  position: "string",
  team: "string",
  floor: "number",
  median: "number",
  ceiling: "number",
  por: "number",
  regressionScore: "number",
  outcomePercentile: "number",
};

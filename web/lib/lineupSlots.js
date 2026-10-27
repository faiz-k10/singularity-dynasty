// Which positions can fill each lineup slot (Sleeper's roster_positions names). Slots we don't know (IDP and the like) are skipped.
// Used by the lineup optimizer (lib/lineupOptimizer.js).
export const ELIGIBLE = {
  QB: ["QB"],
  RB: ["RB"],
  WR: ["WR"],
  TE: ["TE"],
  K: ["K"],
  DEF: ["DEF"],
  WRRB_FLEX: ["WR", "RB"],
  REC_FLEX: ["WR", "TE"],
  FLEX: ["RB", "WR", "TE"],
  SUPER_FLEX: ["QB", "RB", "WR", "TE"],
};

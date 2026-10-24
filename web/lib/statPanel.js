// The opened player's stats panel (app/tools/WeeklyDetailRow.js `UsageTdPanel`) groups each position's numbers into ROLE (how the offense uses him)
// and PLAYER (what he does with it). This module holds which numbers go in which group and ranks every player at a position BY GROUP: his average
// rank over the group's numbers, then where that average sits among everyone at the position (lowest average = #1). Shown beside the "Role" and
// "Player" headings. Pure; tested in test/statPanel.test.mjs. The keys are the ones on a ranked row's `metricRank`; labels and formats live with the panel.
export const PANEL_KEYS = {
  QB: {
    role: ["avgXfp", "u_att_pg", "u_aypa", "u_rush_ypg", "scrambleRate", "playActionRate"],
    player: ["u_ypa", "u_cpoe", "u_epa_db", "u_sack_rate"],
  },
  RB: {
    role: ["avgXfp", "wopr", "u_touches_pg", "u_carries_pg", "u_tgt_pg"],
    player: ["u_rush_ypg", "u_ypc", "u_rush_epa", "u_rec_ypg", "ryoe"],
  },
  WR: {
    role: ["wopr", "u_tgt_pg", "u_tgt_share", "u_air_share", "i10Pg", "i10Share", "p2Td"],
    player: ["u_rec_ypg", "u_ypt", "u_yac_rec", "u_epa_tgt"],
  },
};
PANEL_KEYS.TE = PANEL_KEYS.WR;

// Mean of the ranks a player has on `keys` (ranks: { [key]: { rank, of } }); null when he has fewer than `min` of them.
export function meanRank(ranks, keys, min = 2) {
  const got = keys.map((k) => ranks?.[k]?.rank).filter((r) => r != null);
  return got.length >= min ? got.reduce((a, b) => a + b, 0) / got.length : null;
}

// Where every player stands in his position's Role and Player groups: { [name]: { role: { rank, of }, player: { rank, of } } } (a group a player
// can't be placed in -- fewer than half of its numbers -- is left out). Ties share the better rank. rows: [{ player_name, position }],
// ranksByName: { name: { key: { rank, of } } } over the same pool.
export function groupRanks(rows, ranksByName) {
  const out = {};
  for (const [pos, groups] of Object.entries(PANEL_KEYS)) {
    const inPos = rows.filter((r) => r.position === pos);
    for (const group of ["role", "player"]) {
      const keys = groups[group];
      const min = Math.ceil(keys.length / 2);
      const scored = inPos.map((r) => ({ name: r.player_name, avg: meanRank(ranksByName[r.player_name], keys, min) })).filter((s) => s.avg != null);
      for (const s of scored) {
        (out[s.name] ??= {})[group] = { rank: 1 + scored.filter((o) => o.avg < s.avg).length, of: scored.length };
      }
    }
  }
  return out;
}

// The opened player's stats panel (app/tools/WeeklyDetailRow.js `UsageTdPanel`) groups each position's numbers into ROLE (how the offense uses him)
// and PLAYER (what he does with it). This module holds which numbers go in which group, shared with the server code that lists the best role
// players at each position (redraft-rankings/data.js). The keys are the ones on a ranked row's `metricRank`; labels and formats live with the panel.
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

export const ROLE_LEADERS = 4;

// Mean of the ranks a player has on `keys` (ranks: { [key]: { rank, of } }); null when he has fewer than `min` of them.
export function meanRank(ranks, keys, min = 2) {
  const got = keys.map((k) => ranks?.[k]?.rank).filter((r) => r != null);
  return got.length >= min ? got.reduce((a, b) => a + b, 0) / got.length : null;
}

// The best role players at each position: the ROLE_LEADERS lowest mean ranks over the position's role numbers. A player needs at least half of
// them (a backup with one number can't top the list). rows: [{ player_name, position }], ranksByName: { name: { key: { rank, of } } }.
export function roleLeaders(rows, ranksByName, n = ROLE_LEADERS) {
  const out = {};
  for (const [pos, { role }] of Object.entries(PANEL_KEYS)) {
    const min = Math.ceil(role.length / 2);
    const scored = [];
    for (const r of rows) {
      if (r.position !== pos) continue;
      const avg = meanRank(ranksByName[r.player_name], role, min);
      if (avg != null) scored.push({ name: r.player_name, avg: Math.round(avg * 10) / 10 });
    }
    scored.sort((a, b) => a.avg - b.avg || a.name.localeCompare(b.name));
    out[pos] = scored.slice(0, n);
  }
  return out;
}

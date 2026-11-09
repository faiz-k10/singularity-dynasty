// Labels from how a player's season projection has MOVED (Season Simulations). The model saves each player's season floor / median / ceiling
// (PPR points over the full season; the median already includes points he has scored, see model/projection_engine.R) every week, so week 1
// can be set against now. Pure; tested in test/seasonLabels.test.mjs. Founder's picks, Nov 9 2026.
//
//   League Winners  his floor now is above his ceiling in week 1
//   Breakout        his median now is above his ceiling in week 1
//   Tank Commander  his ceiling now is below his floor in week 1
//   Collapse        his ceiling now is below his median in week 1
//   Riser           his median rose in each of the last four weekly snapshots
//   Faller          his median fell in each of the last four weekly snapshots
//
// A player gets at most one of each pair of the first four (the stronger wins) and may also carry Riser or Faller. Players whose week-1
// median was under MIN_MEDIAN (deep backups) get none.
export const MIN_MEDIAN = 40;
export const STREAK_WEEKS = 4;

export const SEASON_LABELS = {
  leagueWinners: { name: "League Winners", tone: "win", plain: "His floor now is above his week-1 ceiling." },
  breakout: { name: "Breakout", tone: "win", plain: "His median now is above his week-1 ceiling." },
  tankCommander: { name: "Tank Commander", tone: "lose", plain: "His ceiling now is below his week-1 floor." },
  collapse: { name: "Collapse", tone: "lose", plain: "His ceiling now is below his week-1 median." },
  riser: { name: "Riser", tone: "win", plain: "His median is up four weeks in a row." },
  faller: { name: "Faller", tone: "lose", plain: "His median is down four weeks in a row." },
};

// path: [[week, floor, median, ceiling], ...] for ONE player and one season, any order. Returns label keys, strongest first.
export function seasonLabels(path) {
  const p = (path || []).filter((r) => r && [r[1], r[2], r[3]].every((v) => typeof v === "number")).sort((a, b) => a[0] - b[0]);
  if (p.length < 2) return [];
  const [, , m1, c1] = p[0];
  const f1 = p[0][1];
  const [, nf, nm, nc] = p[p.length - 1];
  if (m1 < MIN_MEDIAN) return [];
  const out = [];
  if (nf > c1) out.push("leagueWinners");
  else if (nm > c1) out.push("breakout");
  else if (nc < f1) out.push("tankCommander");
  else if (nc < m1) out.push("collapse");
  const tail = p.slice(-STREAK_WEEKS).map((r) => r[2]);
  if (tail.length === STREAK_WEEKS) {
    if (tail.every((v, i) => i === 0 || v > tail[i - 1])) out.push("riser");
    else if (tail.every((v, i) => i === 0 || v < tail[i - 1])) out.push("faller");
  }
  return out;
}

// Rows of { player_name, week, floor, median, ceiling } for one season -> { name: [label keys] } (players with no label are left out).
export function seasonLabelsByName(rows) {
  const paths = {};
  for (const r of rows || []) (paths[r.player_name] ??= []).push([r.week, r.floor, r.median, r.ceiling]);
  const out = {};
  for (const [name, path] of Object.entries(paths)) {
    const l = seasonLabels(path);
    if (l.length) out[name] = l;
  }
  return out;
}

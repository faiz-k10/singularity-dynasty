// Labels from how a player's season projection has MOVED (Season Simulations). The model saves each player's season floor / median / ceiling
// (PPR points over the full season; the median already includes points he has scored, see model/projection_engine.R) every week, so week 1
// can be set against now. Pure; tested in test/seasonLabels.test.mjs. Founder's picks, Nov 9 2026.
//
//   LEVEL family (his season total now vs where week 1 had him) -- every player carries exactly one:
//     League Winner   his floor now is above his ceiling in week 1
//     Breakout        his median now is above his ceiling in week 1
//     Neutral         none of the four (the middle of the family; added Nov 9 2026)
//     Collapse        his ceiling now is below his median in week 1
//     Tank Commander  his ceiling now is below his floor in week 1
//   TREND family (his median over the last three weekly snapshots) -- exactly one once three snapshots exist:
//     Riser           it rose in each step
//     Steady          neither (the middle of the family; added Nov 9 2026)
//     Faller          it fell in each step
//
// Within the level family the strongest rule wins. Players whose week-1 median was under MIN_MEDIAN (deep backups) get no LEVEL label; the trend
// family never reads week 1, so it only asks that his median now is at least MIN_MEDIAN (Nov 10 2026: Malik Willis, 39 in week 1, had lost both
// families to the week-1 rule). The level family needs two snapshots, the trend family three.
export const MIN_MEDIAN = 40;
export const STREAK_WEEKS = 3;

// `plain` is the one-sentence caption under a clicked pill: deliberately vague, so it says what the tag means without giving away the rule.
export const SEASON_LABELS = {
  leagueWinners: { name: "League Winner", tone: "win", plain: "His season has gone far better than we could have reasonably hoped." },
  breakout: { name: "Breakout", tone: "win", plain: "He has turned into a better player than we expected before the season." },
  tankCommander: { name: "Tank Commander", tone: "lose", plain: "His season has gone far worse than we could have reasonably feared." },
  collapse: { name: "Collapse", tone: "lose", plain: "He has turned out much worse than we expected before the season." },
  neutral: { name: "Neutral", tone: "neutral", plain: "So far he is about where we expected him to be." },
  riser: { name: "Riser", tone: "win", plain: "His outlook has been getting better week after week." },
  steady: { name: "Steady", tone: "neutral", plain: "His outlook has been holding level lately." },
  faller: { name: "Faller", tone: "lose", plain: "His outlook has been getting worse week after week." },
};

// The two families in display order (the Tags filter and the pills): label keys, best to worst.
export const LEVEL_FAMILY = ["leagueWinners", "breakout", "neutral", "collapse", "tankCommander"];
export const TREND_FAMILY = ["riser", "steady", "faller"];

// path: [[week, floor, median, ceiling], ...] for ONE player and one season, any order. Returns label keys, strongest first.
export function seasonLabels(path) {
  const p = (path || []).filter((r) => r && [r[1], r[2], r[3]].every((v) => typeof v === "number")).sort((a, b) => a[0] - b[0]);
  if (p.length < 2) return [];
  const [, , m1, c1] = p[0];
  const f1 = p[0][1];
  const [, nf, nm, nc] = p[p.length - 1];
  const out = [];
  if (m1 >= MIN_MEDIAN) {
    if (nf > c1) out.push("leagueWinners");
    else if (nm > c1) out.push("breakout");
    else if (nc < f1) out.push("tankCommander");
    else if (nc < m1) out.push("collapse");
    else out.push("neutral");
  }
  const tail = p.slice(-STREAK_WEEKS).map((r) => r[2]);
  if (tail.length === STREAK_WEEKS && nm >= MIN_MEDIAN) {
    if (tail.every((v, i) => i === 0 || v > tail[i - 1])) out.push("riser");
    else if (tail.every((v, i) => i === 0 || v < tail[i - 1])) out.push("faller");
    else out.push("steady");
  }
  return out;
}

// Rows of { player_name, week, floor, median, ceiling } for one season -> { name: [label keys] } (players too thin to label are left out).
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

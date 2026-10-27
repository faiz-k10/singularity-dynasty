// Fantasy points one play is worth under a league's own scoring (Sleeper's scoring_settings). The live panel works out each player's running
// points play by play to estimate what Sleeper has not posted yet (lib/liveFeed.js pendingEach), and Sleeper's number is in THE LEAGUE'S scoring:
// a league that pays 0.25 a carry or 6 for a passing touchdown drifts away from a standard-PPR running total on the very first play, which
// is why a runner's score sat behind his play list (founder, Oct 26 2026: Javonte Williams, 0.25 per carry). Pure, tested.
//
// Per play, from the label lib/playByPlay.js gives it (and the yards): catches, runs, completions, touchdowns, turnovers, two-point tries.
// Not here (a mismatch just means "no estimate", never a wrong number): yardage bonuses, first downs, kicker distance tiers, defense scoring.

// What Sleeper calls each rate; STANDARD is the site's fixed rates (one source for playByPlay.playPoints too).
export const STANDARD_SCORING = {
  rec: 1,
  rec_yd: 0.1,
  rec_td: 6,
  rush_att: 0,
  rush_yd: 0.1,
  rush_td: 6,
  pass_cmp: 0,
  pass_yd: 0.04,
  pass_td: 4,
  pass_int: -2,
  fum: 0,
  fum_lost: -2,
  bonus_rec_te: 0,
  two_pt: 2,
};

// The rates a league overrides, picked out of its scoring_settings (kept small: it is saved in each team's snapshot).
export function scoringFrom(leagueScoring) {
  if (!leagueScoring) return null;
  const out = {};
  for (const k of Object.keys(STANDARD_SCORING)) {
    if (k === "two_pt") continue;
    out[k] = typeof leagueScoring[k] === "number" ? leagueScoring[k] : STANDARD_SCORING[k];
  }
  out.two_pt = typeof leagueScoring.rec_2pt === "number" ? leagueScoring.rec_2pt : STANDARD_SCORING.two_pt;
  return out;
}

export function scorePlay(label, yards, scoring = STANDARD_SCORING, pos = null) {
  const s = scoring || STANDARD_SCORING;
  const y = typeof yards === "number" ? yards : 0;
  const teBonus = pos === "TE" ? s.bonus_rec_te : 0;
  switch (label) {
    case "Catch": return s.rec + s.rec_yd * y + teBonus;
    case "Touchdown catch": return s.rec + s.rec_td + s.rec_yd * y + teBonus;
    case "Run": return s.rush_att + s.rush_yd * y;
    case "Touchdown run": return s.rush_att + s.rush_td + s.rush_yd * y;
    case "Completion": return s.pass_cmp + s.pass_yd * y;
    case "Touchdown pass": return s.pass_cmp + s.pass_td + s.pass_yd * y;
    case "Interception thrown": return s.pass_int;
    case "Fumble lost": return s.fum + s.fum_lost; // a lost fumble is also a fumble
    case "Fumble": return s.fum;
    case "Field goal": return 3;
    case "Extra point": return 1;
    case "Two-point conversion":
    case "Two-point return": return s.two_pt;
    case "Touchdown":
    case "Return touchdown": return 6;
    case "Sack": return 1;
    case "Sack and fumble recovery": return 3;
    case "Interception":
    case "Fumble recovery":
    case "Safety":
    case "Blocked kick": return 2;
    case "Interception touchdown":
    case "Fumble return touchdown": return 8;
    default: return 0;
  }
}

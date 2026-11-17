// Each team's head coach and general manager for the 2026 season: the Dynasty Board's "HC was an OC" and "drafting GM" columns.
// Pure, tested (test/teamStaff.test.mjs). HAND-MAINTAINED: update when a coach or GM changes (and re-check every offseason).
//
//   hc        head coach (nflverse load_schedules 2026, Nov 16 2026)
//   hcOC      true if he was ever an NFL offensive coordinator before (interim / co-OC counts); from public bios, Nov 16 2026
//   gm        the person who runs the draft (GM, or the de facto lead: Jerry Jones in DAL, Duke Tobin in CIN, Eliot Wolf in NE)
//   gmFirst   the first draft he ran FOR THIS TEAM. A player this team drafted in gmFirst or later was drafted by the current GM.
//             (A GM hired after that spring's draft starts the next year: Beane 2018, Veach 2018, Khan 2023, Teasley 2027.)
//             Known exception left out: Philadelphia's 2015 draft was Chip Kelly's, not Roseman's.
// GM changes checked on the web Nov 16 2026: Ian Cunningham (ATL), Jon-Eric Sullivan (MIA), Nolan Teasley (MIN, hired May 30 2026,
// after the draft); Ossenfort (ARI), Beane (BUF), Berry (CLE), Ballard (IND), Schoen (NYG), Spytek (LV) kept their jobs.
export const STAFF_SEASON = 2026;
export const STAFF = {
  ARI: { hc: "Mike LaFleur", hcOC: true, gm: "Monti Ossenfort", gmFirst: 2023 },
  ATL: { hc: "Kevin Stefanski", hcOC: true, gm: "Ian Cunningham", gmFirst: 2026 },
  BAL: { hc: "Jesse Minter", hcOC: false, gm: "Eric DeCosta", gmFirst: 2019 },
  BUF: { hc: "Joe Brady", hcOC: true, gm: "Brandon Beane", gmFirst: 2018 },
  CAR: { hc: "Dave Canales", hcOC: true, gm: "Dan Morgan", gmFirst: 2024 },
  CHI: { hc: "Ben Johnson", hcOC: true, gm: "Ryan Poles", gmFirst: 2022 },
  CIN: { hc: "Zac Taylor", hcOC: true, gm: "Duke Tobin", gmFirst: 2002 },
  CLE: { hc: "Todd Monken", hcOC: true, gm: "Andrew Berry", gmFirst: 2020 },
  DAL: { hc: "Brian Schottenheimer", hcOC: true, gm: "Jerry Jones", gmFirst: 1989 },
  DEN: { hc: "Sean Payton", hcOC: true, gm: "George Paton", gmFirst: 2021 },
  DET: { hc: "Dan Campbell", hcOC: false, gm: "Brad Holmes", gmFirst: 2021 },
  GB: { hc: "Matt LaFleur", hcOC: true, gm: "Brian Gutekunst", gmFirst: 2018 },
  HOU: { hc: "DeMeco Ryans", hcOC: false, gm: "Nick Caserio", gmFirst: 2021 },
  IND: { hc: "Shane Steichen", hcOC: true, gm: "Chris Ballard", gmFirst: 2017 },
  JAX: { hc: "Liam Coen", hcOC: true, gm: "James Gladstone", gmFirst: 2025 },
  KC: { hc: "Andy Reid", hcOC: false, gm: "Brett Veach", gmFirst: 2018 },
  LA: { hc: "Sean McVay", hcOC: true, gm: "Les Snead", gmFirst: 2012 },
  LAC: { hc: "Jim Harbaugh", hcOC: false, gm: "Joe Hortiz", gmFirst: 2024 },
  LV: { hc: "Klint Kubiak", hcOC: true, gm: "John Spytek", gmFirst: 2025 },
  MIA: { hc: "Jeff Hafley", hcOC: false, gm: "Jon-Eric Sullivan", gmFirst: 2026 },
  MIN: { hc: "Kevin O'Connell", hcOC: true, gm: "Nolan Teasley", gmFirst: 2027 },
  NE: { hc: "Mike Vrabel", hcOC: false, gm: "Eliot Wolf", gmFirst: 2024 },
  NO: { hc: "Kellen Moore", hcOC: true, gm: "Mickey Loomis", gmFirst: 2002 },
  NYG: { hc: "John Harbaugh", hcOC: false, gm: "Joe Schoen", gmFirst: 2022 },
  NYJ: { hc: "Aaron Glenn", hcOC: false, gm: "Darren Mougey", gmFirst: 2025 },
  PHI: { hc: "Nick Sirianni", hcOC: true, gm: "Howie Roseman", gmFirst: 2010 },
  PIT: { hc: "Mike McCarthy", hcOC: true, gm: "Omar Khan", gmFirst: 2023 },
  SEA: { hc: "Mike Macdonald", hcOC: false, gm: "John Schneider", gmFirst: 2010 },
  SF: { hc: "Kyle Shanahan", hcOC: true, gm: "John Lynch", gmFirst: 2017 },
  TB: { hc: "Todd Bowles", hcOC: false, gm: "Jason Licht", gmFirst: 2014 },
  TEN: { hc: "Robert Saleh", hcOC: false, gm: "Mike Borgonzi", gmFirst: 2025 },
  WAS: { hc: "Dan Quinn", hcOC: false, gm: "Adam Peters", gmFirst: 2024 },
};

const code = (t) => (t === "LAR" ? "LA" : t);

// His current team's head coach: { hc, oc: true / false }, or null for an unknown team.
export function coachFor(team) {
  const s = STAFF[code(team)];
  return s ? { hc: s.hc, oc: s.hcOC } : null;
}

// Is the GM who drafted him still running the team he plays for?
//   "yes"       still on his drafting team, and that team's GM ran the draft he was picked in
//   "no"        still on his drafting team, but the GM who picked him is gone
//   "moved"     he plays for a different team now (the GM who picked him has no stake in him)
//   "undrafted" no draft record
// with the current GM's name.
export function draftGm({ team, draftTeam, draftYear }) {
  if (!draftTeam || !draftYear) return { state: "undrafted" };
  const t = code(team), d = code(draftTeam);
  if (t !== d) return { state: "moved", from: d };
  const s = STAFF[t];
  if (!s) return { state: "unknown" };
  return { state: draftYear >= s.gmFirst ? "yes" : "no", gm: s.gm };
}

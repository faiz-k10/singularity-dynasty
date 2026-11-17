// Each team's head coach and general manager for the 2026 season: the Dynasty Board's "Playcaller HC" and "GM still there" columns.
// Pure, tested (test/teamStaff.test.mjs). HAND-MAINTAINED: update when a coach or GM changes (and re-check every offseason).
//
//   hc        head coach (nflverse load_schedules 2026, Nov 16 2026)
//   hcCalls   true if the HEAD COACH calls the offensive plays: the "Playcaller HC" column (founder, Nov 17 2026; it replaced
//             "was an offensive coach", which replaced "was ever an NFL offensive coordinator"). Source: ESPN, "Who calls plays for
//             every NFL team in 2026?" (Sept 3 2026), plus in-season changes: Sean Payton took Denver's play-calling back from Davis
//             Webb in Week 5. 49ers = Shanahan (ESPN listed him while Klay Kubiak filled in after Shanahan's offseason car accident;
//             the founder said count Shanahan). CHANGES IN-SEASON: re-check every few weeks (RUNBOOK.md).
//   gm        the person who runs the draft (GM, or the de facto lead: Jerry Jones in DAL, Duke Tobin in CIN, Eliot Wolf in NE)
//   gmFirst   the first draft he ran FOR THIS TEAM. A player this team drafted in gmFirst or later was drafted by the current GM.
//             (A GM hired after that spring's draft starts the next year: Beane 2018, Veach 2018, Khan 2023, Teasley 2027.)
//             Known exception left out: Philadelphia's 2015 draft was Chip Kelly's, not Roseman's.
//   gmSince   the day he took over (to the month at least; a few are the start of that year): a player who JOINED this team
//             (trade or signing) on or after it was brought in by the current GM.
// GM changes checked on the web Nov 16 2026: Ian Cunningham (ATL), Jon-Eric Sullivan (MIA), Nolan Teasley (MIN, hired May 30 2026,
// after the draft); Ossenfort (ARI), Beane (BUF), Berry (CLE), Ballard (IND), Schoen (NYG), Spytek (LV) kept their jobs.
export const STAFF_SEASON = 2026;
export const STAFF = {
  ARI: { hc: "Mike LaFleur", hcCalls: true, gm: "Monti Ossenfort", gmFirst: 2023, gmSince: "2023-01-16" },
  ATL: { hc: "Kevin Stefanski", hcCalls: false, gm: "Ian Cunningham", gmFirst: 2026, gmSince: "2026-01-20" },
  BAL: { hc: "Jesse Minter", hcCalls: false, gm: "Eric DeCosta", gmFirst: 2019, gmSince: "2019-01-01" },
  BUF: { hc: "Joe Brady", hcCalls: true, gm: "Brandon Beane", gmFirst: 2018, gmSince: "2017-05-09" },
  CAR: { hc: "Dave Canales", hcCalls: false, gm: "Dan Morgan", gmFirst: 2024, gmSince: "2024-01-22" },
  CHI: { hc: "Ben Johnson", hcCalls: true, gm: "Ryan Poles", gmFirst: 2022, gmSince: "2022-01-25" },
  CIN: { hc: "Zac Taylor", hcCalls: true, gm: "Duke Tobin", gmFirst: 2002, gmSince: "2002-01-01" },
  CLE: { hc: "Todd Monken", hcCalls: true, gm: "Andrew Berry", gmFirst: 2020, gmSince: "2020-01-27" },
  DAL: { hc: "Brian Schottenheimer", hcCalls: true, gm: "Jerry Jones", gmFirst: 1989, gmSince: "1989-02-25" },
  DEN: { hc: "Sean Payton", hcCalls: true, gm: "George Paton", gmFirst: 2021, gmSince: "2021-01-13" },
  DET: { hc: "Dan Campbell", hcCalls: false, gm: "Brad Holmes", gmFirst: 2021, gmSince: "2021-01-14" },
  GB: { hc: "Matt LaFleur", hcCalls: true, gm: "Brian Gutekunst", gmFirst: 2018, gmSince: "2018-01-07" },
  HOU: { hc: "DeMeco Ryans", hcCalls: false, gm: "Nick Caserio", gmFirst: 2021, gmSince: "2021-01-05" },
  IND: { hc: "Shane Steichen", hcCalls: true, gm: "Chris Ballard", gmFirst: 2017, gmSince: "2017-01-29" },
  JAX: { hc: "Liam Coen", hcCalls: true, gm: "James Gladstone", gmFirst: 2025, gmSince: "2025-02-04" },
  KC: { hc: "Andy Reid", hcCalls: true, gm: "Brett Veach", gmFirst: 2018, gmSince: "2017-07-11" },
  LA: { hc: "Sean McVay", hcCalls: true, gm: "Les Snead", gmFirst: 2012, gmSince: "2012-02-10" },
  LAC: { hc: "Jim Harbaugh", hcCalls: false, gm: "Joe Hortiz", gmFirst: 2024, gmSince: "2024-01-29" },
  LV: { hc: "Klint Kubiak", hcCalls: true, gm: "John Spytek", gmFirst: 2025, gmSince: "2025-01-23" },
  MIA: { hc: "Jeff Hafley", hcCalls: false, gm: "Jon-Eric Sullivan", gmFirst: 2026, gmSince: "2026-01-09" },
  MIN: { hc: "Kevin O'Connell", hcCalls: true, gm: "Nolan Teasley", gmFirst: 2027, gmSince: "2026-05-30" },
  NE: { hc: "Mike Vrabel", hcCalls: false, gm: "Eliot Wolf", gmFirst: 2024, gmSince: "2024-01-01" },
  NO: { hc: "Kellen Moore", hcCalls: true, gm: "Mickey Loomis", gmFirst: 2002, gmSince: "2002-01-01" },
  NYG: { hc: "John Harbaugh", hcCalls: false, gm: "Joe Schoen", gmFirst: 2022, gmSince: "2022-01-21" },
  NYJ: { hc: "Aaron Glenn", hcCalls: false, gm: "Darren Mougey", gmFirst: 2025, gmSince: "2025-01-23" },
  PHI: { hc: "Nick Sirianni", hcCalls: false, gm: "Howie Roseman", gmFirst: 2010, gmSince: "2010-01-29" },
  PIT: { hc: "Mike McCarthy", hcCalls: true, gm: "Omar Khan", gmFirst: 2023, gmSince: "2022-05-24" },
  SEA: { hc: "Mike Macdonald", hcCalls: false, gm: "John Schneider", gmFirst: 2010, gmSince: "2010-01-19" },
  SF: { hc: "Kyle Shanahan", hcCalls: true, gm: "John Lynch", gmFirst: 2017, gmSince: "2017-01-29" },
  TB: { hc: "Todd Bowles", hcCalls: false, gm: "Jason Licht", gmFirst: 2014, gmSince: "2014-01-21" },
  TEN: { hc: "Robert Saleh", hcCalls: false, gm: "Mike Borgonzi", gmFirst: 2025, gmSince: "2025-01-16" },
  WAS: { hc: "Dan Quinn", hcCalls: false, gm: "Adam Peters", gmFirst: 2024, gmSince: "2024-01-11" },
};

const code = (t) => (t === "LAR" ? "LA" : t);

// His current team's head coach: { hc, calls: true / false (he calls the offensive plays) }, or null for an unknown team.
export function coachFor(team) {
  const s = STAFF[code(team)];
  return s ? { hc: s.hc, calls: s.hcCalls } : null;
}

// Is the GM who brought him to the team he plays for still running it? (founder, Nov 16 2026: first "the GM who drafted him",
// then players who moved count by the GM who traded for / signed them.)
//   { state: "yes" | "no", how: "drafted" | "trade" | "joined", gm, at }   at = draft year, or the date he joined (YYYY-MM-DD)
//   { state: "undrafted" }   no draft record (signed as an undrafted free agent: not judged)
//   { state: "unknown" }     an unknown team, or a player who moved with no date for joining his team
// Draftees still on their drafting team are judged by gmFirst (the first draft the GM ran); everyone else by acqDate vs gmSince.
export function acquiringGm({ team, draftTeam, draftYear, acqDate, acqHow }) {
  if (!draftTeam || !draftYear) return { state: "undrafted" };
  const t = code(team), s = STAFF[t];
  if (!s) return { state: "unknown" };
  if (code(draftTeam) === t) return { state: draftYear >= s.gmFirst ? "yes" : "no", how: "drafted", gm: s.gm, at: draftYear };
  if (!acqDate) return { state: "unknown" };
  return { state: acqDate >= s.gmSince ? "yes" : "no", how: acqHow === "trade" ? "trade" : "joined", gm: s.gm, at: acqDate, from: code(draftTeam) };
}

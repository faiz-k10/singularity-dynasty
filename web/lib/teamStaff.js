// Each team's head coach and general manager for the 2026 season: the Dynasty Board's "Offensive HC" and "GM still there" columns.
// Pure, tested (test/teamStaff.test.mjs). HAND-MAINTAINED: update when a coach or GM changes (and re-check every offseason).
//
//   hc        head coach (nflverse load_schedules 2026, Nov 16 2026)
//   hcOff     true for an OFFENSIVE head coach: his NFL assistant career was on offense (coordinator, QB or another offensive
//             position coach) or he calls the offensive plays (founder, Nov 17 2026: was "ever an NFL offensive coordinator", which
//             left out Andy Reid). From public bios: the 19 former OCs, plus Reid (O-line / TE, then QB coach), Dan Campbell (TE coach,
//             MIA 2011-15, NO 2016-20) and Jim Harbaugh (Raiders offensive assistant 2002, QB coach 2003). The other 10 came up on
//             defense or special teams.
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
  ARI: { hc: "Mike LaFleur", hcOff: true, gm: "Monti Ossenfort", gmFirst: 2023, gmSince: "2023-01-16" },
  ATL: { hc: "Kevin Stefanski", hcOff: true, gm: "Ian Cunningham", gmFirst: 2026, gmSince: "2026-01-20" },
  BAL: { hc: "Jesse Minter", hcOff: false, gm: "Eric DeCosta", gmFirst: 2019, gmSince: "2019-01-01" },
  BUF: { hc: "Joe Brady", hcOff: true, gm: "Brandon Beane", gmFirst: 2018, gmSince: "2017-05-09" },
  CAR: { hc: "Dave Canales", hcOff: true, gm: "Dan Morgan", gmFirst: 2024, gmSince: "2024-01-22" },
  CHI: { hc: "Ben Johnson", hcOff: true, gm: "Ryan Poles", gmFirst: 2022, gmSince: "2022-01-25" },
  CIN: { hc: "Zac Taylor", hcOff: true, gm: "Duke Tobin", gmFirst: 2002, gmSince: "2002-01-01" },
  CLE: { hc: "Todd Monken", hcOff: true, gm: "Andrew Berry", gmFirst: 2020, gmSince: "2020-01-27" },
  DAL: { hc: "Brian Schottenheimer", hcOff: true, gm: "Jerry Jones", gmFirst: 1989, gmSince: "1989-02-25" },
  DEN: { hc: "Sean Payton", hcOff: true, gm: "George Paton", gmFirst: 2021, gmSince: "2021-01-13" },
  DET: { hc: "Dan Campbell", hcOff: true, gm: "Brad Holmes", gmFirst: 2021, gmSince: "2021-01-14" },
  GB: { hc: "Matt LaFleur", hcOff: true, gm: "Brian Gutekunst", gmFirst: 2018, gmSince: "2018-01-07" },
  HOU: { hc: "DeMeco Ryans", hcOff: false, gm: "Nick Caserio", gmFirst: 2021, gmSince: "2021-01-05" },
  IND: { hc: "Shane Steichen", hcOff: true, gm: "Chris Ballard", gmFirst: 2017, gmSince: "2017-01-29" },
  JAX: { hc: "Liam Coen", hcOff: true, gm: "James Gladstone", gmFirst: 2025, gmSince: "2025-02-04" },
  KC: { hc: "Andy Reid", hcOff: true, gm: "Brett Veach", gmFirst: 2018, gmSince: "2017-07-11" },
  LA: { hc: "Sean McVay", hcOff: true, gm: "Les Snead", gmFirst: 2012, gmSince: "2012-02-10" },
  LAC: { hc: "Jim Harbaugh", hcOff: true, gm: "Joe Hortiz", gmFirst: 2024, gmSince: "2024-01-29" },
  LV: { hc: "Klint Kubiak", hcOff: true, gm: "John Spytek", gmFirst: 2025, gmSince: "2025-01-23" },
  MIA: { hc: "Jeff Hafley", hcOff: false, gm: "Jon-Eric Sullivan", gmFirst: 2026, gmSince: "2026-01-09" },
  MIN: { hc: "Kevin O'Connell", hcOff: true, gm: "Nolan Teasley", gmFirst: 2027, gmSince: "2026-05-30" },
  NE: { hc: "Mike Vrabel", hcOff: false, gm: "Eliot Wolf", gmFirst: 2024, gmSince: "2024-01-01" },
  NO: { hc: "Kellen Moore", hcOff: true, gm: "Mickey Loomis", gmFirst: 2002, gmSince: "2002-01-01" },
  NYG: { hc: "John Harbaugh", hcOff: false, gm: "Joe Schoen", gmFirst: 2022, gmSince: "2022-01-21" },
  NYJ: { hc: "Aaron Glenn", hcOff: false, gm: "Darren Mougey", gmFirst: 2025, gmSince: "2025-01-23" },
  PHI: { hc: "Nick Sirianni", hcOff: true, gm: "Howie Roseman", gmFirst: 2010, gmSince: "2010-01-29" },
  PIT: { hc: "Mike McCarthy", hcOff: true, gm: "Omar Khan", gmFirst: 2023, gmSince: "2022-05-24" },
  SEA: { hc: "Mike Macdonald", hcOff: false, gm: "John Schneider", gmFirst: 2010, gmSince: "2010-01-19" },
  SF: { hc: "Kyle Shanahan", hcOff: true, gm: "John Lynch", gmFirst: 2017, gmSince: "2017-01-29" },
  TB: { hc: "Todd Bowles", hcOff: false, gm: "Jason Licht", gmFirst: 2014, gmSince: "2014-01-21" },
  TEN: { hc: "Robert Saleh", hcOff: false, gm: "Mike Borgonzi", gmFirst: 2025, gmSince: "2025-01-16" },
  WAS: { hc: "Dan Quinn", hcOff: false, gm: "Adam Peters", gmFirst: 2024, gmSince: "2024-01-11" },
};

const code = (t) => (t === "LAR" ? "LA" : t);

// His current team's head coach: { hc, off: true / false (an offensive head coach) }, or null for an unknown team.
export function coachFor(team) {
  const s = STAFF[code(team)];
  return s ? { hc: s.hc, off: s.hcOff } : null;
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

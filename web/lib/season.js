// The NFL season a moment belongs to -- NOT the calendar year (Nov 11 2026 pre-launch check): weeks 17-18 and the playoffs of the 2026
// season are played in January 2027, so `new Date().getFullYear()` would start asking for "2027" leagues and projections on January 1
// and My Team, live scores and the health check would all come up empty until the new season. Pure; tested in test/season.test.mjs.

// From the date alone: January and February still belong to the season that started the previous September.
export function seasonFromDate(d = new Date()) {
  return d.getMonth() < 2 ? d.getFullYear() - 1 : d.getFullYear();
}

// From Sleeper's /state/nfl when we have it (its `season`), else the date rule. `leagues: true` asks for the season new leagues are being
// made for (Sleeper's `league_season`, which moves to the next year in the offseason once leagues renew) -- the one to look leagues up by.
export function nflSeason(state, { leagues = false } = {}) {
  const fromState = Number((leagues && state?.league_season) || state?.season);
  return Number.isFinite(fromState) && fromState > 2000 ? fromState : seasonFromDate();
}

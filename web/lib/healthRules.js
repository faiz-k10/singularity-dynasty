// Is the site healthy? The pure rule behind /api/health (the hourly alert) and the /admin status panel; tested in
// test/healthRules.test.mjs. Inputs are plain values (lib/health.js gathers them), so the rule can't depend on the clock or
// the network.
//
// During the regular season a new week is published every Tuesday (weekly-run.mjs on the founder's Mac). If that run fails,
// last week's numbers simply stay up -- nothing breaks visibly -- so freshness is checked directly:
//   weekly rankings / season simulations   newest publish no older than STALE_DAYS
//   game log                               within two weeks of the NFL's current week (allows for Tuesday morning, before the run)
//   history gaps                           every week 1..newest has rows in the sims and the game log (the week bar and Recent Games
//                                          read each week; a hole is a skipped week on the site)
//   errors                                 fewer than ERROR_LIMIT recorded in the last hour
// Outside the regular season the data is expected to sit still, so only the error check applies.
export const STALE_DAYS = 7.5;
export const ERROR_LIMIT = 25;
const DAY = 86_400_000;

// Weeks 1..max that have no rows (null/undefined = not read, judged fine like an unreadable error log).
export function missingWeeks(present) {
  if (!Array.isArray(present) || present.length === 0) return [];
  const have = new Set(present);
  const out = [];
  for (let w = 1; w <= Math.max(...present); w++) if (!have.has(w)) out.push(w);
  return out;
}

export function evaluateHealth({ now, nfl, rankingsPublishedAt, simsPublishedAt, gameLogWeek, errorsLastHour, simWeeks, gameLogWeeks }) {
  const inSeason = nfl?.season_type === "regular";
  const age = (iso) => (iso ? (now - Date.parse(iso)) / DAY : Infinity);
  const fresh = (name, iso) => {
    const days = age(iso);
    return { name, ok: !inSeason || days <= STALE_DAYS, detail: Number.isFinite(days) ? `published ${days.toFixed(1)} days ago` : "never published" };
  };
  const gapCheck = (name, on, weeks) => {
    const gaps = missingWeeks(weeks);
    return { name, ok: !on || gaps.length === 0, detail: gaps.length ? `no rows for week ${gaps.join(", ")}` : weeks?.length ? `weeks 1-${Math.max(...weeks)} all present` : "not read" };
  };
  const week = Number(nfl?.week) || null;
  const checks = [
    fresh("Weekly rankings", rankingsPublishedAt),
    fresh("Season simulations", simsPublishedAt),
    {
      name: "Game log",
      ok: !inSeason || !week || (gameLogWeek ?? 0) >= week - 2,
      detail: gameLogWeek ? `through week ${gameLogWeek}${week ? ` (NFL week ${week})` : ""}` : "no games this season",
    },
    gapCheck("Season sim history", inSeason, simWeeks),
    gapCheck("Game log history", inSeason, gameLogWeeks),
    { name: "Errors", ok: errorsLastHour == null || errorsLastHour < ERROR_LIMIT, detail: errorsLastHour == null ? "error log unavailable" : `${errorsLastHour} in the last hour` },
  ];
  return { ok: checks.every((c) => c.ok), inSeason, checks };
}

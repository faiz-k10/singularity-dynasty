// Is the site healthy? The pure rule behind /api/health (the hourly alert) and the /admin status panel; tested in
// test/healthRules.test.mjs. Inputs are plain values (lib/health.js gathers them), so the rule can't depend on the clock or
// the network.
//
// During the regular season a new week is published every Tuesday (weekly-run.mjs on the founder's Mac). If that run fails,
// last week's numbers simply stay up -- nothing breaks visibly -- so freshness is checked directly:
//   weekly rankings / season simulations   newest publish no older than STALE_DAYS
//   game log                               within two weeks of the NFL's current week (allows for Tuesday morning, before the run)
//   errors                                 fewer than ERROR_LIMIT recorded in the last hour
// Outside the regular season the data is expected to sit still, so only the error check applies.
export const STALE_DAYS = 7.5;
export const ERROR_LIMIT = 25;
const DAY = 86_400_000;

export function evaluateHealth({ now, nfl, rankingsPublishedAt, simsPublishedAt, gameLogWeek, errorsLastHour }) {
  const inSeason = nfl?.season_type === "regular";
  const age = (iso) => (iso ? (now - Date.parse(iso)) / DAY : Infinity);
  const fresh = (name, iso) => {
    const days = age(iso);
    return { name, ok: !inSeason || days <= STALE_DAYS, detail: Number.isFinite(days) ? `published ${days.toFixed(1)} days ago` : "never published" };
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
    { name: "Errors", ok: errorsLastHour == null || errorsLastHour < ERROR_LIMIT, detail: errorsLastHour == null ? "error log unavailable" : `${errorsLastHour} in the last hour` },
  ];
  return { ok: checks.every((c) => c.ok), inSeason, checks };
}

// Lowest-lift real team-scoped insight: reads the win/loss record
// Sleeper already computes for us (saved_teams.settings.record, built in
// actions.js's lookupSleeperTeams() from myRoster.settings.wins/losses --
// fetched and stored today, but only ever shown as a plain roster-page
// line, never scored). Exists mainly to prove the scope:"team" path end
// to end without needing any new Sleeper API calls; it's also the first
// building block toward the win-count achievement badges discussed
// separately (close-game/trade badges need the transactions + full-
// season matchups endpoints, which are a bigger, not-yet-built piece).

export async function computeSeasonRecordBadge({ settings } = {}) {
  const record = settings?.record || "0-0";
  const [wins = 0, losses = 0] = record.split("-").map((n) => Number(n) || 0);
  let tier = null;
  if (wins >= 10) tier = "gold";
  else if (wins >= 7) tier = "silver";
  else if (wins >= 4) tier = "bronze";
  return { record, wins, losses, tier };
}

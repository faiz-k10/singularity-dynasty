// Games a player's team has played, worked out from the player game log (a
// bye week simply has no rows for the team). Used so a player's pace can
// count the games he missed: points so far / team games, not / games played.
//
// `rows` are player_game_log rows for one season, oldest week first, each
// with { player_name, team, week }.
export function indexGameLog(rows) {
  const gamesByName = {};
  const teamWeeks = {};
  let lastGameWeek = 0;
  for (const g of rows || []) {
    (gamesByName[g.player_name] ??= []).push(g);
    if (g.week > lastGameWeek) lastGameWeek = g.week;
    if (g.team) (teamWeeks[g.team] ??= new Set()).add(g.week);
  }
  return { gamesByName, teamWeeks, lastGameWeek };
}

// Games the player's team had played through week `w` (default: all loaded
// weeks). The team is the one on his latest game at or before `w`, or his
// first game if he has none yet by then (so a mid-season trade counts each
// stretch against the team he was on). null when the log has no team for him.
export function teamGamesThrough({ gamesByName, teamWeeks }, name, w = Infinity) {
  const games = gamesByName[name] || [];
  let ref = games[0];
  for (const g of games) if (g.week <= w) ref = g;
  const weeks = ref?.team ? teamWeeks[ref.team] : null;
  if (!weeks) return null;
  let n = 0;
  for (const wk of weeks) if (wk <= w) n++;
  return n;
}

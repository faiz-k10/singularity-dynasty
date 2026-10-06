// Games a player's team has played, worked out from the player game log (a
// bye week simply has no rows for the team). Used so a player's pace can
// count the games he missed: points so far vs. his team's games, not just
// the games he appeared in.
//
// `rows` are player_game_log rows for one season, oldest week first, each
// with { player_name, team, week }.

// team -> Set of the weeks that team played (any player's row proves a game).
export function buildTeamWeeks(rows) {
  const teamWeeks = {};
  for (const g of rows || []) if (g.team) (teamWeeks[g.team] ??= new Set()).add(g.week);
  return teamWeeks;
}

export function indexGameLog(rows) {
  const gamesByName = {};
  let lastGameWeek = 0;
  for (const g of rows || []) {
    (gamesByName[g.player_name] ??= []).push(g);
    if (g.week > lastGameWeek) lastGameWeek = g.week;
  }
  return { gamesByName, teamWeeks: buildTeamWeeks(rows), lastGameWeek };
}

// The team he was on at week `w`: the one on his latest game at or before
// `w`, or his first game if he has none yet by then (so a mid-season trade
// counts each stretch against the team he was on).
function teamAt(gamesByName, name, w) {
  const games = gamesByName[name] || [];
  let ref = games[0];
  for (const g of games) if (g.week <= w) ref = g;
  return ref?.team || null;
}

// Games the player's team had played through week `w` (default: all loaded
// weeks). null when the log has no team for him.
export function teamGamesThrough({ gamesByName, teamWeeks }, name, w = Infinity) {
  const team = teamAt(gamesByName, name, w);
  const weeks = team ? teamWeeks[team] : null;
  if (!weeks) return null;
  let n = 0;
  for (const wk of weeks) if (wk <= w) n++;
  return n;
}

// Weeks (through `lastGameWeek`) in which the player's team played but he
// did not. A bye is not a missed game.
export function missedWeeks({ gamesByName, teamWeeks, lastGameWeek }, name) {
  const played = new Set((gamesByName[name] || []).map((g) => g.week));
  const out = [];
  for (let w = 1; w <= lastGameWeek; w++) {
    if (played.has(w)) continue;
    const team = teamAt(gamesByName, name, w);
    if (team && teamWeeks[team]?.has(w)) out.push(w);
  }
  return out;
}

// Stretches of the week bar (percent of its width) to paint gray: the weeks
// his team played and he didn't. The bar runs W1 at the left end to the
// latest week at the right end, each week owning the stretch centred on its
// handle position; only the part already filled (every week up to and
// including the selected one) is shown, and runs of consecutive missed weeks
// merge into one segment so there is no hairline seam between them.
export function missedSegments(missed, selectedWeek, latestWeek) {
  if (!Array.isArray(missed) || latestWeek < 2) return [];
  const step = 100 / (latestWeek - 1);
  const filledTo = Math.min(100, (selectedWeek - 0.5) * step);
  const out = [];
  for (const w of [...missed].filter((m) => m <= selectedWeek).sort((a, b) => a - b)) {
    const start = Math.max(0, (w - 1.5) * step);
    const end = Math.min(filledTo, (w - 0.5) * step);
    if (end <= start) continue;
    const last = out[out.length - 1];
    if (last && Math.abs(last.end - start) < 1e-9) last.end = end;
    else out.push({ start, end });
  }
  return out;
}

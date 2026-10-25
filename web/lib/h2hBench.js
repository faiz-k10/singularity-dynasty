// The bench of each side of a head-to-head matchup (MatchupPanel.js shows it under the starters): the players on the roster who are not
// starting this week, with the same fields as a lineup entry (id, slot "BN", name, pos, team, proj, floor, ceiling, pts) so the matchup rows
// draw them the same way. Pure; tested in test/h2hBench.test.mjs.
import { buildSide } from "./winChance.js";
import { num } from "./format.js";

const SHOWN = new Set(["QB", "RB", "WR", "TE", "K", "DEF"]);
const MAX_BENCH = 14;

// From a Sleeper matchup entry (its `players` = everyone on that roster this week, `starters` the lineup, `players_points` each one's points).
// Kept: a position we show AND either a projection from our model (not a typical-range stand-in, not an inactive / team-less player) or points
// scored this week -- so a deep reserve nobody projects doesn't pad the list. Best projection first.
export function buildBench(entry, infoFor, projFor) {
  if (!entry) return [];
  const starting = new Set((entry.starters || []).map(String));
  const ids = [...new Set((entry.players || []).map(String))].filter((id) => id && id !== "0" && !starting.has(id));
  return buildSide(ids, ids.map(() => "BN"), infoFor, projFor, entry.players_points)
    .filter((p) => p.id && SHOWN.has(p.pos) && ((!p.est && !p.out) || (num(p.pts) ?? 0) > 0))
    .sort((a, b) => (b.proj || 0) - (a.proj || 0))
    .slice(0, MAX_BENCH);
}

// The same list for MY side from a saved snapshot that predates the bench (saved players carry this week's projection and range, and the
// league's points per player id are in settings.playerPoints). Best projection first.
export function benchFromRoster(players, playerPoints) {
  return (players || [])
    .filter((p) => !p.isStarter && SHOWN.has(p.position) && (num(p.myProjPts) != null || (num(playerPoints?.[p.player_id]) ?? 0) > 0))
    .map((p) => ({
      id: String(p.player_id),
      slot: "BN",
      name: p.name,
      pos: p.position,
      team: p.team || null,
      proj: num(p.myProjPts) ?? 0,
      floor: num(p.myFloor),
      ceiling: num(p.myCeiling),
      pts: num(playerPoints?.[p.player_id]),
    }))
    .sort((a, b) => b.proj - a.proj)
    .slice(0, MAX_BENCH);
}

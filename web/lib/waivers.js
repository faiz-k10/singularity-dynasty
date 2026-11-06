// "Best available" for one saved league (the matchup panel, app/my-team/WaiverWire.js): every QB / RB / WR / TE with
// a projection this week who is on no roster in that league, ranked by our weekly projection, with Sleeper's
// "trending adds" count beside it. Sleeper's public API doesn't say which players are on waivers vs free agency, so
// this is "available" in both senses. Pure, tested in test/waivers.test.mjs; the gathering lives in the server
// action getWaiverWire (app/my-team/actions.js).
import { normalizePlayerName } from "./portfolio.js";
import { isBye } from "./bye.js";
import { teamCode } from "./gameStatus.js";

export const WAIVER_POSITIONS = ["QB", "RB", "WR", "TE"];
// Per position in the answer; the panel shows the top 10 of whichever filter is picked, "Show more" up to this.
export const PER_POSITION = 15;

// Sleeper's player dictionary (lib/sleeper.js getSleeperPlayers) -> name+position lookup of NFL-rostered players.
// Two players can share a name and position (rare); the team then decides.
export function sleeperIndex(dict) {
  const idx = new Map();
  for (const [id, p] of Object.entries(dict || {})) {
    if (!p?.team || !WAIVER_POSITIONS.includes(p.position)) continue;
    const key = `${normalizePlayerName(`${p.first_name || ""} ${p.last_name || ""}`)}|${p.position}`;
    idx.set(key, [...(idx.get(key) || []), { id, team: p.team }]);
  }
  return idx;
}

function sleeperIdFor(row, idx) {
  const hits = idx.get(`${normalizePlayerName(row.player_name)}|${row.position}`) || [];
  if (hits.length === 1) return hits[0].id;
  return hits.find((h) => teamCode(h.team) === teamCode(row.team))?.id || null; // Sleeper says LAR, the rankings LA
}

// rows: this week's redraft_rankings rows (player_name, position, team, opponent, is_home, projection, floor, ceiling,
// rank, notes). rostered: Set of Sleeper ids on any roster in the league (starters, bench, IR, taxi). trending:
// [{ player_id, count }] from Sleeper. maxRank: the viewer's weekly-rankings depth (50 for free accounts, so this
// shows nothing the rankings page itself doesn't). Returns { players, hidden } -- hidden = available players past
// maxRank, for the upgrade line.
export function buildWaiverList({ rows, rostered, idx, maxRank = Infinity, perPosition = PER_POSITION }) {
  // Position rank among everyone we project, so "WR 34" means the same as on Weekly Projection Rankings.
  const byPos = {};
  for (const r of rows || []) if (WAIVER_POSITIONS.includes(r.position)) (byPos[r.position] ||= []).push(r);
  const posRank = new Map();
  for (const list of Object.values(byPos)) {
    [...list].sort((a, b) => a.rank - b.rank).forEach((r, i) => posRank.set(r, i + 1));
  }
  const out = [];
  let hidden = 0;
  for (const r of rows || []) {
    if (!WAIVER_POSITIONS.includes(r.position) || isBye(r.opponent)) continue;
    if (typeof r.projection !== "number" || r.projection <= 0) continue; // listed out / not expected to play
    const id = sleeperIdFor(r, idx);
    if (!id || rostered.has(id)) continue; // can't confirm he's available, or he isn't
    if (r.rank > maxRank) {
      hidden++;
      continue;
    }
    out.push({
      id,
      name: r.player_name,
      pos: r.position,
      team: r.team,
      opponent: r.opponent,
      isHome: r.is_home ?? null,
      proj: Number(r.projection),
      floor: r.floor == null ? null : Number(r.floor),
      ceiling: r.ceiling == null ? null : Number(r.ceiling),
      rank: r.rank,
      posRank: posRank.get(r) ?? null,
    });
  }
  out.sort((a, b) => b.proj - a.proj || a.rank - b.rank);
  const kept = [];
  const count = {};
  for (const p of out) {
    count[p.pos] = (count[p.pos] || 0) + 1;
    if (count[p.pos] <= perPosition) kept.push(p);
  }
  return { players: kept, hidden };
}

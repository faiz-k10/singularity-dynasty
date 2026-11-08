// The Observatory's rows (app/tools/lab/page.js): one per player in this week's Weekly Projection Rankings, every number The Observatory can chart under `m`
// (keys from lib/labMetrics.js), his percentile at his position for each under `pct`, and his games this season under `g` for the game-log
// chart. Percentiles are worked out over the WHOLE ranked pool before the free slice is cut, so a free visitor sees the same percentile a
// paid one does; the slice itself is cut here, so a free page never carries the other rows. Pure; tested in test/labData.test.mjs.
import { LAB_METRICS } from "./labMetrics.js";
import { seasonLine, percentiles } from "./labCalc.js";
import { isBye } from "./bye.js";

const isNum = (v) => typeof v === "number" && Number.isFinite(v);
const WEEKLY_KEYS = ["projection", "floor", "ceiling", "rank", "passing_yards", "passing_tds", "passing_interceptions", "rushing_yards", "rushing_tds", "receptions", "receiving_yards", "receiving_tds"];
const PROFILE_KEYS = LAB_METRICS.filter((m) => m.group === "Usage & role" || m.group === "Efficiency & output" || m.group === "Touchdowns").map((m) => m.key);

// ranked:   enriched Weekly Projection Rankings rows, the WHOLE pool in rank order (redraft-rankings/data.js enrichRankings, full access)
// games:    { name: { g: [[week, pts, xfp, opp], ...] this season, oldest first, ly: [games, points] last season } }
// sims:     { name: { median, floor, ceiling, pace } } for Singularity, or null (the season simulation numbers are then left out entirely)
// limit:    how many of the ranked rows this viewer may see (50 for free, Infinity for Explorer and Singularity)
export function buildLabRows({ ranked, games = {}, sims = null, limit = Infinity }) {
  const all = (ranked || []).map((r) => {
    const bye = isBye(r.opponent);
    const m = {};
    if (!bye) {
      for (const k of WEEKLY_KEYS) if (isNum(r[k])) m[k] = r[k];
      if (isNum(r.floor) && isNum(r.ceiling)) m.range = Math.round((r.ceiling - r.floor) * 10) / 10;
    }
    for (const k of PROFILE_KEYS) if (isNum(r[k])) m[k] = r[k];
    const log = games[r.player_name];
    Object.assign(m, seasonLine(log?.g));
    if (log?.ly && log.ly[0] > 0) m.lyPpg = Math.round((log.ly[1] / log.ly[0]) * 100) / 100;
    const s = sims?.[r.player_name];
    if (s) {
      if (isNum(s.median)) m.s_median = s.median;
      if (isNum(s.floor)) m.s_floor = s.floor;
      if (isNum(s.ceiling)) m.s_ceiling = s.ceiling;
      if (isNum(s.pace)) m.s_pace = s.pace;
    }
    return {
      name: r.player_name,
      pos: r.position,
      team: r.team || null,
      opp: bye ? null : r.opponent || null,
      home: Boolean(r.is_home),
      bye,
      headshot: r.bio?.headshot || null,
      m,
      g: log?.g || [],
      off: log?.off || [],
    };
  });
  const pct = percentiles(all, LAB_METRICS);
  return {
    rows: all.slice(0, limit).map((r) => ({ ...r, pct: pct[r.name] || {} })),
    total: all.length,
  };
}

// Game-log rows ({ player_name, team, season, week, opponent, fantasy_points_ppr, exp_points_ppr }) -> the `games` map above (each player also
// carries `off`: [[week, "B" | "I"], ...] for every week up to the last logged one with no game of his own -- "B" when his team had no game that
// week (its bye), "I" when his team played and he did not, which the log can only mean as missed for injury or inactivity). `season` is this
// season; the season before it only feeds last season's points per game.
export function indexLabGames(logRows, season) {
  const out = {};
  const teamWeeks = {}; // team -> weeks it played this season (any player's row proves a game)
  const teams = {}; // name -> [[week, team], ...] this season
  let lastWeek = 0;
  for (const r of logRows || []) {
    if (!isNum(r.fantasy_points_ppr)) continue;
    const e = (out[r.player_name] ??= { g: [], ly: [0, 0], off: [] });
    if (r.season === season && r.team) {
      (teamWeeks[r.team] ??= new Set()).add(r.week);
      (teams[r.player_name] ??= []).push([r.week, r.team]);
      if (r.week > lastWeek) lastWeek = r.week;
    }
    if (r.season === season) e.g.push([r.week, Math.round(r.fantasy_points_ppr * 100) / 100, isNum(r.exp_points_ppr) ? Math.round(r.exp_points_ppr * 100) / 100 : null, r.opponent || null]);
    else if (r.season === season - 1) {
      e.ly[0] += 1;
      e.ly[1] += r.fantasy_points_ppr;
    }
  }
  for (const [name, e] of Object.entries(out)) {
    e.g.sort((a, b) => a[0] - b[0]);
    const mine = (teams[name] || []).sort((a, b) => a[0] - b[0]);
    if (!mine.length) continue;
    const played = new Set(e.g.map((g) => g[0]));
    for (let w = 1; w <= lastWeek; w++) {
      if (played.has(w)) continue;
      let team = mine[0][1]; // the team on his latest game at or before w (his first game's team before that)
      for (const [gw, t] of mine) if (gw <= w) team = t;
      const weeks = teamWeeks[team];
      if (weeks) e.off.push([w, weeks.has(w) ? "I" : "B"]);
    }
  }
  return out;
}

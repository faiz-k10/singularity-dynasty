import { unstable_cache } from "next/cache";
import { createPublicClient } from "@/lib/supabase/public";
import { fetchAllRows } from "@/lib/fetchAllRows";
import { buildStatPoolByPos, computeStatPercentiles } from "@/lib/statPercentiles";
import { computeRegressionScore } from "@/lib/regressionScore";
import { computeOutcomePercentile } from "@/lib/outcomePercentile";
import { normalizePlayerName } from "@/lib/portfolio";

const GAMES_PER_SEASON = 17;

// Week-scrubber data for the Player Season Simulations pace panel. Kept off
// the page's own payload on purpose: the page ships only the latest week,
// and the browser asks the /api/player-sim-history route for a player's
// earlier-week snapshots (and the per-week Similar Shape pools) the first
// time they are needed. Each input below is cached on its own so no single
// cache entry nears Next's 2MB data-cache limit as the season fills in.
const getLatestInputs = unstable_cache(
  async () => {
    const pub = createPublicClient();
    const { data: latest } = await pub
      .from("player_simulations")
      .select("season, week")
      .order("season", { ascending: false })
      .order("week", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (!latest) return { latest: null, latestRows: [] };
    const latestRows = await fetchAllRows(
      pub,
      "player_simulations",
      "player_name, position, floor, median, ceiling, stat_ranges",
      (q) => q.eq("season", latest.season).eq("week", latest.week).order("median", { ascending: false })
    );
    return { latest, latestRows };
  },
  ["sim-history-latest"],
  { revalidate: 60 }
);

const getHistoryRows = unstable_cache(
  async (season, week) => {
    const pub = createPublicClient();
    return fetchAllRows(pub, "player_simulations", "player_name, week, floor, median, ceiling, stat_ranges", (q) =>
      q.eq("season", season).lt("week", week).order("week", { ascending: true })
    );
  },
  ["sim-history-rows"],
  { revalidate: 60 }
);

const getGameRows = unstable_cache(
  async (season) => {
    const pub = createPublicClient();
    return fetchAllRows(
      pub,
      "player_game_log",
      "player_name, season, week, opponent, is_home, fantasy_points_ppr",
      (q) => q.eq("season", season).order("week", { ascending: true })
    );
  },
  ["sim-history-games"],
  { revalidate: 60 }
);

// Everything the builders below need, fetched (cached) together.
export async function loadSimHistoryContext() {
  const { latest, latestRows } = await getLatestInputs();
  if (!latest) return null;
  const [historyRows, gameRows] = await Promise.all([getHistoryRows(latest.season, latest.week), getGameRows(latest.season)]);

  const posByName = {};
  latestRows.forEach((r) => (posByName[r.player_name] = r.position));
  const rowByName = {};
  latestRows.forEach((r) => (rowByName[r.player_name] = r));

  const gamesByName = {};
  let lastGameWeek = 0;
  for (const g of gameRows) {
    (gamesByName[g.player_name] ??= []).push(g);
    if (g.week > lastGameWeek) lastGameWeek = g.week;
  }

  // Each sim week's full pool, ranked against itself for stat percentiles.
  const poolByWeek = { [latest.week]: latestRows };
  for (const h of historyRows) {
    if (!posByName[h.player_name]) continue;
    (poolByWeek[h.week] ??= []).push({ ...h, position: posByName[h.player_name] });
  }
  const percByWeek = {};
  for (const [wk, rows] of Object.entries(poolByWeek)) {
    const pool = buildStatPoolByPos(rows);
    const m = {};
    for (const r of rows) m[r.player_name] = computeStatPercentiles(r, pool);
    percByWeek[wk] = m;
  }
  const historyByName = {};
  for (const h of historyRows) (historyByName[h.player_name] ??= {})[h.week] = h;

  return { latest, latestRows, rowByName, gamesByName, lastGameWeek, poolByWeek, percByWeek, historyByName };
}

// "W3" = every game through week 3 and the projection as it stood after
// them (the sim published for week 4; the latest sim stands in past it).
export function buildSnapshots(ctx, name) {
  const row = ctx.rowByName[name];
  if (!row) return [];
  const games = ctx.gamesByName[name] || [];
  const byWeek = { ...(ctx.historyByName[name] || {}), [ctx.latest.week]: row };
  const out = [];
  for (let w = 1; w <= ctx.lastGameWeek; w++) {
    const simWeek = Math.min(w + 1, ctx.latest.week);
    const proj = byWeek[simWeek];
    if (!proj) continue;
    const played = games.filter((g) => g.week <= w);
    const pts = played.map((g) => g.fantasy_points_ppr).filter((v) => typeof v === "number");
    const reg = computeRegressionScore(pts, proj.median / GAMES_PER_SEASON);
    const oc = computeOutcomePercentile(pts, {
      floor: proj.floor,
      median: proj.median,
      ceiling: proj.ceiling,
      gamesPerSeason: GAMES_PER_SEASON,
    });
    const perc = ctx.percByWeek[simWeek]?.[name];
    out.push({
      week: w,
      simWeek,
      floor: proj.floor,
      median: proj.median,
      ceiling: proj.ceiling,
      gamesPlayed: pts.length,
      currentPPG: reg?.currentPPG ?? null,
      regressionScore: reg?.regressionScore ?? null,
      paceSeasonTotal: oc?.paceSeasonTotal ?? null,
      outcomePercentile: oc?.percentile ?? null,
      recentGames: played
        .slice(-3)
        .reverse()
        .map((g) => ({ season: g.season, week: g.week, opponent: g.opponent, is_home: g.is_home, fantasy_points_ppr: g.fantasy_points_ppr })),
      ...(proj.stat_ranges && perc ? { stat_ranges: proj.stat_ranges, ...perc } : {}),
    });
  }
  return out;
}

// Similar Shape comp pools for every earlier sim week (the latest week's
// pool already ships with the page), limited to the names the viewer may see.
export function buildPeersByWeek(ctx, visibleNames, bioByNamePos) {
  const out = {};
  for (const [wk, rows] of Object.entries(ctx.poolByWeek)) {
    if (Number(wk) === ctx.latest.week) continue;
    const bySig = {};
    for (const r of rows) {
      if (!r.stat_ranges || !visibleNames.has(r.player_name)) continue;
      const signature = Object.keys(r.stat_ranges).sort().join("|");
      (bySig[signature] ??= []).push({
        name: r.player_name,
        position: r.position,
        sleeperId: bioByNamePos[`${normalizePlayerName(r.player_name)}|${r.position}`]?.sleeperId || null,
        ...ctx.percByWeek[wk][r.player_name],
        stat_ranges: r.stat_ranges,
      });
    }
    out[wk] = bySig;
  }
  return out;
}

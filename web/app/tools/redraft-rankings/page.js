import Link from "next/link";
import { unstable_cache } from "next/cache";
import { resolveTier } from "@/lib/tier";
import { loadMyPlayers } from "@/lib/myPlayers";
import { indexLeans, flagFor } from "@/lib/defenseLeans";
import { createClient } from "@/lib/supabase/server";
import { createPublicClient } from "@/lib/supabase/public";
import { fetchAllRows } from "@/lib/fetchAllRows";
import { resolveSort, sortRows } from "@/lib/sortLink";
import { percentileRank, INVERTED_STATS } from "@/lib/statPercentiles";
import { getPlayerBiosByNamePos } from "@/lib/sleeper";
import { normalizePlayerName } from "@/lib/portfolio";
import SiteHeader from "../../SiteHeader";
import ExportCsvButton from "../ExportCsvButton";
import RedraftRankingsClient from "./RedraftRankingsClient";

export const metadata = {
  title: "Weekly Projection Rankings (PPR) — Singularity Dynasty",
  description:
    "Standard weekly projection rankings for every position, refreshed weekly and adjusted for matchup and opponent-strength data. Free top-50 access for every Stargazer.",
};

const PAID_TIERS = ["explorer", "singularity"];
const POSITION_ORDER = ["QB", "RB", "WR", "TE"];
// Flattened onto each row (see the scoring_stats spread below) so
// SortableTh/sortRows can reach them the same way as every other
// column -- sortRows compares row[sortKey] directly, no nested-path
// support, so these have to live at the top level, not buried in
// row.scoring_stats.
const STAT_COLUMN_KEYS = [
  "passing_yards", "passing_tds", "passing_interceptions",
  "rushing_yards", "rushing_tds",
  "receptions", "receiving_yards", "receiving_tds",
];
const OVERALL_COLUMN_TYPES = {
  rank: "number",
  player_name: "string",
  position: "string",
  team: "string",
  opponent: "string",
  floor: "number",
  ceiling: "number",
  notes: "string",
  ...Object.fromEntries(STAT_COLUMN_KEYS.map((k) => [k, "number"])),
};

// Position-relative heat-tint for a numeric column -- QBs score far
// higher raw totals than TEs, so a global min/max would make every QB
// look "hot" regardless of how they actually rank among their own
// position. Null-safe: rows published before migration 0029 (floor/
// ceiling didn't exist yet) carry null and are excluded from the range
// and rendered at heat 0 (formatProjection shows them as "--").
function heatByPosition(rows, col) {
  const rangeByPos = {};
  for (const r of rows) {
    if (r[col] == null) continue;
    const range = rangeByPos[r.position] || { min: Infinity, max: -Infinity };
    range.min = Math.min(range.min, r[col]);
    range.max = Math.max(range.max, r[col]);
    rangeByPos[r.position] = range;
  }
  return (r) => {
    if (r[col] == null) return 0;
    const range = rangeByPos[r.position];
    return range && range.max > range.min ? (r[col] - range.min) / (range.max - range.min) : 0;
  };
}

// Real percentile rank (not the linear min/max heat above) for each row's
// Floor/Projection/Ceiling plus the advanced usage metrics attached
// below (WOPR/Target Share/YAC Above Exp/xFP, then RYOE/Scramble Rate/
// Play-Action Rate) -- feeds WeeklyDetailRow's expanded-row percentile
// panel, where a real number ("62nd percentile") is worth showing
// alongside the plain relative heat-tint the inline columns use. Same
// percentileRank() Player Season Simulations uses
// (lib/statPercentiles.js), just against a one-value-per-player pool here
// instead of a floor/median/ceiling triple per player. The 8 raw
// scoring_stats columns (Pass Yds, Rush Yds, ...) used to be in this list
// too -- replaced by request with these usage/efficiency metrics, which
// say more about WHY a player is projected where they are than the raw
// weekly stat averages (already visible as their own inline columns).
const PERCENTILE_KEYS = [
  "floor", "projection", "ceiling",
  "wopr", "targetShare", "yacAboveExp", "avgXfp",
  "ryoe", "scrambleRate", "playActionRate",
];
function buildPoolsByPosition(rows, keys) {
  const pools = {};
  for (const r of rows) {
    const pool = (pools[r.position] ??= {});
    for (const k of keys) {
      const v = r[k];
      if (v == null) continue;
      (pool[k] ??= []).push(v);
    }
  }
  return pools;
}
function attachStatPercentiles(rows) {
  const pools = buildPoolsByPosition(rows, PERCENTILE_KEYS);
  return rows.map((r) => {
    const pool = pools[r.position] || {};
    const statPct = {};
    for (const k of PERCENTILE_KEYS) {
      const v = r[k];
      if (v == null) continue;
      statPct[k] = percentileRank(v, pool[k], INVERTED_STATS.has(k));
    }
    return { ...r, statPct };
  });
}

// WOPR (receiving usage), RYOE (RB/QB rushing efficiency), Scramble Rate/
// Play-Action Rate (QB only), and Target Share/YAC Above Exp (WR/TE
// only, median of their season floor/median/ceiling range) all come from
// Player Season Simulations' own latest published batch -- a separate
// table/pipeline from redraft_rankings, joined here by player_name only
// (no week alignment assumed; player_simulations republishes on its own
// weekly cadence, same season). Null for any player not yet in that
// table (a brand-new call-up, or before the season's first Player Sims
// publish) -- WeeklyDetailRow already renders "no data" as simply
// omitting that row, same as every other nullable metric here.
async function fetchSimsMetrics(supabase) {
  const { data: latest } = await supabase
    .from("player_simulations")
    .select("season, week")
    .order("season", { ascending: false })
    .order("week", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!latest) return {};

  // ryoe/scramble_rate/play_action_rate (migration 0033) may not exist
  // yet in a given Supabase project until that migration's been run by
  // hand (this repo has no direct DDL access, see CLAUDE.md) -- selecting
  // a column that doesn't exist fails the WHOLE query, not just those
  // fields, so this falls back to the pre-0033 column set rather than
  // losing wopr/target_share/yac_above_exp too while the migration is
  // still pending.
  let { data, error } = await supabase
    .from("player_simulations")
    .select("player_name, wopr, ryoe, scramble_rate, play_action_rate, stat_ranges")
    .eq("season", latest.season)
    .eq("week", latest.week);

  if (error) {
    console.error("player_simulations: migration 0033 columns unavailable, falling back:", error.message);
    ({ data } = await supabase
      .from("player_simulations")
      .select("player_name, wopr, stat_ranges")
      .eq("season", latest.season)
      .eq("week", latest.week));
  }

  const byName = {};
  for (const r of data || []) {
    byName[r.player_name] = {
      wopr: r.wopr,
      targetShare: r.stat_ranges?.target_share?.median ?? null,
      yacAboveExp: r.stat_ranges?.yac_above_exp?.median ?? null,
      ryoe: r.ryoe ?? null,
      scrambleRate: r.scramble_rate ?? null,
      playActionRate: r.play_action_rate ?? null,
    };
  }
  return byName;
}

// player_game_log already holds only the trailing two regular seasons
// (see its own migration comment), so this pulls the whole table once --
// no season filter needed at the query level -- and derives four
// different things from that one fetch per player:
//   - avgXfp: THIS season's average xFP/game so far. xFP (ffopportunity's
//     modeled points from that game's real opportunity -- targets, air
//     yards, carries, situation) is retrospective, one row per COMPLETED
//     game, so there's no pre-game xFP for the upcoming week these
//     rankings project -- "current" here means season-to-date usage, not
//     another projection of this week.
//   - recentGames: the player's last 5 logged games regardless of season
//     boundary (so early in a new season, before 5 games exist yet, this
//     naturally tails off into the end of last season instead of coming
//     up empty) -- feeds the expanded row's game-log panel AND
//     achievements.js's On Fire/On Thin Ice flags (each game here carries its
//     own week's floor/ceiling/median, joined in from floorCeilingByGame --
//     see fetchHistoricalFloorCeiling below).
//   - lastWeekRankByName: this player's finish among their own position
//     in the most recent ACTUAL week on record -- "most recent" here
//     just means the newest (season, week) with any logged games at all
//     (the query already arrives season/week descending), since real
//     results for the CURRENT projection week can't exist yet by
//     definition. Powers the expanded row's player-header panel.
//   - heroWinsByName: how many (season, week, position) groups THIS
//     SEASON this player finished in the top 3 scorers at their own
//     position -- "Weekly Hero" in achievements.js.
// Paginated (fetchAllRows): the table is ~7,500 rows and Supabase hard-caps a
// single request at 1000, which used to silently cut this to the newest 1000
// games (so this season's xFP average and Weekly Hero counts were partial).
function fetchGameLogRows(supabase) {
  return fetchAllRows(
    supabase,
    "player_game_log",
    "player_name, position, season, week, opponent, is_home, fantasy_points_ppr, exp_points_ppr",
    (q) => q.order("season", { ascending: false }).order("week", { ascending: false }).order("player_name", { ascending: true })
  );
}

function deriveGameLogData(data, season, floorCeilingByGame) {
  // Each game's finish at his position that week (1 = highest PPR score among everyone logged at the position),
  // shown as the rightmost column of the Recent Games panel.
  const posRankByGame = {};
  const byWeekPosition = {};
  for (const r of data || []) {
    if (r.fantasy_points_ppr == null) continue;
    (byWeekPosition[`${r.season}|${r.week}|${r.position}`] ??= []).push(r);
  }
  for (const rows of Object.values(byWeekPosition)) {
    [...rows]
      .sort((a, b) => b.fantasy_points_ppr - a.fantasy_points_ppr)
      .forEach((r, i) => {
        posRankByGame[`${r.player_name}|${r.season}|${r.week}`] = i + 1;
      });
  }

  const byPlayer = {};
  for (const r of data || []) {
    const fc = floorCeilingByGame[`${r.player_name}|${r.season}|${r.week}`] || {};
    (byPlayer[r.player_name] ??= []).push({
      ...r,
      floor: fc.floor ?? null,
      ceiling: fc.ceiling ?? null,
      median: fc.median ?? null,
      posRank: posRankByGame[`${r.player_name}|${r.season}|${r.week}`] ?? null,
    });
  }

  const avgXfpByName = {};
  const recentGamesByName = {};
  for (const [name, games] of Object.entries(byPlayer)) {
    const thisSeasonXfp = games.filter((g) => g.season === season && g.exp_points_ppr != null);
    if (thisSeasonXfp.length > 0) {
      avgXfpByName[name] = thisSeasonXfp.reduce((sum, g) => sum + g.exp_points_ppr, 0) / thisSeasonXfp.length;
    }
    // Rows already arrive season/week descending from the query above.
    recentGamesByName[name] = games.slice(0, 5);
  }

  const lastWeekRankByName = {};
  if (data && data.length > 0) {
    const { season: lwSeason, week: lwWeek } = data[0];
    const byPos = {};
    for (const r of data) {
      if (r.season === lwSeason && r.week === lwWeek && r.fantasy_points_ppr != null) {
        (byPos[r.position] ??= []).push(r);
      }
    }
    for (const rows of Object.values(byPos)) {
      rows.sort((a, b) => b.fantasy_points_ppr - a.fantasy_points_ppr);
      rows.forEach((r, i) => {
        lastWeekRankByName[r.player_name] = { rank: i + 1, points: r.fantasy_points_ppr, season: lwSeason, week: lwWeek };
      });
    }
  }

  // Tracks the actual (season, week) of each win, not just a count -- a
  // real week 17 WR1 finish reads as a bug at a glance if all the UI
  // shows is "1x Weekly Hero" sitting right next to THIS week's own
  // positional rank or last week's unrelated finish. Newest win first so
  // the tooltip can lead with the most recent one. Scoped to THIS season
  // only (by request) -- player_game_log holds two trailing seasons for
  // the game-log panel/avgXfp above, but a hero win from last season
  // read as stale/confusing sitting next to this season's own numbers,
  // so this filters `data` down before grouping instead of reusing it
  // as-is like the rest of this function does.
  // HERO_WIN_SLOTS (not just the outright #1) -- by request, the top 3
  // scorers at each position each week all get a win, not only the
  // single highest. Sorted descending and sliced to exactly 3 recipients
  // (not "however many tie for 3rd") to keep the count predictable: 4
  // positions x 1 played week = 12 badges handed out right now, not an
  // unbounded number if the market has a tight 3-way tie at the top.
  const HERO_WIN_SLOTS = 3;
  const heroWinsByName = {};
  const byWeekPos = {};
  for (const r of data || []) {
    if (r.fantasy_points_ppr == null || r.season !== season) continue;
    (byWeekPos[`${r.season}|${r.week}|${r.position}`] ??= []).push(r);
  }
  for (const rows of Object.values(byWeekPos)) {
    const winners = rows.sort((a, b) => b.fantasy_points_ppr - a.fantasy_points_ppr).slice(0, HERO_WIN_SLOTS);
    for (const r of winners) {
      const entry = (heroWinsByName[r.player_name] ??= { count: 0, weeks: [] });
      entry.count += 1;
      entry.weeks.push({ season: r.season, week: r.week });
    }
  }
  for (const entry of Object.values(heroWinsByName)) {
    entry.weeks.sort((a, b) => b.season - a.season || b.week - a.week);
  }

  return { avgXfpByName, recentGamesByName, lastWeekRankByName, heroWinsByName };
}

// Historical Floor/Ceiling per (player, season, week) -- redraft_rankings
// accumulates one row per player per PUBLISHED week rather than
// overwriting the previous week's rows (the rest of this page only ever
// reads the latest week out of it), so past weeks' projections are still
// sitting in the table and can be matched up against player_game_log's
// real result for that same week. That's what lets On Fire ("beat that
// week's own ceiling") and On Thin Ice ("missed that week's own floor") judge
// a past game against the number that was actually projected for it,
// instead of against this week's unrelated projection. Rows published
// before migration 0029 predate floor/ceiling entirely and read null,
// same as the live table already handles.
async function fetchHistoricalFloorCeiling(supabase) {
  // Paginated for the same reason as fetchGameLogRows: the table passes 2,000
  // rows and one request returns at most 1000.
  const data = await fetchAllRows(
    supabase,
    "redraft_rankings",
    "player_name, season, week, floor, ceiling, projection",
    (q) => q.order("season", { ascending: true }).order("week", { ascending: true }).order("player_name", { ascending: true })
  );
  const map = {};
  for (const r of data || []) {
    map[`${r.player_name}|${r.season}|${r.week}`] = { floor: r.floor, ceiling: r.ceiling, median: r.projection };
  }
  return map;
}

function sortPositions(positions) {
  return [...positions].sort((a, b) => {
    const ai = POSITION_ORDER.indexOf(a);
    const bi = POSITION_ORDER.indexOf(b);
    if (ai === -1 && bi === -1) return a.localeCompare(b);
    if (ai === -1) return 1;
    if (bi === -1) return -1;
    return ai - bi;
  });
}

// Everything below that is the same for every visitor (the latest week's
// rows, the per-player game-log stats, the Sims-derived metrics) is fetched
// once, in parallel, and cached for 60s -- the page used to run seven
// Supabase round trips back to back on every load, two of them whole-table
// reads. Tier gating (top 50 vs everything) happens afterwards, in JS, on
// this cached result, so a free visitor's page still never contains the extra
// rows. Trimmed to the players actually ranked this week so each cache entry
// stays well under Next's 2MB limit.
const getCachedRedraftData = unstable_cache(
  async () => {
    const publicSupabase = createPublicClient();
    const { data: latest } = await publicSupabase
      .from("redraft_rankings")
      .select("season, week")
      .order("season", { ascending: false })
      .order("week", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (!latest) return { latest: null, rows: [] };

    const [rows, floorCeilingByGame, simsByName, gameLogRows] = await Promise.all([
      fetchAllRows(
        publicSupabase,
        "redraft_rankings",
        "rank, player_name, position, team, opponent, is_home, projection, floor, ceiling, matchup_mult, trend, sample_confidence, scoring_stats, notes",
        (q) => q.eq("season", latest.season).eq("week", latest.week).order("rank", { ascending: true })
      ),
      fetchHistoricalFloorCeiling(publicSupabase),
      fetchSimsMetrics(publicSupabase),
      fetchGameLogRows(publicSupabase),
    ]);
    const gameLog = deriveGameLogData(gameLogRows, latest.season, floorCeilingByGame);

    const ranked = new Set(rows.map((r) => r.player_name));
    const only = (byName) => Object.fromEntries(Object.entries(byName).filter(([name]) => ranked.has(name)));
    return {
      latest,
      rows,
      simsByName: only(simsByName),
      avgXfpByName: only(gameLog.avgXfpByName),
      recentGamesByName: only(gameLog.recentGamesByName),
      lastWeekRankByName: only(gameLog.lastWeekRankByName),
      heroWinsByName: only(gameLog.heroWinsByName),
    };
  },
  ["redraft-rankings-latest-week-v2"],
  { revalidate: 60 }
);

// Defense-vs-position trends (model/defense_impact.R -> defense_leans), the newest week published.
// Optional by design: a missing table or an empty result just means no flags, never an error.
const getCachedLeans = unstable_cache(
  async () => {
    try {
      const pub = createPublicClient();
      const { data: latest } = await pub
        .from("defense_leans")
        .select("season, week")
        .order("season", { ascending: false })
        .order("week", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (!latest) return [];
      const { data } = await pub
        .from("defense_leans")
        .select("defense, position, call, score, effect, rank_now, rank_prior")
        .eq("season", latest.season)
        .eq("week", latest.week);
      return data || [];
    } catch {
      return [];
    }
  },
  ["defense-leans-latest"],
  { revalidate: 60 }
);

// Touchdown profile for WRs and TEs (model/td_profile.R -> player_groups, kind "td_profile"): expected TDs per
// game, chance of 2+ TDs in a game, inside-10 targets per game and share of targets. Display only. Optional by
// design: nothing published (or an error) just leaves the panel's "not enough games" note.
const getCachedTdProfile = unstable_cache(
  async () => {
    try {
      const pub = createPublicClient();
      const { data: latest } = await pub
        .from("player_groups")
        .select("season, week")
        .eq("kind", "td_profile")
        .order("season", { ascending: false })
        .order("week", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (!latest) return {};
      const { data } = await pub
        .from("player_groups")
        .select("player_name, detail")
        .eq("kind", "td_profile")
        .eq("season", latest.season)
        .eq("week", latest.week)
        .limit(1000);
      return Object.fromEntries((data || []).filter((r) => r.detail).map((r) => [r.player_name, r.detail]));
    } catch {
      return {};
    }
  },
  ["td-profile-latest"],
  { revalidate: 60 }
);

// Where each WR/TE ranks on the four touchdown-profile numbers (1 = highest), among EVERY ranked player at his
// position that has a profile -- not just the rows a free visitor can see, so a rank means the same thing on every
// tier. Ties share the better rank. Only the rank and the pool size are exposed, never other players' values.
const TD_RANK_KEYS = { p2Td: "p2", i10Pg: "i10_pg", i10Share: "i10_share" };
function tdRanksByName(rows, tdProfile) {
  const pools = {};
  for (const r of rows) {
    const d = tdProfile[r.player_name];
    if (!d) continue;
    for (const [k, src] of Object.entries(TD_RANK_KEYS)) {
      if (d[src] != null) ((pools[r.position] ??= {})[k] ??= []).push(d[src]);
    }
  }
  const out = {};
  for (const r of rows) {
    const d = tdProfile[r.player_name];
    if (!d) continue;
    const ranks = {};
    for (const [k, src] of Object.entries(TD_RANK_KEYS)) {
      const pool = pools[r.position]?.[k];
      if (d[src] == null || !pool) continue;
      ranks[k] = { rank: 1 + pool.filter((v) => v > d[src]).length, of: pool.length };
    }
    out[r.player_name] = ranks;
  }
  return out;
}

// Stargazer sees the top 50 only; Explorer/Singularity see the full
// list — matches the pricing copy's "Weekly Projection Rankings (Top
// 50)" Stargazer bullet.
export default async function RedraftRankingsPage({ searchParams }) {
  const params = await searchParams;

  // Tier (auth + profile) is per-visitor, the cached bundle and the Sleeper
  // bios aren't -- all three run at once.
  const supabase = await createClient();
  const [{ tier, mine }, cached, bioByNamePos, leanRows, tdProfile] = await Promise.all([
    // Per-visitor like the tier: their saved teams (own rows only) for the My players view.
    resolveTier(supabase).then(async (r) => ({ ...r, mine: await loadMyPlayers(supabase, r.user) })),
    getCachedRedraftData(),
    getPlayerBiosByNamePos(),
    getCachedLeans(),
    getCachedTdProfile(),
  ]);
  const hasFullAccess = PAID_TIERS.includes(tier);
  const { latest } = cached;

  let rankings = [];
  let totalCount = 0;

  if (latest) {
    totalCount = cached.rows.length;
    const data = hasFullAccess ? cached.rows : cached.rows.slice(0, 50);
    const { simsByName, avgXfpByName, recentGamesByName, lastWeekRankByName, heroWinsByName } = cached;
    const tdRanks = tdRanksByName(cached.rows, tdProfile);

    // Position-relative rank (RB1, WR23, ...) computed once from the
    // natural rank order -- stays fixed on each row even if the table is
    // later re-sorted by a different column via SortableTh. Counted over the
    // rows shown (as before), so a free visitor's top-50 labels are the same.
    const positionCounters = {};
    rankings = data.map((r) => {
      positionCounters[r.position] = (positionCounters[r.position] || 0) + 1;
      return { ...r, ...r.scoring_stats, positionLabel: `${r.position}${positionCounters[r.position]}` };
    });

    rankings = rankings.map((r) => {
      const sims = simsByName[r.player_name] || {};
      return {
        ...r,
        wopr: sims.wopr ?? null,
        targetShare: sims.targetShare ?? null,
        yacAboveExp: sims.yacAboveExp ?? null,
        avgXfp: avgXfpByName[r.player_name] ?? null,
        ryoe: sims.ryoe ?? null,
        scrambleRate: sims.scrambleRate ?? null,
        playActionRate: sims.playActionRate ?? null,
        p2Td: tdProfile[r.player_name]?.p2 ?? null,
        i10Pg: tdProfile[r.player_name]?.i10_pg ?? null,
        i10Share: tdProfile[r.player_name]?.i10_share ?? null,
        tdRank: tdRanks[r.player_name] || null,
        recentGames: recentGamesByName[r.player_name] || [],
        lastWeekRank: lastWeekRankByName[r.player_name] || null,
        heroWins: heroWinsByName[r.player_name]?.count || 0,
        heroWinWeeks: heroWinsByName[r.player_name]?.weeks || [],
        bio: bioByNamePos[`${normalizePlayerName(r.player_name)}|${r.position}`] || null,
      };
    });

    const floorHeatFor = heatByPosition(rankings, "floor");
    const ceilingHeatFor = heatByPosition(rankings, "ceiling");
    rankings = rankings.map((r) => ({
      ...r,
      floorHeat: floorHeatFor(r),
      ceilingHeat: ceilingHeatFor(r),
    }));
    // Matchup flags (smash / tough spot) from the strongest defense-vs-position trends. Display only --
    // nothing here feeds a projection.
    const leans = indexLeans(leanRows);
    rankings = rankings.map((r) => {
      const f = flagFor(leans, r.opponent, r.position);
      return f ? { ...r, defLean: f } : r;
    });
    rankings = attachStatPercentiles(rankings);
    // Buy Low/Sell High (achievements.js) need WOPR ranked WITHIN
    // position -- a raw WOPR cutoff shared across positions is wrong
    // (WOPR is receiving usage only, so RBs cluster far lower than WRs
    // even as true workhorses; a flat threshold either never fires for
    // RBs or fires on every low-volume WR). attachStatPercentiles above
    // already computes exactly that position-relative rank as
    // statPct.wopr -- reuse it here instead of a second cutoff.
    rankings = rankings.map((r) => ({ ...r, woprPercentile: r.statPct?.wopr ?? null }));
  }

  // Widest floor-to-ceiling range this week -- the Outcome Curve column
  // scales each row's middle zone against this, so range width is
  // comparable across rows instead of just two separate digits.
  const maxSpread = rankings.reduce((m, r) => {
    const span = r.floor != null && r.ceiling != null ? r.ceiling - r.floor : 0;
    return Math.max(m, span);
  }, 1);

  const positions = sortPositions([...new Set(rankings.map((r) => r.position))]);

  const { sortKey, sortDir } = resolveSort(params, "rank", "asc");
  const overallRows = sortRows(
    rankings.map((r) => ({ ...r, displayRank: r.rank })),
    sortKey,
    sortDir,
    OVERALL_COLUMN_TYPES
  );
  const canExport = tier === "singularity" && rankings.length > 0;
  const isTeaser = !hasFullAccess && totalCount > 50;

  return (
    <div className="tool-page">
      <SiteHeader />

      <main className="wrap tool-wrap redraft-wrap">
        {rankings.length === 0 ? (
          <>
            <div className="eyebrow">
              {latest ? `Week ${latest.week} · ${latest.season}` : "Projections"}
            </div>
            <h1>Weekly Projection Rankings</h1>
            <p className="tool-sub">
              Standard weekly projection rankings, refreshed every week of the season and
              adjusted for opponent-strength and matchup efficiency data.
              Top 50 free for every Stargazer.
            </p>
            <div className="tool-empty">
              <p>
                Rankings publish weekly during the season — check back soon.
              </p>
            </div>
          </>
        ) : (
          <>
            <RedraftRankingsClient
              rawRows={overallRows}
              sortKey={sortKey}
              sortDir={sortDir}
              currentParams={params}
              positions={positions}
              maxSpread={maxSpread}
              mine={mine}
              gated={isTeaser}
              header={
                <>
                  <div className="eyebrow">
                    {latest ? `Week ${latest.week} · ${latest.season}` : "Projections"}
                  </div>
                  <h1>Weekly Projection Rankings</h1>
                  <p className="tool-sub">
                    Standard weekly projection rankings, refreshed every week of the season and
                    adjusted for opponent-strength and matchup efficiency data.
                    Top 50 free for every Stargazer.
                  </p>
                  <p className="matchup-legend">
                    <span className="def-flag def-flag-smash" aria-hidden="true">{"\u25B2"}</span> smash spot
                    <span className="def-flag def-flag-avoid" aria-hidden="true">{"\u25BC"}</span> tough spot
                    {" \u2014 "}the strongest defense-vs-position trends this season, beside the opponent. A signal to weigh, not part of the projections.
                  </p>
                  <div className="toggle-row-flex">
                    <div className="toggle-row-actions">
                      <Link href="/tools/compare-players" className="hub-panel-link">
                        Compare Players →
                      </Link>
                      {canExport && (
                        <ExportCsvButton
                          filename={`redraft-rankings-week${latest.week}-${latest.season}.csv`}
                          href="/api/redraft-rankings/csv"
                        />
                      )}
                    </div>
                  </div>
                </>
              }
            />

            {isTeaser && (
              <div className="tool-paywall reveal in">
                <p>
                  You&apos;re seeing the top 50 of {totalCount} players. Unlock
                  the full list with Explorer or Singularity.
                </p>
                <Link href="/#pricing" className="btn-primary">
                  See Pricing
                </Link>
              </div>
            )}
          </>
        )}
      </main>
    </div>
  );
}

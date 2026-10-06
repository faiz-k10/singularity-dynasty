import Link from "next/link";
import { unstable_cache } from "next/cache";
import { resolveTier } from "@/lib/tier";
import { createClient } from "@/lib/supabase/server";
import { createPublicClient } from "@/lib/supabase/public";
import { resolveSort, sortRows } from "@/lib/sortLink";
import { buildStatPoolByPos, computeStatPercentiles } from "@/lib/statPercentiles";
import { computeReplacementValues } from "@/lib/replacementValue";
import { computeRegressionScore } from "@/lib/regressionScore";
import { computeOutcomePercentile } from "@/lib/outcomePercentile";
import { getPlayerBiosByNamePos } from "@/lib/sleeper";
import { normalizePlayerName } from "@/lib/portfolio";
import { fetchAllRows } from "@/lib/fetchAllRows";
import { ARCHETYPE_NEAR_CONFIDENCE } from "@/lib/archetypes";
import { indexGameLog, missedWeeks, teamGamesThrough } from "@/lib/teamGames";
import SiteHeader from "../../SiteHeader";
import ExportCsvButton from "../ExportCsvButton";
import PlayerSimSearch from "../PlayerSimSearch";

export const metadata = {
  title: "Player Season Simulations — Floor/Median/Ceiling Projections — Singularity Dynasty",
  description:
    "10,000-run Monte Carlo season simulations for every fantasy football player, distilled to floor, median, and ceiling point totals. Free top-10 preview for every Stargazer.",
};

const TEASER_LIMIT = 10;
const GAMES_PER_SEASON = 17;
// Singularity-only per the pricing copy — Explorer does not include this,
// so both Stargazer and Explorer see the same top-10 teaser.
const PAID_TIERS = ["singularity"];
const POSITION_ORDER = ["QB", "RB", "WR", "TE"];
const COLUMN_TYPES = {
  rank: "number",
  player_name: "string",
  position: "string",
  team: "string",
  floor: "number",
  median: "number",
  ceiling: "number",
  por: "number",
  regressionScore: "number",
  outcomePercentile: "number",
};

// Role groups (RB/WR/TE) from the player_archetypes table: this sim week's rows, or the newest week
// that has any if archetypes haven't been published for this one yet. Optional by design -- a missing
// table or an empty result just means no archetype shows, never an error on the page.
async function loadArchetypes(client, latest) {
  try {
    let { data } = await client
      .from("player_archetypes")
      .select("player_name, archetype, runner_up, confidence, week")
      .eq("season", latest.season)
      .eq("week", latest.week);
    if (!data?.length) {
      const { data: newest } = await client
        .from("player_archetypes")
        .select("week")
        .eq("season", latest.season)
        .order("week", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (!newest) return {};
      ({ data } = await client
        .from("player_archetypes")
        .select("player_name, archetype, runner_up, confidence, week")
        .eq("season", latest.season)
        .eq("week", newest.week));
    }
    const out = {};
    for (const r of data || []) {
      out[r.player_name] = { a: r.archetype, ...(r.confidence != null && r.confidence < ARCHETYPE_NEAR_CONFIDENCE && r.runner_up ? { near: r.runner_up } : {}) };
    }
    return out;
  } catch {
    return {};
  }
}

// The full published week's data (all 425-ish rows) is identical for
// every visitor regardless of tier or the League Size / QB Format
// toggles -- gating happens afterward, in JS, on this same cached result
// (see poolRows/sims below). Caching the fetch itself is what makes the
// toggles fast: without it, every single toggle click is a full page
// navigation that re-runs two sequential Supabase round trips just to
// re-read data that hasn't changed since the last click. A 60s window is
// long enough that a burst of toggle clicks all hit the cache, short
// enough that a new weekly publish shows up within a minute without
// needing a manual revalidate.
const getCachedWeekData = unstable_cache(
  async () => {
    const publicSupabase = createPublicClient();
    const { data: latest } = await publicSupabase
      .from("player_simulations")
      .select("season, week")
      .order("season", { ascending: false })
      .order("week", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!latest) return { latest: null, rows: [], totalCount: 0, actualProductionByName: {} };

    const [{ data, count }, logRows, archetypeByName] = await Promise.all([
      publicSupabase
        .from("player_simulations")
        .select(
          "player_name, position, team, floor, median, ceiling, stat_ranges",
          { count: "exact" }
        )
        .eq("season", latest.season)
        .eq("week", latest.week)
        .order("median", { ascending: false }),
      // The season's game log: each player's real points by week (powers the
      // regression-to-projection score and pace below), his latest games, and
      // which games his team played. This is the same data
      // player_actual_production holds -- that table is built from this one --
      // so it is read once, here, instead of fetching both.
      // Paginated (fetchAllRows): Supabase's project-level API "max rows"
      // setting hard-caps any single request at 1000 regardless of an explicit
      // .limit() -- confirmed directly -- and this table passes 1000 rows a
      // few weeks into the season.
      fetchAllRows(
        publicSupabase,
        "player_game_log",
        "player_name, team, season, week, opponent, is_home, fantasy_points_ppr",
        (q) => q.eq("season", latest.season).order("week", { ascending: true })
      ),
      loadArchetypes(publicSupabase, latest),
    ]);

    const actualProductionByName = {};
    for (const g of logRows || []) {
      if (typeof g.fantasy_points_ppr === "number") (actualProductionByName[g.player_name] ??= []).push(g.fantasy_points_ppr);
    }
    // Only each player's latest three games ride on the page (the pace
    // panel's default view); earlier-week snapshots load on demand from
    // /api/player-sim-history. Games each player's TEAM has played (a bye is
    // not a game) let pace count the games he missed -- lib/teamGames.js.
    const gameIndex = indexGameLog(logRows);
    const lastGameWeek = gameIndex.lastGameWeek;
    const recentByName = {};
    const teamGamesByName = {};
    const missedWeeksByName = {};
    for (const [name, games] of Object.entries(gameIndex.gamesByName)) {
      recentByName[name] = games
        .slice(-3)
        .reverse()
        .map((g) => ({
          season: g.season,
          week: g.week,
          opponent: g.opponent,
          is_home: g.is_home,
          fantasy_points_ppr: g.fantasy_points_ppr,
        }));
      const n = teamGamesThrough(gameIndex, name);
      if (n != null) teamGamesByName[name] = n;
      const missed = missedWeeks(gameIndex, name);
      if (missed.length) missedWeeksByName[name] = missed;
    }

    return { latest, rows: data || [], totalCount: count || 0, actualProductionByName, recentByName, lastGameWeek, teamGamesByName, missedWeeksByName, archetypeByName };
  },
  ["player-simulations-latest-week"],
  { revalidate: 60 }
);

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

export default async function PlayerSimulationsPage({ searchParams }) {
  const params = await searchParams;
  const supabase = await createClient();
  // POR's replacement-level baseline depends on league settings the viewer
  // picks via the League Size / QB Format toggles -- unknown values fall
  // back to the standard 12-team, single-QB assumption.
  const leagueTeams = params?.teams === "10" ? 10 : 12;
  const superflex = params?.qb === "sf";

  // Tier resolution (auth + profile lookup) is per-visitor and can't be
  // cached, but it doesn't depend on the week's data, so it runs
  // concurrently with that (cached) fetch instead of one blocking the
  // other. Bio lookup (Sleeper headshot id, for Similar Shape's portrait)
  // is its own fetch too, not folded into getCachedWeekData -- it's
  // already memoized 24h at the module level (see lib/sleeper.js), so
  // there's no real caching benefit to bundling it into the 60s payload,
  // and keeping it separate mirrors how redraft-rankings' own expanded
  // row already does this same lookup.
  const [{ tier }, { latest, rows, totalCount: fetchedCount, actualProductionByName, recentByName, lastGameWeek, teamGamesByName, missedWeeksByName, archetypeByName }, bioByNamePos] =
    await Promise.all([resolveTier(supabase), getCachedWeekData(), getPlayerBiosByNamePos()]);
  const hasFullAccess = PAID_TIERS.includes(tier);

  let sims = [];
  let poolRows = [];
  let totalCount = 0;

  if (latest) {
    // Published floor/median/ceiling are season totals -- kept as-is here.
    // PlayerSimSearch converts to a per-game rate client-side for its Per
    // Game / Season toggle. Sorting, heat-tint, and the Range bar below
    // are unaffected either way: dividing every value by the same
    // constant doesn't change relative order or ratios. Not adjusted for
    // missed-game/injury scenarios: a trial where the player sits out
    // half the season still pulls the per-game rate down in that trial,
    // same as it pulls down the season total, since the simulation
    // doesn't publish a per-trial games-played count a true
    // injury-adjusted rate would need.
    // Position rank (QB1, RB2, ...) is assigned here, off the query's
    // fixed median-desc order (the FULL population, not a teaser-capped
    // slice), so it stays a stable "positional ranking" independent of
    // whatever column the viewer sorts the table by below.
    const posRankCounters = {};
    poolRows = rows.map((row, i) => {
      posRankCounters[row.position] = (posRankCounters[row.position] || 0) + 1;
      return { ...row, rank: i + 1, positionRank: posRankCounters[row.position] };
    });
    sims = hasFullAccess ? poolRows : poolRows.slice(0, TEASER_LIMIT);
    totalCount = fetchedCount;
  }

  const isTeaser = !hasFullAccess && totalCount > sims.length;
  const { sortKey, sortDir } = resolveSort(params, "median", "desc");
  const canExport = tier === "singularity" && sims.length > 0;
  const positions = sortPositions([...new Set(sims.map((r) => r.position))]);

  // Heat-tint, the Range-bar scale, and per-stat percentiles all read as
  // "the population" and have to mean the WHOLE league regardless of who's
  // looking, not just whatever sims happens to hold -- poolRows (above)
  // is always the full untruncated fetch, never the teaser-capped slice,
  // so a teaser-truncated fetch can't silently drop whichever player
  // anchors one end of a position's stat range (or the single highest
  // season ceiling site-wide) and distort the heat color / bar width for
  // every visible row near that end. Verified live when this was still a
  // bug: with the full 32-QB pool Kyler Murray's passing-yards floor was
  // clearly 3rd percentile, but a free-tier 31-QB teaser pool (missing
  // one low outlier) pushed it down to a misleading 0th, indistinguishable
  // from a genuinely far-below-everyone floor like Shedeur Sanders'.
  const maxCeiling = poolRows.reduce((m, s) => Math.max(m, s.ceiling), 1);

  // Position-relative -- QBs score far higher raw totals than TEs, so a
  // global min/max would make every QB look "hot" and every TE look
  // "cold" regardless of how they actually rank among their own position.
  const rangeByPos = { floor: {}, median: {}, ceiling: {} };
  for (const row of poolRows) {
    for (const col of ["floor", "median", "ceiling"]) {
      const r = rangeByPos[col][row.position] || { min: Infinity, max: -Infinity };
      r.min = Math.min(r.min, row[col]);
      r.max = Math.max(r.max, row[col]);
      rangeByPos[col][row.position] = r;
    }
  }
  function heatFor(col, row) {
    const r = rangeByPos[col][row.position];
    return r && r.max > r.min ? (row[col] - r.min) / (r.max - r.min) : 0;
  }
  const statPoolByPos = buildStatPoolByPos(poolRows);
  // Same reasoning as heatFor/maxCeiling above -- the replacement-level
  // baseline has to be drawn from the whole population, not whatever a
  // teaser-truncated fetch happens to include.
  const porByName = computeReplacementValues(poolRows, { teams: leagueTeams, superflex });
  // Regr/Pace %ile depend only on the player's own games and his own
  // floor/median/ceiling, so they are computed just for the rows that are
  // actually sent (10 for a free visitor, not all 300).
  const regressionByName = {};
  const outcomeByName = {};
  for (const row of sims) {
    // Approximation, not the literal backtested formula -- see
    // lib/regressionScore.js's comment. season_median/GAMES_PER_SEASON
    // is a bootstrapped season-total median divided by games, not the
    // plain recency-weighted mean per-game rate the backtest validated
    // against. Close enough to be useful; not guaranteed to reproduce
    // the exact backtest correlation.
    regressionByName[row.player_name] = computeRegressionScore(
      actualProductionByName[row.player_name],
      row.median / GAMES_PER_SEASON,
      teamGamesByName?.[row.player_name]
    );
    // Where the player's current pace, extrapolated across a full
    // season, would land on their own floor-to-ceiling outcome curve --
    // see lib/outcomePercentile.js.
    outcomeByName[row.player_name] = computeOutcomePercentile(actualProductionByName[row.player_name], {
      floor: row.floor,
      median: row.median,
      ceiling: row.ceiling,
      gamesPerSeason: GAMES_PER_SEASON,
      gamesElapsed: teamGamesByName?.[row.player_name],
    });
  }
  // Rounded to the precision the page actually shows (and no more): these rows
  // are serialized into the page for every visitor, 300 of them for a
  // Singularity member, and a 16-digit float is ~10 bytes of nothing.
  const round = (v, digits) => (v == null ? v : Math.round(v * 10 ** digits) / 10 ** digits);
  const simsWithComputed = sims.map((row) => {
    const regression = regressionByName[row.player_name];
    const outcome = outcomeByName[row.player_name];
    const missed = missedWeeksByName?.[row.player_name];
    const role = archetypeByName?.[row.player_name];
    return {
      ...row,
      ...(role ? { archetype: role.a, ...(role.near ? { archetypeNear: role.near } : {}) } : {}),
      heat: round(heatFor("median", row), 2),
      floorHeat: round(heatFor("floor", row), 2),
      ceilingHeat: round(heatFor("ceiling", row), 2),
      sleeperId: bioByNamePos[`${normalizePlayerName(row.player_name)}|${row.position}`]?.sleeperId || null,
      por: round(porByName[row.player_name], 1),
      regressionScore: round(regression?.regressionScore ?? null, 2),
      currentPPG: round(regression?.currentPPG ?? null, 3),
      gamesPlayed: regression?.gamesPlayed ?? 0,
      recentGames: recentByName[row.player_name] || [],
      ...(missed ? { missedWeeks: missed } : {}),
      outcomePercentile: round(outcome?.percentile ?? null, 2),
      // Same units as floor/median/ceiling (season-total scale), so it
      // can be positioned on the Range bar with the exact same maxCeiling
      // denominator the bar's own floor/median/ceiling segments use.
      paceSeasonTotal: round(outcome?.paceSeasonTotal ?? null, 1),
      ...computeStatPercentiles(row, statPoolByPos),
    };
  });
  const simsWithHeat = sortRows(simsWithComputed, sortKey, sortDir, COLUMN_TYPES);
  return (
    <div className="tool-page">
      <SiteHeader />

      <main className="wrap tool-wrap player-sims-wrap">
        {sims.length === 0 ? (
          <>
            <div className="eyebrow">
              {latest ? `${latest.season} Season · Updated Week ${latest.week}` : "Simulations"}
            </div>
            <h1>Player Season Simulations</h1>
            <p className="tool-sub">
              Full-season Monte Carlo simulations run 10,000 times per player,
              distilled to a 10th / 50th / 90th percentile floor, median, and
              ceiling. Top 10 free for every Stargazer.
            </p>
            <div className="tool-empty">
              <p>Simulations publish weekly during the season — check back soon.</p>
            </div>
          </>
        ) : (
          <>
            <PlayerSimSearch
              rows={simsWithHeat}
              sortKey={sortKey}
              sortDir={sortDir}
              currentParams={params}
              positions={positions}
              maxCeiling={maxCeiling}
              lastWeek={lastGameWeek}
              simLatestWeek={latest.week}
              leagueTeams={leagueTeams}
              superflex={superflex}
              header={
                <>
                  <div className="eyebrow">
                    {latest ? `${latest.season} Season · Updated Week ${latest.week}` : "Simulations"}
                  </div>
                  <h1>Player Season Simulations</h1>
                  <p className="tool-sub">
                    Full-season Monte Carlo simulations run 10,000 times per player,
                    distilled to a 10th / 50th / 90th percentile floor, median, and
                    ceiling. Top 10 free for every Stargazer.
                  </p>
                  {canExport && (
                    <div className="toggle-row-flex">
                      <div className="toggle-row-actions">
                        <ExportCsvButton
                          filename={`player-simulations-week${latest.week}-${latest.season}.csv`}
                          href="/api/player-simulations/csv"
                        />
                      </div>
                    </div>
                  )}
                </>
              }
            />

            {isTeaser && (
              <div className="tool-paywall reveal in">
                <p>
                  You&apos;re seeing {sims.length} of {totalCount} simulated
                  players. Unlock the full set with Singularity.
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

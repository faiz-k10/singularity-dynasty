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

    const [{ data, count }, actualRows, logRows, historyRows] = await Promise.all([
      publicSupabase
        .from("player_simulations")
        .select(
          "player_name, position, team, floor, median, ceiling, stat_ranges, trend, sample_confidence, notes",
          { count: "exact" }
        )
        .eq("season", latest.season)
        .eq("week", latest.week)
        .order("median", { ascending: false }),
      // Real weekly actual production -- powers the regression-to-
      // projection score below. Scoped to latest.season, not latest.week:
      // this is the whole season's games-played-so-far, not just one
      // week's batch. Derived from player_game_log (already refreshed
      // weekly from real nflreadr box scores), not hand-entered -- see
      // scripts/publish-actual-production.mjs, run as part of the normal
      // weekly publish cycle right alongside the game log itself.
      // Paginated (fetchAllRows below): Supabase's project-level API "max
      // rows" setting hard-caps any single request at 1000 regardless of
      // an explicit .limit() asking for more -- confirmed directly (a
      // .limit(5000) here still only returned 1000 rows). This table is
      // already past 1000 (1078 rows 3 weeks into the season) and was
      // silently truncating, dropping a chunk of the LATEST week's games
      // (sorted last) for whichever players' rows fell past row 1000.
      // Found via Harold Fannin Jr.'s pace panel showing "2 games" with
      // his real Week 3 game already live in the table.
      fetchAllRows(publicSupabase, "player_actual_production", "player_name, week, actual_points", (q) =>
        q.eq("season", latest.season).order("week", { ascending: true })
      ),
      fetchAllRows(
        publicSupabase,
        "player_game_log",
        "player_name, season, week, opponent, is_home, fantasy_points_ppr, exp_points_ppr",
        (q) => q.eq("season", latest.season).order("week", { ascending: true })
      ),
      // Earlier weeks' published sims of this season -- powers the pace
      // panel's week scrubber (snapshot of the projection as it stood then).
      fetchAllRows(publicSupabase, "player_simulations", "player_name, week, floor, median, ceiling", (q) =>
        q.eq("season", latest.season).lt("week", latest.week).order("week", { ascending: true })
      ),
    ]);

    const actualProductionByName = {};
    const weeklyByName = {};
    for (const row of actualRows || []) {
      (actualProductionByName[row.player_name] ??= []).push(row.actual_points);
    }
    for (const g of logRows || []) (weeklyByName[g.player_name] ??= []).push(g);
    const simHistoryByName = {};
    for (const h of historyRows || []) (simHistoryByName[h.player_name] ??= []).push(h);

    return { latest, rows: data || [], totalCount: count || 0, actualProductionByName, weeklyByName, simHistoryByName };
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
  const [{ tier }, { latest, rows, totalCount: fetchedCount, actualProductionByName, weeklyByName, simHistoryByName }, bioByNamePos] =
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
  // Regr/Pace %ile are computed once per player here (over the WHOLE
  // pool, not the teaser-capped `sims`) so a free/signed-out visitor's
  // truncated fetch doesn't change the numbers for the players who ARE
  // visible.
  const regressionByName = {};
  const outcomeByName = {};
  for (const row of poolRows) {
    // Approximation, not the literal backtested formula -- see
    // lib/regressionScore.js's comment. season_median/GAMES_PER_SEASON
    // is a bootstrapped season-total median divided by games, not the
    // plain recency-weighted mean per-game rate the backtest validated
    // against. Close enough to be useful; not guaranteed to reproduce
    // the exact backtest correlation.
    regressionByName[row.player_name] = computeRegressionScore(
      actualProductionByName[row.player_name],
      row.median / GAMES_PER_SEASON
    );
    // Where the player's current pace, extrapolated across a full
    // season, would land on their own floor-to-ceiling outcome curve --
    // see lib/outcomePercentile.js.
    outcomeByName[row.player_name] = computeOutcomePercentile(actualProductionByName[row.player_name], {
      floor: row.floor,
      median: row.median,
      ceiling: row.ceiling,
      gamesPerSeason: GAMES_PER_SEASON,
    });
  }
  // Pace-panel snapshots, one per completed game week: "W3" = everything
  // through week 3 -- games from weeks <= 3 and the projection as it stood
  // after them (the sim published for week 4; the latest sim stands in
  // for any week past it).
  const lastGameWeek = Math.max(0, ...Object.values(weeklyByName).flatMap((gs) => gs.map((g) => g.week)));
  function snapshotsFor(row) {
    const games = weeklyByName[row.player_name] || [];
    const byWeek = {};
    for (const h of simHistoryByName[row.player_name] || []) byWeek[h.week] = h;
    byWeek[latest.week] = row;
    const out = [];
    for (let w = 1; w <= lastGameWeek; w++) {
      const proj = byWeek[w + 1] || (w + 1 > latest.week ? row : null);
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
      out.push({
        week: w,
        floor: proj.floor,
        median: proj.median,
        ceiling: proj.ceiling,
        gamesPlayed: pts.length,
        currentPPG: reg?.currentPPG ?? null,
        regressionScore: reg?.regressionScore ?? null,
        paceSeasonTotal: oc?.paceSeasonTotal ?? null,
        outcomePercentile: oc?.percentile ?? null,
        recentGames: played.slice(-3).reverse(),
      });
    }
    return out;
  }
  const simsWithComputed = sims.map((row) => {
    const heat = heatFor("median", row);
    const floorHeat = heatFor("floor", row);
    const ceilingHeat = heatFor("ceiling", row);
    const regression = regressionByName[row.player_name];
    const outcome = outcomeByName[row.player_name];
    return {
      ...row,
      heat,
      floorHeat,
      ceilingHeat,
      sleeperId: bioByNamePos[`${normalizePlayerName(row.player_name)}|${row.position}`]?.sleeperId || null,
      por: porByName[row.player_name],
      regressionScore: regression?.regressionScore ?? null,
      currentPPG: regression?.currentPPG ?? null,
      gamesPlayed: regression?.gamesPlayed ?? 0,
      recentGames: (weeklyByName[row.player_name] || []).slice(-3).reverse(),
      snapshots: snapshotsFor(row),
      outcomePercentile: outcome?.percentile ?? null,
      // Same units as floor/median/ceiling (season-total scale), so it
      // can be positioned on the Range bar with the exact same maxCeiling
      // denominator the bar's own floor/median/ceiling segments use.
      paceSeasonTotal: outcome?.paceSeasonTotal ?? null,
      ...computeStatPercentiles(row, statPoolByPos),
    };
  });
  const simsWithHeat = sortRows(simsWithComputed, sortKey, sortDir, COLUMN_TYPES);
  // Peer pool for SimilarShapeFinder, grouped by the exact set of stat
  // keys a player carries rather than by position -- QBs only match QBs
  // (unique passing keys), but WRs and TEs share one pool since they
  // carry the identical 3 receiving keys, so "similar shape" can surface
  // a cross-position comp there instead of being siloed like the sliders.
  const shapePeers = {};
  for (const row of simsWithHeat) {
    if (!row.stat_ranges) continue;
    const signature = Object.keys(row.stat_ranges).sort().join("|");
    (shapePeers[signature] ??= []).push({
      name: row.player_name,
      position: row.position,
      sleeperId: bioByNamePos[`${normalizePlayerName(row.player_name)}|${row.position}`]?.sleeperId || null,
      statPercentiles: row.statPercentiles,
      statFloorPercentiles: row.statFloorPercentiles,
      statCeilingPercentiles: row.statCeilingPercentiles,
      stat_ranges: row.stat_ranges,
    });
  }
  // CSV export stays in points-per-game terms regardless of the on-page
  // toggle -- it's baked into server-rendered HTML at request time (see
  // ExportCsvButton's comment), not reactive to PlayerSimSearch's client
  // state, so it needs its own converted copy independent of what the
  // table happens to be displaying.
  const csvRows = simsWithHeat.map((row) => ({
    ...row,
    floor: Math.round((row.floor / GAMES_PER_SEASON) * 10) / 10,
    median: Math.round((row.median / GAMES_PER_SEASON) * 10) / 10,
    ceiling: Math.round((row.ceiling / GAMES_PER_SEASON) * 10) / 10,
  }));

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
              shapePeers={shapePeers}
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
                          id="csv-player-simulations"
                          filename={`player-simulations-week${latest.week}-${latest.season}.csv`}
                          columns={[
                            { key: "player_name", label: "Player" },
                            { key: "position", label: "Position" },
                            { key: "team", label: "Team" },
                            { key: "floor", label: "Floor (PPG)" },
                            { key: "median", label: "Median (PPG)" },
                            { key: "ceiling", label: "Ceiling (PPG)" },
                            { key: "trend", label: "Trend" },
                            { key: "sample_confidence", label: "Confidence" },
                          ]}
                          rows={csvRows}
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

import Link from "next/link";
import { unstable_cache } from "next/cache";
import { resolveTier } from "@/lib/tier";
import { createClient } from "@/lib/supabase/server";
import { createPublicClient } from "@/lib/supabase/public";
import { resolveSort, sortRows } from "@/lib/sortLink";
import { buildStatPoolByPos, computeStatPercentiles } from "@/lib/statPercentiles";
import { computeGlobalTierMap } from "@/lib/tiers";
import { computeReplacementValues } from "@/lib/replacementValue";
import { computeRegressionScore } from "@/lib/regressionScore";
import { computeOutcomePercentile } from "@/lib/outcomePercentile";
import SiteHeader from "../../SiteHeader";
import ExportCsvButton from "../ExportCsvButton";
import PlayerSimSearch from "../PlayerSimSearch";

export const metadata = {
  title: "Player Season Simulations — Singularity Dynasty",
};

const TEASER_LIMIT = 200;
const GAMES_PER_SEASON = 17;
// Singularity-only per the pricing copy — Explorer does not include this.
const PAID_TIERS = ["singularity"];
const POSITION_ORDER = ["QB", "RB", "WR", "TE"];
const COLUMN_TYPES = {
  player_name: "string",
  position: "string",
  team: "string",
  floor: "number",
  median: "number",
  ceiling: "number",
  por: "number",
  wopr: "number",
  epa: "number",
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

    const [{ data, count }, { data: actualRows }] = await Promise.all([
      publicSupabase
        .from("player_simulations")
        .select(
          "player_name, position, team, floor, median, ceiling, stat_ranges, trend, sample_confidence, notes, wopr, epa",
          { count: "exact" }
        )
        .eq("season", latest.season)
        .eq("week", latest.week)
        .order("median", { ascending: false }),
      // Real (or dummy/test, before the season has real data) weekly
      // actual production -- powers the regression-to-projection score
      // below. Scoped to latest.season, not latest.week: this is the
      // whole season's games-played-so-far, not just one week's batch.
      publicSupabase
        .from("player_actual_production")
        .select("player_name, week, actual_points")
        .eq("season", latest.season)
        .order("week", { ascending: true }),
    ]);

    const actualProductionByName = {};
    for (const row of actualRows || []) {
      (actualProductionByName[row.player_name] ??= []).push(row.actual_points);
    }

    return { latest, rows: data || [], totalCount: count || 0, actualProductionByName };
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
  // other.
  const [{ tier }, { latest, rows, totalCount: fetchedCount, actualProductionByName }] = await Promise.all([
    resolveTier(supabase),
    getCachedWeekData(),
  ]);
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
    poolRows = rows.map((row) => {
      posRankCounters[row.position] = (posRankCounters[row.position] || 0) + 1;
      return { ...row, positionRank: posRankCounters[row.position] };
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
  // POR is the only tierable metric (floor/median/ceiling tiering was
  // removed by request), computed once across the WHOLE pool rather than
  // per-position -- POR is already measured against each player's own
  // position's replacement level, so it's meant to be compared across
  // positions, not re-siloed by one.
  const poolRowsWithPor = poolRows.map((row) => ({ ...row, por: porByName[row.player_name] }));
  const porTierByName = computeGlobalTierMap(poolRowsWithPor, "por");
  // WOPR/EPA tier the same way POR does -- globally across the whole
  // pool, no position grouping (see computeGlobalTierMap in lib/tiers.js).
  const woprTierByName = computeGlobalTierMap(poolRows, "wopr");
  const epaTierByName = computeGlobalTierMap(poolRows, "epa");
  // Regr/Pace %ile are computed once per player here (over the WHOLE
  // pool, not the teaser-capped `sims`) so their tiers -- like every
  // other tier on this page -- are drawn from the full population, not
  // whatever a free/signed-out visitor's truncated fetch happens to
  // include.
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
  const poolRowsWithRegression = poolRows.map((row) => ({
    ...row,
    regressionScore: regressionByName[row.player_name]?.regressionScore ?? null,
    outcomePercentile: outcomeByName[row.player_name]?.percentile ?? null,
  }));
  // Same treatment as WOPR/EPA -- global tiers, and computeGlobalTierMap
  // already filters out null rows (the ~420 players with no real games
  // on record yet), so they simply don't get a tier/banner rather than
  // corrupting the gap calculation.
  const regressionTierByName = computeGlobalTierMap(poolRowsWithRegression, "regressionScore");
  const outcomePercentileTierByName = computeGlobalTierMap(poolRowsWithRegression, "outcomePercentile");
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
      por: porByName[row.player_name],
      tier: porTierByName[row.player_name],
      woprTier: woprTierByName[row.player_name],
      epaTier: epaTierByName[row.player_name],
      regressionScore: regression?.regressionScore ?? null,
      currentPPG: regression?.currentPPG ?? null,
      gamesPlayed: regression?.gamesPlayed ?? 0,
      regressionTier: regressionTierByName[row.player_name],
      outcomePercentile: outcome?.percentile ?? null,
      outcomePercentileTier: outcomePercentileTierByName[row.player_name],
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
      statPercentiles: row.statPercentiles,
      statFloorPercentiles: row.statFloorPercentiles,
      statCeilingPercentiles: row.statCeilingPercentiles,
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

      <main className="wrap tool-wrap">
        <div className="eyebrow">
          {latest ? `${latest.season} Season · Updated Week ${latest.week}` : "Simulations"}
        </div>
        <h1>Player Season Simulations</h1>
        <p className="tool-sub">
          Full-season Monte Carlo simulations run 10,000 times per player,
          distilled to a 10th / 50th / 90th percentile floor, median, and
          ceiling.
        </p>

        {sims.length === 0 ? (
          <div className="tool-empty">
            <p>Simulations publish weekly during the season — check back soon.</p>
          </div>
        ) : (
          <>
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

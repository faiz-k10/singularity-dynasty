import Link from "next/link";
import { getUserTier } from "@/lib/tier";
import { resolveSort, sortRows } from "@/lib/sortLink";
import { buildStatPoolByPos, computeStatPercentiles } from "@/lib/statPercentiles";
import { computeTierMaps } from "@/lib/tiers";
import { computeReplacementValues } from "@/lib/replacementValue";
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
};

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
  const { supabase, tier } = await getUserTier();
  const hasFullAccess = PAID_TIERS.includes(tier);
  // POR's replacement-level baseline depends on league settings the viewer
  // picks via the League Size / QB Format toggles -- unknown values fall
  // back to the standard 12-team, single-QB assumption.
  const leagueTeams = params?.teams === "10" ? 10 : 12;
  const superflex = params?.qb === "sf";

  const { data: latest } = await supabase
    .from("player_simulations")
    .select("season, week")
    .order("season", { ascending: false })
    .order("week", { ascending: false })
    .limit(1)
    .maybeSingle();

  let sims = [];
  let totalCount = 0;

  if (latest) {
    let query = supabase
      .from("player_simulations")
      .select(
        "player_name, position, team, floor, median, ceiling, stat_ranges, trend, sample_confidence, notes",
        { count: "exact" }
      )
      .eq("season", latest.season)
      .eq("week", latest.week)
      .order("median", { ascending: false });

    if (!hasFullAccess) {
      query = query.limit(TEASER_LIMIT);
    }

    const { data, count } = await query;
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
    // fixed median-desc order, so it stays a stable "positional ranking"
    // independent of whatever column the viewer sorts the table by below.
    const posRankCounters = {};
    sims = (data || []).map((row) => {
      posRankCounters[row.position] = (posRankCounters[row.position] || 0) + 1;
      return { ...row, positionRank: posRankCounters[row.position] };
    });
    totalCount = count || 0;
  }

  const isTeaser = !hasFullAccess && totalCount > sims.length;
  const { sortKey, sortDir } = resolveSort(params, "median", "desc");
  const canExport = tier === "singularity" && sims.length > 0;
  const positions = sortPositions([...new Set(sims.map((r) => r.position))]);

  // Heat-tint, the Range-bar scale, and per-stat percentiles all read as
  // "the population" and have to mean the WHOLE league regardless of who's
  // looking, not just whatever sims happens to hold. For a free/
  // signed-out viewer sims is capped to TEASER_LIMIT (200) rows --
  // that used to double as the heat-tint min/max pool and the Range bar's
  // maxCeiling too, not just the percentile pool, so a teaser-truncated
  // fetch could silently drop whichever player anchors one end of a
  // position's stat range (or the single highest season ceiling site-
  // wide) and distort the heat color / bar width for every visible row
  // near that end, on top of the percentile-specific bug this same
  // untruncated fetch was already added to fix -- verified live: with the
  // full 32-QB pool Kyler Murray's passing-yards floor was clearly 3rd
  // percentile, but the free-tier's 31-QB teaser pool (missing one low
  // outlier) pushed it down to a misleading 0th, indistinguishable from a
  // genuinely far-below-everyone floor like Shedeur Sanders'. One
  // always-untruncated fetch now feeds heat-tint, maxCeiling, AND
  // percentiles instead of just the last of the three.
  let poolRows = sims;
  if (!hasFullAccess && latest) {
    const { data: fullData } = await supabase
      .from("player_simulations")
      .select("player_name, position, stat_ranges, floor, median, ceiling")
      .eq("season", latest.season)
      .eq("week", latest.week);
    poolRows = fullData || [];
  }
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
  // computeTierMaps needs a `por` field on each row to tier by it -- por
  // isn't one of the raw published columns, so it has to be attached to
  // poolRows before tiering runs, not after.
  const poolRowsWithPor = poolRows.map((row) => ({ ...row, por: porByName[row.player_name] }));
  // Always derived from poolRows (the full, untruncated population), same
  // reasoning as heatFor/maxCeiling above -- a teaser-truncated pool would
  // both miscount tiers and drop whichever player anchors a tier boundary.
  const tierByName = computeTierMaps(poolRowsWithPor);
  // por is computed off the pool, not a raw column from Supabase, so it
  // has to be attached before sorting -- sorting sims first (like the
  // other columns used to) would leave por absent from every row at sort
  // time and silently no-op a "sort by POR" click.
  const simsWithComputed = sims.map((row) => {
    const heat = heatFor("median", row);
    const floorHeat = heatFor("floor", row);
    const ceilingHeat = heatFor("ceiling", row);
    return {
      ...row,
      heat,
      floorHeat,
      ceilingHeat,
      por: porByName[row.player_name],
      tiers: {
        floor: tierByName.floor[row.player_name],
        median: tierByName.median[row.player_name],
        ceiling: tierByName.ceiling[row.player_name],
        por: tierByName.por[row.player_name],
      },
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

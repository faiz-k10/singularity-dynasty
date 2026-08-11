import Link from "next/link";
import { getUserTier } from "@/lib/tier";
import { resolveSort, sortRows } from "@/lib/sortLink";
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
  const sortedSims = sortRows(sims, sortKey, sortDir, COLUMN_TYPES);
  const maxCeiling = sims.reduce((m, s) => Math.max(m, s.ceiling), 1);
  const canExport = tier === "singularity" && sims.length > 0;
  const positions = sortPositions([...new Set(sims.map((r) => r.position))]);

  // Median heat-tint is position-relative -- QBs score far higher raw
  // totals than TEs, so a global min/max would make every QB look "hot"
  // and every TE look "cold" regardless of how they actually rank among
  // their own position.
  const medianRangeByPos = {};
  // Percentile rank vs. position reuses the same per-position grouping as
  // the heat-tint above, and the same rule: computed from whatever pool
  // the current viewer actually has, teaser-limited or not. The teaser
  // query only returns the top TEASER_LIMIT players by median globally, so
  // a given position's pool is smaller there -- PositionPercentile's
  // "VS N POSITIONS" label says the real N rather than implying a full
  // field, so a small sample reads as small instead of misleading.
  const statsByPos = {};
  for (const row of sortedSims) {
    const r = medianRangeByPos[row.position] || { min: Infinity, max: -Infinity };
    r.min = Math.min(r.min, row.median);
    r.max = Math.max(r.max, row.median);
    medianRangeByPos[row.position] = r;
    const pool = (statsByPos[row.position] ??= { floor: [], median: [], ceiling: [] });
    pool.floor.push(row.floor);
    pool.median.push(row.median);
    pool.ceiling.push(row.ceiling);
  }
  // Share of the player's own position pool that this number beats -- e.g.
  // a ceiling percentile of 85 is higher than 85% of other players at the
  // position. Distinct from the min/max heat-tint above.
  // invert flips "higher raw value = higher percentile" for stats where
  // more is actually worse (interceptions) -- everything else keeps the
  // default higher-is-better direction.
  function percentileRank(value, pool, invert = false) {
    if (!pool || pool.length <= 1) return null;
    const lower = pool.filter((v) => (invert ? v > value : v < value)).length;
    return Math.round((lower / (pool.length - 1)) * 100);
  }
  const INVERTED_STATS = new Set(["passing_interceptions"]);
  // Same idea, per individual stat (rushing yards, receptions, etc.) for
  // the radar chart in the expanded row -- one pool per position+stat key,
  // built from each player's median value for that stat (the radar's
  // single representative point per axis, same role median plays for the
  // three season-total sliders above).
  const statPoolByPos = {};
  for (const row of sortedSims) {
    if (!row.stat_ranges) continue;
    const pool = (statPoolByPos[row.position] ??= {});
    for (const [key, range] of Object.entries(row.stat_ranges)) {
      (pool[key] ??= []).push(range.median);
    }
  }
  const simsWithHeat = sortedSims.map((row) => {
    const r = medianRangeByPos[row.position];
    const heat = r && r.max > r.min ? (row.median - r.min) / (r.max - r.min) : 0;
    const pool = statsByPos[row.position];
    const statPool = statPoolByPos[row.position];
    const statPercentiles = {};
    if (row.stat_ranges) {
      for (const [key, range] of Object.entries(row.stat_ranges)) {
        statPercentiles[key] = percentileRank(range.median, statPool?.[key], INVERTED_STATS.has(key));
      }
    }
    return {
      ...row,
      heat,
      floorPctile: pool ? percentileRank(row.floor, pool.floor) : null,
      medianPctile: pool ? percentileRank(row.median, pool.median) : null,
      ceilingPctile: pool ? percentileRank(row.ceiling, pool.ceiling) : null,
      positionPoolSize: pool ? pool.floor.length : null,
      statPercentiles,
    };
  });
  // Percentile profile of every player at each position, for
  // PositionPercentile's drag-to-find-a-comp sliders -- built once here
  // instead of shipping the whole rows array to the client a second time.
  const positionPeers = {};
  for (const row of simsWithHeat) {
    if (row.floorPctile == null) continue;
    (positionPeers[row.position] ??= []).push({
      name: row.player_name,
      floorPctile: row.floorPctile,
      medianPctile: row.medianPctile,
      ceilingPctile: row.ceilingPctile,
    });
  }
  // CSV export stays in points-per-game terms regardless of the on-page
  // toggle -- it's baked into server-rendered HTML at request time (see
  // ExportCsvButton's comment), not reactive to PlayerSimSearch's client
  // state, so it needs its own converted copy independent of what the
  // table happens to be displaying.
  const csvRows = sortedSims.map((row) => ({
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
          ceiling — toggle between points per game and full-season totals
          below.
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
              positionPeers={positionPeers}
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

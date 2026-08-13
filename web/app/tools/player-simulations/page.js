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

  // Heat-tint (Floor/Median/Ceiling columns) is position-relative -- QBs
  // score far higher raw totals than TEs, so a global min/max would make
  // every QB look "hot" and every TE look "cold" regardless of how they
  // actually rank among their own position.
  const rangeByPos = { floor: {}, median: {}, ceiling: {} };
  for (const row of sortedSims) {
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
  // Share of the player's own position pool that a stat's median beats --
  // e.g. a percentile of 85 is higher than 85% of other players at the
  // position (used by the radar chart below). invert flips "higher raw
  // value = higher percentile" for stats where more is actually worse
  // (interceptions) -- everything else keeps the default higher-is-better
  // direction.
  //
  // Linearly interpolates within the gap a value falls into rather than
  // just counting how many pool entries are strictly below it. Floor/
  // ceiling get ranked against the (much sparser) median pool -- see
  // statFloorPercentiles/statCeilingPercentiles below -- so two floors
  // that both land in the same gap between consecutive median values
  // used to come out as the literal same percentile despite being very
  // different numbers (e.g. a 32-QB median pool with nothing between
  // 1289 and 1903 gave a 1655 floor and a 1321 floor an identical rank).
  // Interpolating within that gap by exactly where the value falls
  // fixes that while still landing on the original simple count for a
  // value that's itself a pool member (the normal case for a median
  // percentile, which is always ranked against a pool that includes its
  // own value).
  function percentileRank(value, pool, invert = false) {
    if (!pool || pool.length <= 1) return null;
    const dir = invert ? -1 : 1;
    const sorted = pool.map((v) => v * dir).sort((a, b) => a - b);
    const v = value * dir;
    const n = sorted.length;
    const below = sorted.filter((x) => x < v).length;
    const above = sorted.filter((x) => x > v).length;
    const tied = n - below - above;

    let rank;
    if (tied > 0) {
      // v exactly matches one or more pool values -- mid-rank of the tie
      // block, which reduces to plain `below` when v is uniquely present
      // (tied === 1), matching the original un-interpolated formula.
      rank = below + (tied - 1) / 2;
    } else {
      const loIdx = below - 1;
      const hiIdx = below;
      if (loIdx < 0) {
        const gap = sorted[1] - sorted[0];
        rank = gap > 0 ? Math.max(0, (v - sorted[0]) / gap) : 0;
      } else if (hiIdx >= n) {
        const gap = sorted[n - 1] - sorted[n - 2];
        rank = gap > 0 ? Math.min(n - 1, n - 2 + (v - sorted[n - 2]) / gap) : n - 1;
      } else {
        const gap = sorted[hiIdx] - sorted[loIdx];
        rank = gap > 0 ? loIdx + (v - sorted[loIdx]) / gap : loIdx;
      }
    }
    return Math.round((rank / (n - 1)) * 100);
  }
  const INVERTED_STATS = new Set(["passing_interceptions"]);
  // Same idea, per individual stat (rushing yards, receptions, etc.) for
  // the radar chart in the expanded row -- one median pool per
  // position+stat key. Floor and ceiling are ranked against this same
  // pool too (see below), so there's only ever one array to build here.
  const statPoolByPos = {};
  for (const row of sortedSims) {
    if (!row.stat_ranges) continue;
    const pool = (statPoolByPos[row.position] ??= {});
    for (const [key, range] of Object.entries(row.stat_ranges)) {
      (pool[key] ??= []).push(range.median);
    }
  }
  const simsWithHeat = sortedSims.map((row) => {
    const heat = heatFor("median", row);
    const floorHeat = heatFor("floor", row);
    const ceilingHeat = heatFor("ceiling", row);
    const statPool = statPoolByPos[row.position];
    const statPercentiles = {};
    const statFloorPercentiles = {};
    const statCeilingPercentiles = {};
    if (row.stat_ranges) {
      for (const [key, range] of Object.entries(row.stat_ranges)) {
        const pool = statPool?.[key];
        const invert = INVERTED_STATS.has(key);
        // Floor and ceiling rank against the MEDIAN pool, not their own
        // floor/ceiling pools -- floor/median/ceiling for one player are
        // all draws from that same player's own distribution, so a
        // better player tends to have a higher floor AND median AND
        // ceiling together. Ranking each independently against its own
        // similarly-shifted pool preserves that correlation and makes
        // all three percentiles land nearly on top of each other for
        // most players. Putting floor/ceiling on the median pool's scale
        // instead measures "how does my floor/ceiling compare to peers'
        // typical production," which spreads the band out to actually
        // reflect this player's own variance.
        statPercentiles[key] = percentileRank(range.median, pool, invert);
        statFloorPercentiles[key] = percentileRank(range.floor, pool, invert);
        statCeilingPercentiles[key] = percentileRank(range.ceiling, pool, invert);
      }
    }
    return {
      ...row,
      heat,
      floorHeat,
      ceilingHeat,
      statPercentiles,
      statFloorPercentiles,
      statCeilingPercentiles,
    };
  });
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

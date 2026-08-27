import Link from "next/link";
import { getUserTier } from "@/lib/tier";
import { buildStatPoolByPos, computeStatPercentiles } from "@/lib/statPercentiles";
import SiteHeader from "../../SiteHeader";
import STAT_LABELS from "../statLabels";
import ComparePlayerPickers from "../ComparePlayerPickers";
import CompareStatsTable from "../CompareStatsTable";
import ComparePlayerRadars from "../ComparePlayerRadars";
import { radarStartDegFor } from "../radarLayout";

export const metadata = {
  title: "Compare Player Season Simulations — Floor/Median/Ceiling — Singularity Dynasty",
  description:
    "Compare two players' full-season Monte Carlo simulation outcomes side-by-side — floor, median, and ceiling projections, stat percentiles, and similar-shape comps.",
};

const SLOTS = ["p1", "p2", "p3"];
const TEASER_LIMIT = 10;
// Singularity-only, same as Player Season Simulations itself -- this is a
// view over that same dataset, so the tier gate has to match exactly or
// a free/Explorer user could use this tool to see players past the
// teaser boundary.
const PAID_TIERS = ["singularity"];

export default async function ComparePlayerSimsPage({ searchParams }) {
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
  if (latest) {
    let query = supabase
      .from("player_simulations")
      .select("player_name, position, team, floor, median, ceiling, stat_ranges, trend, sample_confidence, notes")
      .eq("season", latest.season)
      .eq("week", latest.week)
      .order("median", { ascending: false });

    if (!hasFullAccess) {
      query = query.limit(TEASER_LIMIT);
    }

    const { data } = await query;

    // Position-relative rank (RB1, WR23, ...) computed from the same
    // median-descending order the query already fetches in -- Player
    // Season Simulations doesn't have a rank column to key off, unlike
    // Redraft/Best Ball, so this uses the query's own natural order.
    const positionCounters = {};
    sims = (data || []).map((r) => {
      positionCounters[r.position] = (positionCounters[r.position] || 0) + 1;
      return { ...r, positionLabel: `${r.position}${positionCounters[r.position]}` };
    });
  }

  const byName = new Map(sims.map((r) => [r.player_name, r]));
  const selected = SLOTS.map((slot) => byName.get(params?.[slot])).filter(Boolean);
  const playerOptions = sims.map((r) => ({ player_name: r.player_name, position: r.position }));

  // Everything below that reads as "the population" -- heat-tint,
  // Range-bar scale, and percentiles -- has to mean the WHOLE position/
  // league regardless of which viewer is looking, not just whatever
  // `sims` happens to hold. For a free/signed-out viewer `sims` is capped
  // to TEASER_LIMIT (10) rows, which used to double as the heat-tint and
  // Range-bar pool too -- min/max computed from 10 players instead of the
  // whole league distorted both instead of just reading wrong for
  // players outside that slice, since a compared player is always inside
  // it. One always-untruncated fetch feeds all three now, matching the
  // fix already applied to percentiles.
  let poolRows = sims;
  if (!hasFullAccess && latest) {
    const { data: fullData } = await supabase
      .from("player_simulations")
      .select("position, stat_ranges, floor, median, ceiling")
      .eq("season", latest.season)
      .eq("week", latest.week);
    poolRows = fullData || [];
  }

  // Floor/Ceiling get their own min/max pool each, same as the main
  // table's Floor/Ceiling columns, rather than reusing Median's -- a
  // player's floor and ceiling don't rank the same way relative to the
  // position as their median does.
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
  const maxCeiling = poolRows.reduce((m, s) => Math.max(m, s.ceiling), 1);
  const selectedWithHeat = selected.map((row) => ({
    ...row,
    heat: heatFor("median", row),
    floorHeat: heatFor("floor", row),
    ceilingHeat: heatFor("ceiling", row),
  }));

  let comparePlayers = [];
  if (selectedWithHeat.length > 0 && latest) {
    const statPoolByPos = buildStatPoolByPos(poolRows);
    comparePlayers = selectedWithHeat.map((row) => {
      const { statPercentiles, statFloorPercentiles, statCeilingPercentiles } = computeStatPercentiles(
        row,
        statPoolByPos
      );
      const entries = STAT_LABELS.filter(([key]) => row.stat_ranges && row.stat_ranges[key]);
      const percentileStats = entries.map(([key, label]) => ({
        key,
        label,
        floorPctile: statFloorPercentiles[key],
        medianPctile: statPercentiles[key],
        ceilingPctile: statCeilingPercentiles[key],
        floorValue: row.stat_ranges[key]?.floor,
        medianValue: row.stat_ranges[key]?.median,
        ceilingValue: row.stat_ranges[key]?.ceiling,
      }));
      // Fixed STAT_LABELS order, not radarLayoutFor's per-position vertex
      // reordering -- with three players who might not share a position,
      // "nicest layout for this one player" would put a different stat
      // on the same vertex for each of them, defeating the point of
      // comparing shapes side by side. Only the WR/TE point-down flip
      // carries over.
      const radarEntries = entries.map(([key, label]) => [
        key,
        label,
        statPercentiles[key],
        statFloorPercentiles[key],
        statCeilingPercentiles[key],
      ]);
      const radarStartDeg = radarStartDegFor(row.position);
      return {
        name: row.player_name,
        position: row.position,
        positionLabel: row.positionLabel,
        percentileStats,
        radarEntries,
        radarStartDeg,
      };
    });
  }

  return (
    <div className="tool-page">
      <SiteHeader />

      <main className="wrap tool-wrap">
        <div className="eyebrow">
          {latest ? `${latest.season} Season · Week ${latest.week}` : "Compare"}
        </div>
        <h1>Compare Players — Season Simulations</h1>
        <p className="tool-sub">
          Pick two or three players from Player Season Simulations to see
          them side by side.
        </p>

        {!hasFullAccess && sims.length > 0 && (
          <div className="tool-paywall reveal in">
            <p>
              Free access covers the top {TEASER_LIMIT} players. Unlock
              every player with Singularity.
            </p>
            <Link href="/#pricing" className="btn-primary">
              See Pricing
            </Link>
          </div>
        )}

        {sims.length === 0 ? (
          <div className="tool-empty">
            <p>Simulations publish weekly during the season — check back soon.</p>
          </div>
        ) : (
          <>
            <form className="compare-form">
              <ComparePlayerPickers
                players={playerOptions}
                defaults={{ p1: params?.p1 || "", p2: params?.p2 || "", p3: params?.p3 || "" }}
              />
            </form>

            {selectedWithHeat.length >= 2 ? (
              <>
                <CompareStatsTable
                  selected={selectedWithHeat}
                  maxCeiling={maxCeiling}
                />
                <ComparePlayerRadars players={comparePlayers} />
              </>
            ) : (
              <p className="tool-hint">Pick at least two players, then hit Compare.</p>
            )}
          </>
        )}
      </main>
    </div>
  );
}

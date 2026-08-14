import Link from "next/link";
import { getUserTier } from "@/lib/tier";
import { buildStatPoolByPos, computeStatPercentiles } from "@/lib/statPercentiles";
import SiteHeader from "../../SiteHeader";
import STAT_LABELS from "../statLabels";
import ComparePlayerPickers from "../ComparePlayerPickers";
import CompareStatsTable from "../CompareStatsTable";
import ComparePlayerRadars from "../ComparePlayerRadars";
import { radarLayoutFor } from "../radarLayout";

export const metadata = {
  title: "Compare Players — Season Simulations — Singularity Dynasty",
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

  // Same position-relative heat-tint and Range-bar scale as Player Season
  // Simulations' own table, computed across the full fetched pool (not
  // just the 2-3 selected) so a compared player's heat and bar length
  // read against the same population the main table uses. Floor/Ceiling
  // get their own min/max pool each, same as the main table's Floor/
  // Ceiling columns, rather than reusing Median's -- a player's floor and
  // ceiling don't rank the same way relative to the position as their
  // median does.
  const rangeByPos = { floor: {}, median: {}, ceiling: {} };
  for (const row of sims) {
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
  const maxCeiling = sims.reduce((m, s) => Math.max(m, s.ceiling), 1);
  const selectedWithHeat = selected.map((row) => ({
    ...row,
    heat: heatFor("median", row),
    floorHeat: heatFor("floor", row),
    ceilingHeat: heatFor("ceiling", row),
  }));
  const playerOptions = sims.map((r) => ({ player_name: r.player_name, position: r.position }));

  // Percentile pool built from a separate, always-untruncated query --
  // NOT from `sims`, which is capped to TEASER_LIMIT rows for a free/
  // signed-out viewer (same fix as Player Season Simulations' own page;
  // see lib/statPercentiles.js). Only needed when someone's actually
  // selected, so this skips the extra query on a bare picker-only load.
  let comparePlayers = [];
  if (selectedWithHeat.length > 0 && latest) {
    let poolRows = sims;
    if (!hasFullAccess) {
      const { data: fullData } = await supabase
        .from("player_simulations")
        .select("position, stat_ranges")
        .eq("season", latest.season)
        .eq("week", latest.week);
      poolRows = fullData || [];
    }
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
      const radarEntriesRaw = entries.map(([key, label]) => [
        key,
        label,
        statPercentiles[key],
        statFloorPercentiles[key],
        statCeilingPercentiles[key],
      ]);
      const { entries: radarEntries, startDeg: radarStartDeg } = radarLayoutFor(radarEntriesRaw, row.position);
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

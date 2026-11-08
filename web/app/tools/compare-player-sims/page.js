import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { resolveTier } from "@/lib/tier";
import { getPlayerBiosByNamePos } from "@/lib/sleeper";
import InteractiveScript from "../../InteractiveScript";
import STAT_LABELS from "../statLabels";
import ComparePlayerPickers from "../ComparePlayerPickers";
import CompareSims from "../CompareSims";
import ComparePlayerRadars from "../ComparePlayerRadars";
import { radarStartDegFor } from "../radarLayout";
import { TEASER_LIMIT, PAID_TIERS, getCachedWeekData, buildSimRows } from "../player-simulations/data";

export const metadata = {
  title: "Compare Players — Season Simulations — Singularity Dynasty",
  description:
    "Compare up to three players' full-season simulation outcomes side by side: floor, median and ceiling, season-to-date pace, projected stats, role tags, and percentile shapes.",
};

const SLOTS = ["p1", "p2", "p3"];
// Stargazer compares 2 players, Explorer and Singularity 3.
const MAX_COMPARE = { stargazer: 2 };

// Singularity-only, same as Player Season Simulations itself (free viewers get the top 10): the rows are the very ones
// that dashboard shows (shared buildSimRows), so the tier gate has to match exactly.
export default async function ComparePlayerSimsPage({ searchParams }) {
  const params = await searchParams;
  const supabase = await createClient();
  const [{ tier }, weekData, bioByNamePos] = await Promise.all([resolveTier(supabase), getCachedWeekData(), getPlayerBiosByNamePos()]);
  const hasFullAccess = PAID_TIERS.includes(tier);
  const { latest } = weekData;

  const { sims, maxCeiling, simsWithComputed } = buildSimRows({ cached: weekData, hasFullAccess, bioByNamePos });
  const byName = new Map(simsWithComputed.map((r) => [r.player_name, r]));
  const maxPlayers = MAX_COMPARE[tier] ?? 3;
  const selected = [...new Set(SLOTS.slice(0, maxPlayers).map((slot) => byName.get(params?.[slot])).filter(Boolean))]; // the same player twice counts once
  const playerOptions = sims.map((r) => ({ player_name: r.player_name, position: r.position }));
  const gated = !hasFullAccess && weekData.rows.length > sims.length;

  // The percentile shapes (radar + percentile list per player), same data the dashboard's opened row uses. Fixed
  // STAT_LABELS order, not radarLayoutFor's per-position vertex reordering -- with three players who might not share a
  // position, "nicest layout for this one player" would put a different stat on the same vertex for each of them,
  // defeating the point of comparing shapes side by side. Only the WR/TE point-down flip carries over.
  const comparePlayers = selected.map((row) => {
    const { statPercentiles, statFloorPercentiles, statCeilingPercentiles } = row;
    const entries = STAT_LABELS.filter(([key]) => row.stat_ranges && row.stat_ranges[key]);
    return {
      name: row.player_name,
      position: row.position,
      positionLabel: `${row.position}${row.positionRank}`,
      percentileStats: entries.map(([key, label]) => ({
        key,
        label,
        floorPctile: statFloorPercentiles[key],
        medianPctile: statPercentiles[key],
        ceilingPctile: statCeilingPercentiles[key],
        floorValue: row.stat_ranges[key]?.floor,
        medianValue: row.stat_ranges[key]?.median,
        ceilingValue: row.stat_ranges[key]?.ceiling,
      })),
      radarEntries: entries.map(([key, label]) => [key, label, statPercentiles[key], statFloorPercentiles[key], statCeilingPercentiles[key]]),
      radarStartDeg: radarStartDegFor(row.position),
    };
  });

  return (
    <>
      <InteractiveScript />

      <main id="main-content" className="wrap tool-wrap compare-wrap">
        <div className="eyebrow">{latest ? `${latest.season} Season · Week ${latest.week}` : "Compare"}</div>
        <h1>Compare Players — Season Simulations</h1>
        <p className="tool-sub">
          Pick two{maxPlayers > 2 ? " or three" : ""} players from Player Season Simulations to see their full-season outlooks side by side. Looking for this
          week&apos;s projections?{" "}
          <Link href="/tools/compare-players" className="hub-panel-link">
            Compare weekly projections →
          </Link>
        </p>

        {sims.length === 0 ? (
          <div className="tool-empty">
            <p>Simulations publish weekly during the season — check back soon.</p>
          </div>
        ) : (
          <>
            {gated && (
              <div className="tool-paywall reveal in" data-wall="compare-sims">
                <p>
                  You can compare the top {TEASER_LIMIT} players. Unlock all {weekData.rows.length} with Singularity.
                </p>
                <Link href="/#pricing" className="btn-primary">
                  See Pricing
                </Link>
              </div>
            )}
            <form className="compare-form">
              <ComparePlayerPickers
                key={JSON.stringify(params || {})} /* a Back / Forward navigation re-reads the boxes from the address */
                players={playerOptions}
                defaults={{ p1: params?.p1 || "", p2: params?.p2 || "", p3: params?.p3 || "" }}
                maxPlayers={maxPlayers}
              />
            </form>

            {selected.length >= 2 ? (
              <>
                <CompareSims players={selected} maxCeiling={maxCeiling} />
                <ComparePlayerRadars players={comparePlayers} />
              </>
            ) : (
              <p className="tool-hint">Pick at least two players to compare them.</p>
            )}
          </>
        )}
      </main>
    </>
  );
}

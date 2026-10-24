import Link from "next/link";
import { resolveTier } from "@/lib/tier";
import { loadMyPlayers } from "@/lib/myPlayers";
import { createClient } from "@/lib/supabase/server";
import { resolveSort, sortRows } from "@/lib/sortLink";
import { getPlayerBiosByNamePos } from "@/lib/sleeper";
import InteractiveScript from "../../InteractiveScript";
import ExportCsvButton from "../ExportCsvButton";
import PlayerSimSearch from "../PlayerSimSearch";
import { TEASER_LIMIT, PAID_TIERS, getCachedWeekData, buildSimRows } from "./data";
import { getAchievements } from "../achievements";
import {
  PAID_TIERS as WEEKLY_PAID_TIERS,
  getCachedRedraftData,
  getCachedLeans,
  getCachedTdProfile,
  enrichRankings,
} from "../redraft-rankings/data";

// Each player's Weekly Projection Rankings badges, by name, so the full-screen toolbar's Badges filter works here too.
// Built from the same rows (and the same tier rule) as that dashboard; only {key, variant} is kept, which is all the
// filter matches on. Optional: if the weekly data can't load, the filter just finds no badges.
async function loadWeeklyBadges(tier, bioByNamePos) {
  try {
    const [cached, leanRows, tdProfile] = await Promise.all([getCachedRedraftData(), getCachedLeans(), getCachedTdProfile()]);
    if (!cached?.latest) return {};
    const rows = enrichRankings({ cached, hasFullAccess: WEEKLY_PAID_TIERS.includes(tier), tdProfile, leanRows, bioByNamePos });
    const out = {};
    for (const r of rows) {
      if (r.floor == null || r.ceiling == null) continue;
      const ach = getAchievements(r).map((a) => ({ key: a.key, variant: a.variant }));
      if (ach.length) out[r.player_name] = ach;
    }
    return out;
  } catch {
    return {};
  }
}

export const metadata = {
  title: "Player Season Simulations — Floor/Median/Ceiling Projections — Singularity Dynasty",
  description:
    "10,000-run Monte Carlo season simulations for every fantasy football player, distilled to floor, median, and ceiling point totals. Free top-10 preview for every Stargazer.",
};

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
  const [{ tier, mine }, weekData, bioByNamePos] =
    await Promise.all([
      // Who the viewer is and what teams they've saved (their own rows only) -- per-visitor,
      // so it sits outside the cached week data, in parallel with it.
      resolveTier(supabase).then(async (r) => ({ ...r, mine: await loadMyPlayers(supabase, r.user) })),
      getCachedWeekData(),
      getPlayerBiosByNamePos(),
    ]);
  const { latest, lastGameWeek } = weekData;
  const hasFullAccess = PAID_TIERS.includes(tier);

  const { sims, poolRows, totalCount, maxCeiling, wrTePool, simsWithComputed } = buildSimRows({
    cached: weekData,
    hasFullAccess,
    bioByNamePos,
    leagueTeams,
    superflex,
  });
  const isTeaser = !hasFullAccess && totalCount > sims.length;
  const { sortKey, sortDir } = resolveSort(params, "median", "desc");
  const canExport = tier === "singularity" && sims.length > 0;
  const positions = sortPositions([...new Set(sims.map((r) => r.position))]);

  const weeklyBadges = await loadWeeklyBadges(tier, bioByNamePos);
  const simsWithHeat = sortRows(simsWithComputed, sortKey, sortDir, COLUMN_TYPES).map((r) =>
    weeklyBadges[r.player_name] ? { ...r, weeklyBadges: weeklyBadges[r.player_name] } : r,
  );
  return (
    <div className="tool-page">
      <InteractiveScript />

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
              wrTePool={wrTePool}
              lastWeek={lastGameWeek}
              simLatestWeek={latest.week}
              leagueTeams={leagueTeams}
              superflex={superflex}
              mine={mine}
              gated={isTeaser}
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

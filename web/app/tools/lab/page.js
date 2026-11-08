import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { resolveTier } from "@/lib/tier";
import { loadMyPlayers } from "@/lib/myPlayers";
import { getPlayerBiosByNamePos } from "@/lib/sleeper";
import { buildLabRows } from "@/lib/labData";
import InteractiveScript from "../../InteractiveScript";
import LabClient from "./LabClient";
import { getCachedLabGames } from "./data";
import { PAID_TIERS, getCachedRedraftData, getCachedLeans, getCachedTdProfile, getCachedUsageProfile, enrichRankings } from "../redraft-rankings/data";
import { getCachedWeekData, buildSimRows } from "../player-simulations/data";

export const metadata = {
  title: "The Lab — Singularity Dynasty",
  description:
    "Research any player with the numbers behind the rankings: plot two stats against each other, rank a position on one, chart weekly scoring and compare players side by side.",
};

const TEASER_LIMIT = 50;

// The Lab: basic research on the numbers the site already publishes (lib/labMetrics.js). Depth follows the tools it draws from: everyone
// ranked this week for Explorer and Singularity, the top 50 for everyone else (Weekly Projection Rankings' rule), and the season simulation
// numbers only for Singularity (Player Season Simulations' rule). The rows are cut server-side, so a page never carries what its viewer can't see.
export default async function LabPage({ searchParams }) {
  const params = await searchParams;
  const supabase = await createClient();
  const [{ tier, mine }, cached, bioByNamePos, leanRows, tdProfile, usageProfile] = await Promise.all([
    // Per-visitor like the tier: their saved teams (own rows only) for the My players filter.
    resolveTier(supabase).then(async (r) => ({ ...r, mine: await loadMyPlayers(supabase, r.user) })),
    getCachedRedraftData(),
    getPlayerBiosByNamePos(),
    getCachedLeans(),
    getCachedTdProfile(),
    getCachedUsageProfile(),
  ]);
  const { latest } = cached;
  const full = PAID_TIERS.includes(tier);
  const simsAccess = tier === "singularity";

  let lab = { rows: [], total: 0 };
  if (latest) {
    const [games, sims] = await Promise.all([
      getCachedLabGames(latest.season).catch((e) => {
        console.error("[lab] game log unavailable:", e.message);
        return {};
      }),
      simsAccess ? loadSims().catch(() => null) : null,
    ]);
    const ranked = enrichRankings({ cached, hasFullAccess: true, tdProfile, usageProfile, leanRows, bioByNamePos });
    lab = buildLabRows({ ranked, games, sims, limit: full ? Infinity : TEASER_LIMIT });
  }

  return (
    <>
      <InteractiveScript />
      <main id="main-content" className="wrap tool-wrap lab-wrap">
        <div className="eyebrow">{latest ? `Week ${latest.week} · ${latest.season}` : "Research"}</div>
        <h1>The Lab</h1>
        {lab.rows.length === 0 ? (
          <div className="tool-empty">
            <p>The Lab reads this week&apos;s rankings, which publish weekly during the season. Check back soon.</p>
          </div>
        ) : (
          <>
            {!full && (
              <div className="tool-paywall lab-paywall" data-wall="lab">
                <p>
                  You&apos;re researching the top {lab.rows.length} of this week&apos;s {lab.total} ranked players. Explorer opens every player; Singularity adds
                  the season simulation numbers.
                </p>
                <Link href="/#pricing" className="btn-primary">
                  See Pricing
                </Link>
              </div>
            )}
            <LabClient rows={lab.rows} week={latest.week} season={latest.season} simsAccess={simsAccess} mine={mine} gated={!full} initial={params || {}} />
          </>
        )}
      </main>
    </>
  );
}

// Season simulation numbers by player (median / floor / ceiling and vs pace), exactly as Player Season Simulations shows them.
async function loadSims() {
  const cached = await getCachedWeekData();
  if (!cached.latest) return null;
  const { simsWithComputed } = buildSimRows({ cached, hasFullAccess: true, bioByNamePos: {} });
  return Object.fromEntries(simsWithComputed.map((s) => [s.player_name, { median: s.median, floor: s.floor, ceiling: s.ceiling, pace: s.regressionScore }]));
}

import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { resolveTier } from "@/lib/tier";
import { getPlayerBiosByNamePos } from "@/lib/sleeper";
import InteractiveScript from "../../InteractiveScript";
import ComparePlayerPickers from "../ComparePlayerPickers";
import CompareWeekly from "../CompareWeekly";
import {
  PAID_TIERS,
  getCachedRedraftData,
  getCachedLeans,
  getCachedTdProfile, getCachedUsageProfile,
  enrichRankings,
} from "../redraft-rankings/data";

export const metadata = {
  title: "Compare Players — Weekly Projections — Singularity Dynasty",
  description:
    "Compare up to five players side by side on this week's projections: median, floor and ceiling, matchup, usage and touchdown profile, recent games, and badges.",
};

const SLOTS = ["p1", "p2", "p3", "p4", "p5"];
// Stargazer compares 2 players, Explorer and Singularity up to 5 (founder, Nov 8 2026; was 3).
const MAX_COMPARE = { stargazer: 2 };
const TEASER_LIMIT = 50;

// Same data and the same access rule as Weekly Projection Rankings: Explorer and Singularity can compare any ranked
// player, everyone else the top 50. The rows are the very ones the rankings dashboard shows (shared enrichRankings).
export default async function ComparePlayersPage({ searchParams }) {
  const params = await searchParams;
  const supabase = await createClient();
  const [{ tier }, cached, bioByNamePos, leanRows, tdProfile, usageProfile] = await Promise.all([
    resolveTier(supabase),
    getCachedRedraftData(),
    getPlayerBiosByNamePos(),
    getCachedLeans(),
    getCachedTdProfile(),
    getCachedUsageProfile(),
  ]);
  const hasFullAccess = PAID_TIERS.includes(tier);
  const { latest } = cached;

  const pool = latest ? enrichRankings({ cached, hasFullAccess, tdProfile, usageProfile, leanRows, bioByNamePos }) : [];
  const byName = new Map(pool.map((r) => [r.player_name, r]));
  const maxPlayers = MAX_COMPARE[tier] ?? SLOTS.length;
  const selected = [...new Set(SLOTS.slice(0, maxPlayers).map((slot) => byName.get(params?.[slot])).filter(Boolean))]; // the same player twice counts once
  const playerOptions = pool.map((r) => ({ player_name: r.player_name, position: r.position }));
  const maxSpread = pool.reduce((m, r) => Math.max(m, r.floor != null && r.ceiling != null ? r.ceiling - r.floor : 0), 1);
  const gated = !hasFullAccess && cached.rows.length > TEASER_LIMIT;

  return (
    <>
      <InteractiveScript />

      <main id="main-content" className="wrap tool-wrap compare-wrap">
        <div className="eyebrow">{latest ? `Week ${latest.week} · ${latest.season}` : "Compare"}</div>
        <h1>Compare Players</h1>
        <p className="tool-sub">
          Pick {maxPlayers > 2 ? `two to ${maxPlayers === 5 ? "five" : maxPlayers}` : "two"} players from this week&apos;s projections to see them side by side. Looking for full-season outlooks?{" "}
          <Link href="/tools/compare-player-sims" className="hub-panel-link">
            Compare season simulations →
          </Link>
        </p>

        {pool.length === 0 ? (
          <div className="tool-empty">
            <p>Rankings publish weekly during the season — check back soon.</p>
          </div>
        ) : (
          <>
            {gated && (
              <div className="tool-paywall reveal in" data-wall="compare-players">
                <p>
                  You can compare the top {TEASER_LIMIT} players. Unlock all {cached.rows.length} with Explorer or Singularity.
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
                defaults={Object.fromEntries(SLOTS.map((k) => [k, params?.[k] || ""]))}
                maxPlayers={maxPlayers}
                slots={SLOTS.length}
              />
            </form>

            {selected.length >= 2 ? (
              <CompareWeekly players={selected} maxSpread={maxSpread} />
            ) : (
              <p className="tool-hint">Pick at least two players to compare them.</p>
            )}
          </>
        )}
      </main>
    </>
  );
}

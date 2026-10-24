import Link from "next/link";
import { resolveTier } from "@/lib/tier";
import { loadMyPlayers } from "@/lib/myPlayers";
import { createClient } from "@/lib/supabase/server";
import { resolveSort, sortRows } from "@/lib/sortLink";
import { getPlayerBiosByNamePos } from "@/lib/sleeper";
import { stageTimer } from "@/lib/stageTimer";
import InteractiveScript from "../../InteractiveScript";
import ExportCsvButton from "../ExportCsvButton";
import RedraftRankingsClient from "./RedraftRankingsClient";
import { PAID_TIERS, OVERALL_COLUMN_TYPES, sortPositions, getCachedRedraftData, getCachedLeans, getCachedTdProfile, getCachedUsageProfile, enrichRankings } from "./data";

export const metadata = {
  title: "Weekly Projection Rankings (PPR) — Singularity Dynasty",
  description:
    "Standard weekly projection rankings for every position, refreshed weekly and adjusted for matchup and opponent-strength data. Free top-50 access for every Stargazer.",
};

// Stargazer sees the top 50 only; Explorer/Singularity see the full
// list — matches the pricing copy's "Weekly Projection Rankings (Top
// 50)" Stargazer bullet.
export default async function RedraftRankingsPage({ searchParams }) {
  const params = await searchParams;

  // Tier (auth + profile) is per-visitor, the cached bundle and the Sleeper
  // bios aren't -- all three run at once.
  const st = stageTimer("redraft-rankings");
  const supabase = await st.time("client", createClient());
  const [{ tier, mine }, cached, bioByNamePos, leanRows, tdProfile, usageProfile] = await Promise.all([
    // Per-visitor like the tier: their saved teams (own rows only) for the My players view.
    st.time("tier+mine", resolveTier(supabase).then(async (r) => ({ ...r, mine: await loadMyPlayers(supabase, r.user) }))),
    st.time("data", getCachedRedraftData()),
    st.time("bios", getPlayerBiosByNamePos()),
    st.time("leans", getCachedLeans()),
    st.time("td", getCachedTdProfile()),
    st.time("usage", getCachedUsageProfile()),
  ]);
  const hasFullAccess = PAID_TIERS.includes(tier);
  const { latest } = cached;

  let rankings = [];
  let totalCount = 0;

  if (latest) {
    totalCount = cached.rows.length;
    rankings = st.run("enrich", () => enrichRankings({ cached, hasFullAccess, tdProfile, usageProfile, leanRows, bioByNamePos }));
  }
  st.done();

  // Widest floor-to-ceiling range this week -- the Outcome Curve column
  // scales each row's middle zone against this, so range width is
  // comparable across rows instead of just two separate digits.
  const maxSpread = rankings.reduce((m, r) => {
    const span = r.floor != null && r.ceiling != null ? r.ceiling - r.floor : 0;
    return Math.max(m, span);
  }, 1);

  const positions = sortPositions([...new Set(rankings.map((r) => r.position))]);

  const { sortKey, sortDir } = resolveSort(params, "rank", "asc");
  const overallRows = sortRows(
    rankings.map((r) => ({ ...r, displayRank: r.rank })),
    sortKey,
    sortDir,
    OVERALL_COLUMN_TYPES
  );
  const canExport = tier === "singularity" && rankings.length > 0;
  const isTeaser = !hasFullAccess && totalCount > 50;

  return (
    <div className="tool-page">
      <InteractiveScript />

      <main className="wrap tool-wrap redraft-wrap">
        {rankings.length === 0 ? (
          <>
            <div className="eyebrow">
              {latest ? `Week ${latest.week} · ${latest.season}` : "Projections"}
            </div>
            <h1>Weekly Projection Rankings</h1>
            <p className="tool-sub">
              Standard weekly projection rankings, refreshed every week of the season and
              adjusted for opponent-strength and matchup efficiency data.
              Top 50 free for every Stargazer.
            </p>
            <div className="tool-empty">
              <p>
                Rankings publish weekly during the season — check back soon.
              </p>
            </div>
          </>
        ) : (
          <>
            <RedraftRankingsClient
              rawRows={overallRows}
              sortKey={sortKey}
              sortDir={sortDir}
              currentParams={params}
              positions={positions}
              maxSpread={maxSpread}
              mine={mine}
              gated={isTeaser}
              header={
                <>
                  <div className="eyebrow">
                    {latest ? `Week ${latest.week} · ${latest.season}` : "Projections"}
                  </div>
                  <h1>Weekly Projection Rankings</h1>
                </>
              }
              actions={
                <>
                  <Link href="/tools/compare-players" className="hub-panel-link">
                    Compare Players →
                  </Link>
                  {canExport && (
                    <ExportCsvButton
                      filename={`redraft-rankings-week${latest.week}-${latest.season}.csv`}
                      href="/api/redraft-rankings/csv"
                    />
                  )}
                </>
              }
            />

            {isTeaser && (
              <div className="tool-paywall reveal in">
                <p>
                  You&apos;re seeing the top 50 of {totalCount} players. Unlock
                  the full list with Explorer or Singularity.
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

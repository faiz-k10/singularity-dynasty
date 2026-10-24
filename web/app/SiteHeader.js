import Link from "next/link";
import { sampleWithReplacement } from "@/lib/sample";
import { unstable_cache } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getAuthUser } from "@/lib/authUser";
import { createPublicClient } from "@/lib/supabase/public";
import { fetchAllRows } from "@/lib/fetchAllRows";
import ThemeToggle from "./ThemeToggle";
import InteractiveScript from "./InteractiveScript";
import { getAchievements } from "./tools/achievements";
import { getCachedRedraftData, getCachedTdProfile, getCachedUsageProfile, computeRanks } from "./tools/redraft-rankings/data";
import { computeRegressionScore } from "@/lib/regressionScore";
import { buildTeamWeeks, indexGameLog, teamGamesThrough } from "@/lib/teamGames";
import {
  fetchAchievementInputs,
  fetchLatestRedraftFieldsByName,
  fetchWoprPercentileByName,
  buildAchievementRow,
} from "./tools/achievementsData";

// The full badge set (achievementsData.js) needs a per-game floor/
// ceiling join across ALL of redraft_rankings' publish history plus the
// whole player_game_log table -- real weight for a component mounted on
// EVERY page of the site. Cached for 60s (same window Player Season
// Simulations already uses for its own weekly-data fetch) so that cost
// is paid once per minute total, not once per page load -- the random
// SAMPLING below still runs fresh on every request against whatever the
// cache last returned, so "re-rolled on every site refresh" still holds
// for the picks themselves, just not for the underlying data fetch.
const TICKER_PLAYERS = 36;
const TICKER_ITEMS = 60;

const getCachedTickerInputs = unstable_cache(
  async () => {
    const publicSupabase = createPublicClient();
    const { data: latestRedraft } = await publicSupabase
      .from("redraft_rankings")
      .select("season, week")
      .order("season", { ascending: false })
      .order("week", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (!latestRedraft) return { topRows: [], paceByName: {}, achievementInputs: null, redraftFieldsByName: {}, woprPercentileByName: {}, groupRankByName: {} };

    const [{ data: topRows }, achievementInputs, redraftFieldsByName, woprPercentileByName, rankingData, tdProfile, usageProfile] = await Promise.all([
      publicSupabase
        .from("redraft_rankings")
        .select("player_name, position")
        .eq("season", latestRedraft.season)
        .eq("week", latestRedraft.week)
        .order("rank", { ascending: true })
        .limit(TICKER_PLAYERS),
      fetchAchievementInputs(publicSupabase, latestRedraft.season),
      fetchLatestRedraftFieldsByName(publicSupabase),
      fetchWoprPercentileByName(publicSupabase),
      // For the Elite Role / Elite Player badges: where each ticker player stands in his position's Role and Player groups (the same ranking the
      // opened-player panel uses, over the whole ranked pool).
      getCachedRedraftData(),
      getCachedTdProfile(),
      getCachedUsageProfile(),
    ]);
    const allGroupRanks = rankingData?.rows?.length ? computeRanks({ cached: rankingData, tdProfile, usageProfile }).groupRank : {};
    const groupRankByName = Object.fromEntries((topRows || []).filter((r) => allGroupRanks[r.player_name]).map((r) => [r.player_name, allGroupRanks[r.player_name]]));

    // "vs. pace" per player: points scored so far minus what the latest
    // season projection implied through his team's games so far (same
    // formula as the Player Season Simulations pace panel,
    // lib/regressionScore.js).
    const paceByName = {};
    const names = (topRows || []).map((r) => r.player_name);
    if (names.length) {
      const { data: latestSim } = await publicSupabase
        .from("player_simulations")
        .select("season, week")
        .order("season", { ascending: false })
        .order("week", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (latestSim) {
        // Their games from the season's game log (the same points
        // player_actual_production holds -- it is built from this table).
        const [{ data: sims }, ownRows] = await Promise.all([
          publicSupabase
            .from("player_simulations")
            .select("player_name, median")
            .eq("season", latestSim.season)
            .eq("week", latestSim.week)
            .in("player_name", names),
          fetchAllRows(publicSupabase, "player_game_log", "player_name, team, week, fantasy_points_ppr", (q) =>
            q.eq("season", latestSim.season).in("player_name", names).order("week", { ascending: true }).order("player_name", { ascending: true })
          ),
        ]);
        const pts = {};
        for (const g of ownRows || []) {
          if (typeof g.fantasy_points_ppr === "number") (pts[g.player_name] ??= []).push(g.fantasy_points_ppr);
        }
        // Games each player's team has played, so games he missed count against
        // his pace like they do on Player Season Simulations (lib/teamGames.js).
        // Every game has a QB row, so the QBs' rows alone give each team's
        // played weeks cheaply. Optional: without it, falls back to games played.
        let teamIdx = null;
        try {
          const qbRows = await fetchAllRows(publicSupabase, "player_game_log", "player_name, team, week", (q) =>
            q.eq("season", latestSim.season).eq("position", "QB").order("week", { ascending: true }).order("player_name", { ascending: true })
          );
          teamIdx = { gamesByName: indexGameLog(ownRows).gamesByName, teamWeeks: buildTeamWeeks(qbRows) };
        } catch (e) {
          console.error("[ticker] team games unavailable, using games played:", e.message);
        }
        for (const sim of sims || []) {
          const elapsed = teamIdx ? teamGamesThrough(teamIdx, sim.player_name) : null;
          const r = computeRegressionScore(pts[sim.player_name], sim.median / 17, elapsed);
          if (r) paceByName[sim.player_name] = r.regressionScore;
        }
      }
    }
    return { topRows: topRows || [], paceByName, achievementInputs, redraftFieldsByName, woprPercentileByName, groupRankByName };
  },
  ["site-header-ticker-inputs"],
  // 10 minutes: the picks are re-rolled on every request anyway, and the data underneath only changes when a week is published.
  { revalidate: 600 }
);

// Shared by every page: the fixed telemetry ticker + full-width site banner
// (brand, section nav, Get Started/Account, hamburger + radial-menu mobile
// fallback). Nav links use /#section so they work whether the visitor is
// already on the homepage (smooth-scroll, see InteractiveScript) or on a
// tool/auth/legal page (full navigation back to the homepage section).
export default async function SiteHeader() {
  const supabase = await createClient();
  const user = await getAuthUser(supabase);

  // Ticker: a random assortment of 50 achievement badges -- the FULL set
  // (On Fire/On Thin Ice/Risky Icarus/Steady Eddy/Buy Low/Sell High/
  // Super Hero/Honorable/Con Artist; Confidence excluded, see below) drawn from the top 20
  // players of the latest published redraft_rankings week, same as every
  // other badge surface on the site now uses (achievementsData.js).
  // Confidence (Established/Building) is the one flag deliberately left
  // out by request -- it's common enough among the top 20 that it was
  // dominating the ticker and crowding out every rarer flag. The
  // expensive per-player data (getCachedTickerInputs above) is cached
  // 60s; the random SAMPLING here still runs fresh on every request
  // against whatever that cache last returned, so "re-rolled on every
  // site refresh" still holds for the actual picks shown.
  let tickerItems = [];
  const { topRows, paceByName, achievementInputs, redraftFieldsByName, woprPercentileByName, groupRankByName } = await getCachedTickerInputs();
  if (achievementInputs) {
    // One ticker item per player: his name followed by ALL his badge icons (no text labels), so the strip reads as
    // "who, and what they have earned" at a glance. Players with no badge are skipped.
    const pool = (topRows || [])
      .map((r) => {
        const badges = getAchievements({
          ...buildAchievementRow(r.player_name, r.position, { ...achievementInputs, redraftFieldsByName, woprPercentileByName }),
          groupRank: groupRankByName?.[r.player_name],
        })
          .filter((a) => a.key !== "confidence")
          .map((a) => ({ key: a.key, variant: a.variant, ...(a.tier ? { tier: a.tier } : {}) }));
        return badges.length ? { name: r.player_name, badges } : null;
      })
      .filter(Boolean);
    // Each player's vs. pace number is its own kind of item. Badge items lead the strip (about two thirds of it); a sample of
    // each kind is drawn separately so the smaller badge pool is not drowned out by the larger pace pool.
    const pacePool = [];
    for (const r of topRows || []) {
      const v = paceByName?.[r.player_name];
      if (typeof v === "number") {
        pacePool.push({
          name: r.player_name,
          key: "pace",
          variant: v >= 0 ? "hot" : "cold",
          label: `${v >= 0 ? "+" : ""}${v.toFixed(2)}`,
        });
      }
    }
    const badgeShare = pool.length > 0 && pacePool.length > 0 ? Math.round(TICKER_ITEMS * 0.65) : pool.length > 0 ? TICKER_ITEMS : 0;
    const picks = [
      ...(badgeShare > 0 ? sampleWithReplacement(pool, badgeShare) : []),
      ...(pacePool.length > 0 ? sampleWithReplacement(pacePool, TICKER_ITEMS - badgeShare) : []),
    ];
    if (picks.length > 0) tickerItems = picks;
  }

  return (
    <>
      <div className="ticker-bar">
        <div className="ticker-track" id="tickerTrack"></div>
      </div>

      <ThemeToggle />
      <button
        className="menu-btn"
        id="menuBtn"
        aria-label="Open menu"
        aria-expanded="false"
      >
        ☰
      </button>

      <header className="site-header">
        <Link href="/#hero" className="brandmark">
          <span className="ring"></span>Singularity Dynasty
        </Link>
        <nav className="top-nav-bar" id="topNavBar" aria-label="Primary">
          <div className="nav-dropdown">
            <Link href="/#tools">Tools</Link>
            {/* Foldout: a wide glass panel that unfolds under the link -- one card per tool (icon, name, what it does,
                who it is for), plus quick links underneath. CSS-only (:hover / :focus-within), like the other menus. */}
            <div className="nav-foldout">
              <div className="nav-foldout-grid">
                <Link href="/tools/player-simulations" className="nav-fold-card">
                  <span className="nav-fold-icon" aria-hidden="true">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M4 20V13M9 20V6M14 20v-9M19 20V9" /><path d="M3 20h18" /></svg>
                  </span>
                  <span className="nav-fold-body">
                    <span className="nav-fold-title">Player Season Simulations</span>
                    <span className="nav-fold-desc">10,000 simulated seasons per player: floor, median and ceiling.</span>
                    <span className="nav-fold-chip nf-singularity">Singularity <i>Updated Tuesdays</i></span>
                  </span>
                </Link>
                <Link href="/tools/redraft-rankings" className="nav-fold-card">
                  <span className="nav-fold-icon" aria-hidden="true">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M9 6h12M9 12h12M9 18h12" /><path d="M3.5 6h.01M3.5 12h.01M3.5 18h.01" strokeWidth="3" /></svg>
                  </span>
                  <span className="nav-fold-body">
                    <span className="nav-fold-title">Weekly Projection Rankings</span>
                    <span className="nav-fold-desc">This week&apos;s matchup-adjusted rankings, with floor and ceiling.</span>
                    <span className="nav-fold-chip nf-explorer">Explorer <i>Updated Tuesdays</i></span>
                  </span>
                </Link>
                <Link href="/tools/draft-board" className="nav-fold-card">
                  <span className="nav-fold-icon" aria-hidden="true">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="3.5" y="3.5" width="7" height="7" rx="1.6" /><rect x="13.5" y="3.5" width="7" height="7" rx="1.6" /><rect x="3.5" y="13.5" width="7" height="7" rx="1.6" /><rect x="13.5" y="13.5" width="7" height="7" rx="1.6" /></svg>
                  </span>
                  <span className="nav-fold-body">
                    <span className="nav-fold-title">Dynasty Draft Board</span>
                    <span className="nav-fold-desc">Startup and rookie boards, round by round, with stacks flagged.</span>
                    <span className="nav-fold-chip nf-explorer">Explorer <i>Updated every 2 weeks</i></span>
                  </span>
                </Link>
                <Link href="/tools/prospect-rankings" className="nav-fold-card">
                  <span className="nav-fold-icon" aria-hidden="true">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="m12 3.5 2.6 5.4 5.9.8-4.3 4.1 1 5.9L12 17l-5.2 2.7 1-5.9-4.3-4.1 5.9-.8Z" /></svg>
                  </span>
                  <span className="nav-fold-body">
                    <span className="nav-fold-title">Prospect Rankings</span>
                    <span className="nav-fold-desc">WR and QB prospect boards with side-by-side comparisons.</span>
                    <span className="nav-fold-chip nf-free">Free <i>Updated every 2 weeks</i></span>
                  </span>
                </Link>
              </div>
              <div className="nav-foldout-foot">
                <Link href="/tools/compare-players">Compare players →</Link>
                <Link href="/tools/compare-player-sims">Compare simulations →</Link>
                <Link href="/#tools">All tools →</Link>
              </div>
            </div>
          </div>
          <Link href="/#feed">Feed</Link>
          <Link href="/my-team">My Team</Link>
          <Link href={user ? "/account" : "/login"} className="tn-account">
            {user ? "Account" : "Sign In"}
          </Link>
          <Link
            href="/#pricing"
            className="tn-cta tn-cta-tiers"
            aria-label="Get started: Stargazer is free, Explorer is $9 a month, Singularity is $25 a month"
            title="Get started"
          >
            <span className="tn-tier"><b><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true"><circle cx="12" cy="12" r="8.5" /><circle cx="12" cy="12" r="3" fill="currentColor" stroke="none" /></svg>Singularity</b><small>Everything · $25/mo</small></span>
            <span className="tn-tier"><b><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m15.5 8.5-2 5-5 2 2-5Z" fill="currentColor" /><circle cx="12" cy="12" r="9" /></svg>Explorer</b><small>Full lists · $9/mo</small></span>
            <span className="tn-tier"><b><svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="m12 2.8 2.7 5.7 6.2.8-4.6 4.3 1.2 6.1L12 16.7 6.5 19.7l1.2-6.1L3.1 9.3l6.2-.8Z" /></svg>Stargazer</b><small>Top 50 · Free</small></span>
          </Link>
        </nav>
        <div className="site-header-spacer" aria-hidden="true"></div>
      </header>

      <div className="radial-menu" id="radialMenu">
        <nav>
          <Link href="/#tools">Tools</Link>
          <Link href="/#pricing">Pricing</Link>
          <Link href="/#feed">Feed</Link>
          <Link href="/my-team">My Team</Link>
          <Link href={user ? "/account" : "/login"}>
            {user ? "Account" : "Sign In"}
          </Link>
          <Link href="/#pricing" className="rm-cta">
            Get Started →
          </Link>
        </nav>
      </div>

      <InteractiveScript tickerItems={tickerItems} />
    </>
  );
}

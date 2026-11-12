import Link from "next/link";
import { Suspense } from "react";
import { sampleUnique } from "@/lib/sample";
import { createClient } from "@/lib/supabase/server";
import { createPublicClient } from "@/lib/supabase/public";
import { fetchAllRows, must, cachedOrElse } from "@/lib/fetchAllRows";
import ThemeToggle from "./ThemeToggle";
import InteractiveScript from "./InteractiveScript";
import TickerTrack from "./TickerTrack";
import ToolLink from "./ToolLink";
import HeaderNavLink from "./HeaderNavLink";
import { HeaderPlans, HeaderLetter } from "./HeaderMenus";
import ToolsMenuRows from "./ToolsMenu";
import { resolveTier } from "@/lib/tier";
import BrandMark from "./BrandMark";
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

const EMPTY_TICKER = { topRows: [], paceByName: {}, achievementInputs: null, redraftFieldsByName: {}, woprPercentileByName: {}, groupRankByName: {} };
const getCachedTickerInputs = cachedOrElse(
  async () => {
    const publicSupabase = createPublicClient();
    const latestRedraft = must(
      await publicSupabase.from("redraft_rankings").select("season, week").order("season", { ascending: false }).order("week", { ascending: false }).limit(1).maybeSingle()
    );
    if (!latestRedraft) return EMPTY_TICKER;

    const [topRes, achievementInputs, redraftFieldsByName, woprPercentileByName, rankingData, tdProfile, usageProfile] = await Promise.all([
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
    const topRows = must(topRes);
    const allGroupRanks = rankingData?.rows?.length ? computeRanks({ cached: rankingData, tdProfile, usageProfile }).groupRank : {};
    const groupRankByName = Object.fromEntries((topRows || []).filter((r) => allGroupRanks[r.player_name]).map((r) => [r.player_name, allGroupRanks[r.player_name]]));

    // "vs. pace" per player: points scored so far minus what the latest
    // season projection implied through his team's games so far (same
    // formula as the Player Season Simulations pace panel,
    // lib/regressionScore.js).
    const paceByName = {};
    const names = (topRows || []).map((r) => r.player_name);
    if (names.length) {
      const latestSim = must(
        await publicSupabase.from("player_simulations").select("season, week").order("season", { ascending: false }).order("week", { ascending: false }).limit(1).maybeSingle()
      );
      if (latestSim) {
        // Their games from the season's game log (the same points
        // player_actual_production holds -- it is built from this table).
        const [simsRes, ownRows] = await Promise.all([
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
        const sims = must(simsRes);
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
  { revalidate: 3600, tags: ["model-data"] },
  EMPTY_TICKER
);

// The ticker's picks, worked out from getCachedTickerInputs and handed to TickerTrack. A SEPARATE async component inside a Suspense boundary (SiteHeader below),
// so the heaviest data on every page (the whole season's game log and the ranking data) never holds the page's first byte back: the nav and the page render
// at once and the strip fills in a moment later (right away when the cache is warm; after a deploy the first visitor used to wait for all of it).
async function TickerFeed() {
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
    // One strip item per player: a name shared by the badge and pace pools is drawn once.
    const seen = new Set();
    const picks = [
      ...(badgeShare > 0 ? sampleUnique(pool, badgeShare, seen) : []),
      ...(pacePool.length > 0 ? sampleUnique(pacePool, TICKER_ITEMS - badgeShare, seen) : []),
    ];
    if (picks.length > 0) tickerItems = picks;
  }
  return <TickerTrack items={tickerItems} />;
}

// The ticker strip on its own: the empty bar now, its picks streamed in after the page. Used by SiteHeader and by the landing page
// (EventHorizon has its own header, so it renders just this above it).
export function SiteTicker() {
  return (
    <>
      {/* A scrolling strip of names and numbers: decorative for screen readers (every figure in it is on the tool pages). */}
      <div className="ticker-bar" aria-hidden="true">
        <div className="ticker-track" id="tickerTrack"></div>
      </div>
      <Suspense fallback={null}>
        <TickerFeed />
      </Suspense>
    </>
  );
}

// Shared by every page: the fixed telemetry ticker + full-width site banner
// (brand, section nav with The Observatory, the pricing pill, Account at the right end, hamburger + radial-menu mobile
// fallback). Nav links use /#section so they work whether the visitor is
// already on the homepage (smooth-scroll, see InteractiveScript) or on a
// tool/auth/legal page (full navigation back to the homepage section).
export default async function SiteHeader({ scripts = true }) {
  const supabase = await createClient();
  const { user, tier } = await resolveTier(supabase); // the tier sets what the Tools menu says each tool gives this viewer

  return (
    <>
      <SiteTicker />

      <ThemeToggle />
      <button
        className="menu-btn"
        id="menuBtn"
        aria-label="Open menu"
        aria-expanded="false"
      >
        ☰
      </button>

      {/* Same shape as the landing page's bar (founder, Nov 10 2026): Tools / Plans / Newsletter on the left (My Team and The
          Observatory live in the Tools dropdown), the mark and the name in the middle, Sign in on the right (the theme switch after it), quiet mono links that turn ink on hover and for the open page. */}
      <header className="site-header">
        <nav className="top-nav-bar sh-left" id="topNavBar" aria-label="Primary">
          <div className="nav-dropdown">
            <Link href="/#tools">Tools</Link>
            {/* Foldout: a ladder of tools, one rung each (icon, name, what it does, who it is for). CSS-only (:hover / :focus-within). */}
            <div className="nav-foldout tmenu-panel">
              <div className="tmenu-panel-inner">
                <ToolsMenuRows tier={tier} />
              </div>
            </div>
          </div>
          <HeaderPlans />
          <HeaderLetter />
        </nav>
        <ToolLink href="/" className="brandmark">
          <BrandMark />The Dynasty Singularity
        </ToolLink>
        <nav className="top-nav-bar sh-right" aria-label="Account">
          {user && <HeaderNavLink href="/account/sky">Night Sky</HeaderNavLink>}
          <HeaderNavLink href={user ? "/account" : "/login"} className="tn-box tn-account">
            {user ? "Account" : "Sign in"}
          </HeaderNavLink>
        </nav>
      </header>

      <div className="radial-menu" id="radialMenu">
        <nav>
          <Link href="/#tools">Tools</Link>
          <Link href="/#pricing">Pricing</Link>
          <Link href="/#feed">Feed</Link>
          <ToolLink href="/my-team">My Team</ToolLink>
          {user && <ToolLink href="/account/sky">Night Sky</ToolLink>}
          <ToolLink href="/tools/lab">The Observatory</ToolLink>
          <Link href="/how-it-works">How It Works</Link>
          <Link href={user ? "/account" : "/login"}>
            {user ? "Account" : "Sign In"}
          </Link>
          <Link href="/#pricing" className="rm-cta">
            Get Started →
          </Link>
        </nav>
      </div>

      {scripts && <InteractiveScript />}
    </>
  );
}

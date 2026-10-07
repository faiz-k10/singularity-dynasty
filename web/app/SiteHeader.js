import Link from "next/link";
import { sampleWithReplacement } from "@/lib/sample";
import { unstable_cache } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createPublicClient } from "@/lib/supabase/public";
import { fetchAllRows } from "@/lib/fetchAllRows";
import ThemeToggle from "./ThemeToggle";
import InteractiveScript from "./InteractiveScript";
import NavStars from "./NavStars";
import { getAchievements } from "./tools/achievements";
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
    if (!latestRedraft) return { topRows: [], paceByName: {}, achievementInputs: null, redraftFieldsByName: {}, woprPercentileByName: {} };

    const [{ data: topRows }, achievementInputs, redraftFieldsByName, woprPercentileByName] = await Promise.all([
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
    ]);

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
            q.eq("season", latestSim.season).in("player_name", names).order("week", { ascending: true })
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
            q.eq("season", latestSim.season).eq("position", "QB").order("week", { ascending: true })
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
    return { topRows: topRows || [], paceByName, achievementInputs, redraftFieldsByName, woprPercentileByName };
  },
  ["site-header-ticker-inputs"],
  { revalidate: 60 }
);

// Shared by every page: the fixed telemetry ticker + full-width site banner
// (brand, section nav, Get Started/Account, hamburger + radial-menu mobile
// fallback). Nav links use /#section so they work whether the visitor is
// already on the homepage (smooth-scroll, see InteractiveScript) or on a
// tool/auth/legal page (full navigation back to the homepage section).
export default async function SiteHeader() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Ticker: a random assortment of 50 achievement badges -- the FULL set
  // (On Fire/On Thin Ice/Risky Icarus/Steady Eddy/Buy Low/Sell High/
  // Weekly Hero/Honorable/Con Artist; Confidence excluded, see below) drawn from the top 20
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
  const { topRows, paceByName, achievementInputs, redraftFieldsByName, woprPercentileByName } = await getCachedTickerInputs();
  if (achievementInputs) {
    const pool = (topRows || []).flatMap((r) =>
      getAchievements(
        buildAchievementRow(r.player_name, r.position, { ...achievementInputs, redraftFieldsByName, woprPercentileByName })
      )
        .filter((a) => a.key !== "confidence")
        .map((a) => ({
          name: r.player_name,
          key: a.key,
          variant: a.variant,
          label: a.label,
        }))
    );
    // Each player's vs. pace number rides in the same pool as their badges.
    for (const r of topRows || []) {
      const v = paceByName?.[r.player_name];
      if (typeof v === "number") {
        pool.push({
          name: r.player_name,
          key: "pace",
          variant: v >= 0 ? "hot" : "cold",
          label: `${v >= 0 ? "+" : ""}${v.toFixed(2)}`,
        });
      }
    }
    if (pool.length > 0) {
      tickerItems = sampleWithReplacement(pool, TICKER_ITEMS);
    }
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
          <Link href="/#pricing" className="tn-cta">
            Get Started
          </Link>
          <div className="nav-dropdown">
            <Link href="/#tools">Tools</Link>
            <div className="nav-dropdown-menu">
              <Link href="/tools/player-simulations">Player Season Simulations</Link>
              <Link href="/tools/draft-board">Dynasty Draft Board</Link>
              <Link href="/tools/redraft-rankings">Weekly Projection Rankings</Link>
              <Link href="/tools/prospect-rankings">WR/QB Prospect Rankings &amp; Comparisons</Link>
            </div>
          </div>
          <div className="nav-dropdown">
            <Link href="/#pricing">Pricing</Link>
            <div className="nav-dropdown-menu nav-dropdown-menu-stars">
              <NavStars />
              <Link href="/#pricing">Stargazer</Link>
              <Link href="/#pricing">Explorer</Link>
              <Link href="/#pricing">Singularity</Link>
            </div>
          </div>
          <Link href="/#feed">Feed</Link>
          <Link href="/my-team">My Team</Link>
          <Link href={user ? "/account" : "/login"} className="tn-account">
            {user ? "Account" : "Sign In"}
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

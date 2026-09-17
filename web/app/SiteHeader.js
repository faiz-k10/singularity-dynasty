import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import ThemeToggle from "./ThemeToggle";
import InteractiveScript from "./InteractiveScript";
import NavStars from "./NavStars";
import { getAchievements } from "./tools/achievements";

// Shared by every page: the fixed telemetry ticker + full-width site banner
// (brand, section nav, Get Started/Account, hamburger + radial-menu mobile
// fallback). Nav links use /#section so they work whether the visitor is
// already on the homepage (smooth-scroll, see InteractiveScript) or on a
// tool/auth/legal page (full navigation back to the homepage section).
export default async function SiteHeader() {
  const supabase = await createClient();
  const [
    {
      data: { user },
    },
    { data: latestRedraft },
  ] = await Promise.all([
    supabase.auth.getUser(),
    supabase
      .from("redraft_rankings")
      .select("season, week")
      .order("season", { ascending: false })
      .order("week", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  // Ticker: a random assortment of 50 achievement badges (the same
  // Risky Icarus/Steady Eddy flags Weekly Projection Rankings' player
  // banner shows -- see achievements.js) drawn from the top 20 players
  // of the latest published redraft_rankings week. Re-rolled on every
  // request since this is a Server Component -- no caching layer sits in
  // front of it, so "every site refresh" falls out for free.
  // getAchievements() no longer emits a trend flag at all (removed
  // entirely, see achievements.js). On Fire/On Thin Ice/Weekly Hero/
  // Honorable/Con Artist are skipped here too, quietly rather than by an
  // explicit filter -- they all key off row.recentGames/row.heroWins,
  // which this query below never fetches (that's player_game_log plus
  // redraft_rankings' full publish history, a much heavier pull than
  // this component's one lightweight top-20 query), so getAchievements()
  // just never has the inputs to raise them here. Confidence
  // (Established/Building) DOES have what it needs from this query, but
  // is explicitly filtered out by request -- it was dominating the
  // ticker just by being the only flag nearly every top-20 player
  // qualifies for, crowding out the rarer Risky Icarus/Steady Eddy
  // picks.
  let tickerItems = [];
  if (latestRedraft) {
    const { data: topRows } = await supabase
      .from("redraft_rankings")
      .select("player_name, floor, ceiling, projection, sample_confidence, notes")
      .eq("season", latestRedraft.season)
      .eq("week", latestRedraft.week)
      .order("rank", { ascending: true })
      .limit(20);
    const pool = (topRows || []).flatMap((r) =>
      getAchievements(r)
        .filter((a) => a.key !== "confidence")
        .map((a) => ({
          name: r.player_name,
          key: a.key,
          variant: a.variant,
          label: a.label,
        }))
    );
    if (pool.length > 0) {
      tickerItems = Array.from({ length: 50 }, () => pool[Math.floor(Math.random() * pool.length)]);
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

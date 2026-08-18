import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import ThemeToggle from "./ThemeToggle";
import InteractiveScript from "./InteractiveScript";

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

  // Ticker: real RISING/FALLING/STEADY data from the latest published
  // redraft_rankings week (free-for-everyone table, so this always has the
  // broadest player pool available). Falls back to InteractiveScript's own
  // randomized sample if nothing's published yet.
  let tickerPlayers = [];
  if (latestRedraft) {
    const { data: tickerRows } = await supabase
      .from("redraft_rankings")
      .select("player_name, trend")
      .eq("season", latestRedraft.season)
      .eq("week", latestRedraft.week)
      .not("trend", "is", null)
      .order("rank", { ascending: true })
      .limit(50);
    tickerPlayers = (tickerRows || []).map((r) => ({ name: r.player_name, trend: r.trend }));
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
              <Link href="/tools/redraft-rankings">Redraft Weekly Rankings</Link>
              <Link href="/tools/prospect-rankings">WR/QB Prospect Rankings &amp; Comparisons</Link>
            </div>
          </div>
          <div className="nav-dropdown">
            <Link href="/#pricing">Pricing</Link>
            <div className="nav-dropdown-menu">
              <Link href="/#pricing">Stargazer</Link>
              <Link href="/#pricing">Explorer</Link>
              <Link href="/#pricing">Singularity</Link>
            </div>
          </div>
          <Link href="/#feed">Feed</Link>
          <Link href="/#playground">Play</Link>
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
          <Link href="/#playground">Play</Link>
          <Link href={user ? "/account" : "/login"}>
            {user ? "Account" : "Sign In"}
          </Link>
          <Link href="/#pricing" className="rm-cta">
            Get Started →
          </Link>
        </nav>
      </div>

      <InteractiveScript tickerPlayers={tickerPlayers} />
    </>
  );
}

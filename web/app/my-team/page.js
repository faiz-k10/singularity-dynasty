import SiteHeader from "../SiteHeader";
import { createClient } from "@/lib/supabase/server";
import { createPublicClient } from "@/lib/supabase/public";
import { resolveTier, savedTeamLimit } from "@/lib/tier";
import { normalizePlayerName, buildPortfolio } from "@/lib/portfolio";
import { getSleeperPlayers } from "@/lib/sleeper";
import { loadInsight, loadTeamInsightForAll, computeAndSaveInsight } from "@/lib/insights";
import PortfolioOverview from "./PortfolioOverview";
import ExposureSidebar from "./ExposureSidebar";
import MyTeamClient from "./MyTeamClient";

export const metadata = {
  title: "My Team — Singularity Dynasty",
  description:
    "Import your team from Sleeper, save it, and get ready for personalized roster analysis.",
};

// Step one of the team & profile builder (see CLAUDE.md's roadmap):
// import a real roster from Sleeper (Yahoo/ESPN later), save it, and this
// becomes the data Team Analysis reads from once that's built. Sleeper's
// API is public/unauthenticated, so the lookup itself works signed out --
// only saving a team needs an account (lib/sleeper.js + actions.js).
export default async function MyTeamPage() {
  const supabase = await createClient();
  const { user, tier } = await resolveTier(supabase);

  let savedTeams = [];
  if (user) {
    // select("*") rather than an explicit column list so the page keeps
    // working if a column-adding migration (e.g. 0025 buy_in) hasn't been
    // applied yet -- rows are RLS-scoped to this user regardless.
    const { data } = await supabase
      .from("saved_teams")
      .select("*")
      .eq("user_id", user.id)
      .order("created_at", { ascending: true });
    savedTeams = data || [];
  }

  // GM Archetype (user-scoped) + per-team season-record badges
  // (team-scoped) -- see lib/insights/. Merging the record tier straight
  // into each team's settings object is what lets MyTeamClient's
  // existing LeagueBadges render it as one more pill alongside Teams/
  // Roster Spots/Scoring, without threading a separate prop through.
  let archetypeResult = null;
  if (user) {
    const row = await loadInsight(supabase, { key: "gm_archetype_quiz", userId: user.id });
    archetypeResult = row?.value || null;
  }
  if (user && savedTeams.length) {
    const recordInsights = await loadTeamInsightForAll(supabase, {
      key: "season_record_badge",
      userId: user.id,
      savedTeamIds: savedTeams.map((t) => t.id),
    });
    savedTeams = savedTeams.map((t) => {
      const tier = recordInsights.get(t.id)?.value?.tier;
      return tier ? { ...t, settings: { ...(t.settings || {}), recordTier: tier } } : t;
    });
  }

  // Season sim numbers for the My Guys > My Analysis scatter -- public
  // read, no tier gate on these columns (same as the tool pages). Keyed
  // by normalized name so the client can join Sleeper roster players to
  // it. Only fetched when there's actually a portfolio to plot.
  let playerSims = {};
  if (savedTeams.length >= 2) {
    const pub = createPublicClient();
    const { data: latest } = await pub
      .from("player_simulations")
      .select("season, week")
      .order("season", { ascending: false })
      .order("week", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (latest) {
      const { data: sims } = await pub
        .from("player_simulations")
        .select("player_name, floor, median, ceiling, wopr, epa")
        .eq("season", latest.season)
        .eq("week", latest.week);
      for (const s of sims || []) {
        if (s.player_name) playerSims[normalizePlayerName(s.player_name)] = s;
      }
    }
  }

  // Portfolio Pulse (user-scoped insight) -- a distilled, cacheable
  // summary of the SAME rows the My Guys panel already builds client-
  // side (lib/portfolio.js's buildPortfolio, unchanged). This is the
  // "apply the insights pattern to what's already built" half: the live,
  // refilterable exposure table stays exactly as it was -- persisting
  // THAT on every filter click would be the wrong shape -- but a few
  // stable facts about it (top exposure, how boom/bust-leaning the
  // portfolio is) are exactly what this layer is for, computed once per
  // page load and cheap to read elsewhere later (a badge, a share card)
  // without re-deriving them.
  let portfolioSummary = null;
  let exposureRows = [];
  if (user && savedTeams.length >= 2) {
    const { rows } = buildPortfolio(savedTeams, {}, playerSims, {});
    exposureRows = rows;
    portfolioSummary = await computeAndSaveInsight(supabase, {
      key: "portfolio_summary",
      userId: user.id,
      input: rows,
    }).catch((e) => {
      console.error("[my-team] portfolio_summary insight failed:", e.message);
      return null;
    });
  }

  // Per-player-week game log (trailing two seasons) for the My Analysis
  // filter builder -- public read, scoped to just the saved-team players
  // (by normalized name) so the payload stays a few thousand rows.
  // model/player_game_log.R -> player_game_log table.
  let playerGameLogs = {};
  if (savedTeams.length >= 2) {
    const names = new Set();
    for (const t of savedTeams) {
      for (const p of t.players || []) {
        if (p.name) names.add(normalizePlayerName(p.name));
      }
    }
    if (names.size) {
      const pub = createPublicClient();
      const list = [...names];
      // ~24 games/player over two seasons blows past PostgREST's 1000-row
      // default cap for a portfolio of any size, so page through it.
      const PAGE = 1000;
      for (let from = 0; ; from += PAGE) {
        const { data: chunk } = await pub
          .from("player_game_log")
          .select("normalized_name, season, week, is_home, won, fantasy_points_ppr, exp_points_ppr")
          .in("normalized_name", list)
          .order("normalized_name", { ascending: true })
          .order("season", { ascending: true })
          .order("week", { ascending: true })
          .range(from, from + PAGE - 1);
        if (!chunk || chunk.length === 0) break;
        for (const g of chunk) {
          (playerGameLogs[g.normalized_name] ??= []).push(g);
        }
        if (chunk.length < PAGE) break;
      }
    }
  }

  // Basic demographics (jersey, HT/WT, age, experience, college, status)
  // for the My Analysis player card -- from Sleeper's own player
  // dictionary (module-cached, see lib/sleeper.js). Scoped to just the
  // players on the saved teams so the prop stays small.
  let playerBios = {};
  if (savedTeams.length >= 2) {
    const ids = new Set();
    for (const t of savedTeams) {
      for (const p of t.players || []) if (p.player_id) ids.add(p.player_id);
    }
    const dict = await getSleeperPlayers().catch(() => ({}));
    for (const id of ids) {
      if (dict[id]) playerBios[id] = dict[id];
    }
  }

  // Heading follows the Sleeper account the saved teams were imported from.
  const sleeperName = savedTeams.find((t) => t.platform_username)?.platform_username || null;

  return (
    <div className="tool-page">
      <SiteHeader />

      <main className="wrap tool-wrap my-team-page-wrap">
        <div className="eyebrow">My Team</div>
        <h1>{sleeperName ? `${sleeperName}’s Teams` : "My Team"}</h1>

        <div className={`my-team-layout${exposureRows.length ? " has-side" : ""}`}>
          <div className="my-team-main">
            {user && <PortfolioOverview archetype={archetypeResult} summary={portfolioSummary} />}
            <MyTeamClient
              isSignedIn={!!user}
              tier={tier}
              savedTeamLimit={savedTeamLimit(tier)}
              savedTeams={savedTeams}
              playerSims={playerSims}
              playerGameLogs={playerGameLogs}
              playerBios={playerBios}
            />
          </div>
          {exposureRows.length > 0 && (
            <ExposureSidebar rows={exposureRows} teamCount={savedTeams.length} />
          )}
        </div>
      </main>
    </div>
  );
}

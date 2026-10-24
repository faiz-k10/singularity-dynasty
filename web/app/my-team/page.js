import InteractiveScript from "../InteractiveScript";
import { createClient } from "@/lib/supabase/server";
import { createPublicClient } from "@/lib/supabase/public";
import { resolveTier, savedTeamLimit } from "@/lib/tier";
import { normalizePlayerName, buildPortfolio } from "@/lib/portfolio";
import { getSleeperPlayers } from "@/lib/sleeper";
import { fetchGameStates } from "@/lib/gameStatus";
import { unstable_cache } from "next/cache";
import { loadInsight, loadTeamInsightForAll, getInsight } from "@/lib/insights";
import PortfolioOverview from "./PortfolioOverview";
import ExposureSidebar from "./ExposureSidebar";
import MyTeamClient from "./MyTeamClient";
import { mineFromTeams } from "@/lib/myPlayers";
import { buildFeed } from "@/lib/myFeed";
import { loadFeedInputs } from "@/lib/myFeedData";

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

  // "Your players this week": the public two-week inputs load in parallel with everything below.
  const feedInputs = user && savedTeams.length ? loadFeedInputs().catch(() => null) : null;

  // Everything below is independent, so it loads in parallel (it used to run one query after another): the page's
  // first paint is the saved snapshot, and the live Sleeper refresh happens in the browser afterwards, so nothing here
  // should wait on more than the slowest single read. Sleeper's player dictionary (~16MB, cached a day per server) is
  // capped at 3 seconds on a cold server -- past that the page renders without ages / bios rather than stall.
  const many = savedTeams.length >= 2;
  // The live scoreboard (cached 30s, capped at 1.5s) rides along so the first paint already knows which games are on.
  const [archetypeRow, recordInsights, playerSims, dict, emailDigest, gameStates] = await Promise.all([
    user ? loadInsight(supabase, { key: "gm_archetype_quiz", userId: user.id }).catch(() => null) : null,
    user && savedTeams.length
      ? loadTeamInsightForAll(supabase, { key: "season_record_badge", userId: user.id, savedTeamIds: savedTeams.map((t) => t.id) }).catch(() => new Map())
      : new Map(),
    many ? getCachedPlayerSims().catch(() => ({})) : {},
    many ? Promise.race([getSleeperPlayers().catch(() => ({})), new Promise((r) => setTimeout(() => r({}), 3000))]) : {},
    user ? loadEmailDigest(supabase, user.id).catch(() => false) : false,
    savedTeams.length ? Promise.race([fetchGameStates().catch(() => null), new Promise((r) => setTimeout(() => r(null), 1500))]) : null,
  ]);

  // GM Archetype (user-scoped) + per-team season-record badges
  // (team-scoped) -- see lib/insights/. Merging the record tier straight
  // into each team's settings object is what lets MyTeamClient's
  // existing LeagueBadges render it as one more pill alongside Teams/
  // Roster Spots/Scoring, without threading a separate prop through.
  const archetypeResult = archetypeRow?.value || null;
  savedTeams = savedTeams.map((t) => {
    const tier = recordInsights.get(t.id)?.value?.tier;
    return tier ? { ...t, settings: { ...(t.settings || {}), recordTier: tier } } : t;
  });

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
  if (user && many) {
    const { rows } = buildPortfolio(savedTeams, {}, playerSims, {});
    exposureRows = rows;

    // Achievement badge keys per player (player-level, so the same in every
    // league); Established / Building (key "confidence") are excluded.
    const badgesByPlayer = {};
    for (const t of savedTeams) {
      for (const p of t.players || []) {
        if (p.player_id && !badgesByPlayer[p.player_id]) {
          badgesByPlayer[p.player_id] = (p.achievements || []).map((a) => a.key).filter((k) => k !== "confidence");
        }
      }
    }
    // Extra per-player fields the Pulse tabs need: age (Sleeper's player dictionary).
    const pulseRows = rows.map((r) => ({
      ...r,
      badges: badgesByPlayer[r.player_id] || [],
      age: typeof dict[r.player_id]?.age === "number" ? dict[r.player_id].age : null,
    }));

    // Computed from the page's own data and shown; NOT written to the database on every page view any more (nothing reads
    // the stored copy, and the write sat in the page's critical path).
    portfolioSummary = await getInsight("portfolio_summary").compute(pulseRows).catch((e) => {
      console.error("[my-team] portfolio_summary insight failed:", e.message);
      return null;
    });
  }

  // Basic demographics (jersey, HT/WT, age, experience, college, status)
  // for the My Analysis player card -- from Sleeper's own player
  // dictionary (module-cached, see lib/sleeper.js). Scoped to just the
  // players on the saved teams so the prop stays small.
  const playerBios = {};
  if (many) {
    for (const t of savedTeams) {
      for (const p of t.players || []) if (p.player_id && dict[p.player_id]) playerBios[p.player_id] = dict[p.player_id];
    }
  }

  // What moved for the players on these teams since the previous published week (lib/myFeed.js).
  let feed = null;
  if (feedInputs) {
    try {
      const inp = await feedInputs;
      if (inp) {
        const mine = mineFromTeams(savedTeams);
        const pair = (x) => (x ? { cur: x.cur, prev: x.prev } : undefined);
        const args = { sims: pair(inp.sims), ranks: pair(inp.ranks), roles: pair(inp.roles), groups: pair(inp.groups) };
        const simPrevWeek = inp.sims?.prevWeek ?? null;
        const ready = [inp.sims, inp.ranks, inp.roles, inp.groups].some((x) => x && x.prevWeek != null);
        feed = {
          ready,
          week: inp.sims?.week ?? inp.ranks?.week ?? null,
          prevWeek: inp.sims?.prevWeek ?? inp.ranks?.prevWeek ?? null,
          teams: mine.teams,
          all: buildFeed({ mine, ...args, simPrevWeek }),
          byTeam: mine.teams.map((_, i) => buildFeed({ mine, ...args, teamIndex: i, simPrevWeek })),
        };
      }
    } catch (e) {
      console.error("[my-team] weekly feed failed:", e?.message || e);
    }
  }

  // Heading follows the Sleeper account the saved teams were imported from.
  const sleeperName = savedTeams.find((t) => t.platform_username)?.platform_username || null;

  return (
    <div className="tool-page">
      <InteractiveScript />

      <main className="wrap tool-wrap my-team-page-wrap">
        <MyTeamClient
          isSignedIn={!!user}
          tier={tier}
          savedTeamLimit={savedTeamLimit(tier)}
          savedTeams={savedTeams}
          initialGameStates={gameStates}
          heading={sleeperName ? `${sleeperName}\u2019s Teams` : "My Team"}
          playerSims={playerSims}
          playerBios={playerBios}
          feed={feed}
          emailDigest={emailDigest}
          overview={user ? <PortfolioOverview archetype={archetypeResult} summary={portfolioSummary} /> : null}
          exposure={
            exposureRows.length > 0 ? (
              <ExposureSidebar rows={exposureRows} teamCount={savedTeams.length} />
            ) : null
          }
        />
      </main>
    </div>
  );
}

// Same numbers for everyone, so one copy is cached for 5 minutes instead of two queries on every page view.
const getCachedPlayerSims = unstable_cache(() => loadPlayerSims(), ["my-team-player-sims"], { revalidate: 300 });

// Season sim numbers for the My Guys > My Analysis scatter -- public
// read, no tier gate on these columns (same as the tool pages). Keyed
// by normalized name so the client can join Sleeper roster players to
// it. Only fetched when there's actually a portfolio to plot.
async function loadPlayerSims() {
  const out = {};
  const pub = createPublicClient();
  const { data: latest } = await pub
    .from("player_simulations")
    .select("season, week")
    .order("season", { ascending: false })
    .order("week", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!latest) return out;
  const { data: sims } = await pub
    .from("player_simulations")
    .select("player_name, floor, median, ceiling, wopr, epa")
    .eq("season", latest.season)
    .eq("week", latest.week);
  for (const s of sims || []) {
    if (s.player_name) out[normalizePlayerName(s.player_name)] = s;
  }
  return out;
}

// (The per-player game log for the Analytics tab is no longer loaded here: it loads on demand, see lib/myGameLogs.js.)

// Weekly email opt-in (migration 0038; a missing column just reads as off).
async function loadEmailDigest(supabase, userId) {
  const { data: prof } = await supabase.from("profiles").select("email_digest").eq("id", userId).maybeSingle();
  return Boolean(prof?.email_digest);
}

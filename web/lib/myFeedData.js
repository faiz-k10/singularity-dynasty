import { buildFeed } from "./myFeed.js";
import { mineFromTeams } from "./myPlayers.js";
import { unstable_cache } from "next/cache";
import { createPublicClient } from "@/lib/supabase/public";
import { fetchAllRows, must } from "@/lib/fetchAllRows";

// The two most recent published weeks of one table (public data, the same for every viewer), so
// the feed can compare this week with last week. Each table is cached on its own for a minute and
// fails on its own: a missing table just leaves that kind of change out of the feed.
async function twoWeeks(table, select, extra = (q) => q) {
  const pub = createPublicClient();
  const latest = must(
    await pub
      .from(table)
      .select("season, week")
      .order("season", { ascending: false })
      .order("week", { ascending: false })
      .limit(1)
      .maybeSingle()
  );
  if (!latest) return null;
  const prevRow = must(
    await pub
      .from(table)
      .select("week")
      .eq("season", latest.season)
      .lt("week", latest.week)
      .order("week", { ascending: false })
      .limit(1)
      .maybeSingle()
  );
  const at = (week) => fetchAllRows(pub, table, select, (q) => extra(q.eq("season", latest.season).eq("week", week)));
  const [cur, prev] = await Promise.all([at(latest.week), prevRow ? at(prevRow.week) : []]);
  return { season: latest.season, week: latest.week, prevWeek: prevRow?.week ?? null, cur, prev };
}

// `safe` sits OUTSIDE the cache: a failed read is reported as "no data" to this one caller but is never stored, so the next request tries again.
const safe = (fn) => async () => {
  try {
    return await fn();
  } catch (e) {
    console.error("[my-feed]", e?.message || e);
    return null;
  }
};

const getSims = safe(unstable_cache(() => twoWeeks("player_simulations", "player_name, position, median, floor, ceiling"), ["feed-sims"], { revalidate: 3600, tags: ["model-data"] }));
const getRanks = safe(unstable_cache(() => twoWeeks("redraft_rankings", "player_name, position, rank, week, opponent, is_home, notes"), ["feed-ranks-v2"], { revalidate: 3600, tags: ["model-data"] }));
const getRoles = safe(unstable_cache(() => twoWeeks("player_archetypes", "player_name, archetype"), ["feed-roles"], { revalidate: 3600, tags: ["model-data"] }));
const getGroups = safe(unstable_cache(() => twoWeeks("player_groups", "player_name, kind, label"), ["feed-groups"], { revalidate: 3600, tags: ["model-data"] }));

export async function loadFeedInputs() {
  const [sims, ranks, roles, groups] = await Promise.all([getSims(), getRanks(), getRoles(), getGroups()]);
  return { sims, ranks, roles, groups };
}

// The "what changed" feed for a set of saved teams, built from loadFeedInputs()' two-week tables (lib/myFeed.js buildFeed).
// One place for My Team's "Your Players This Week" panel and the signed-in home page. null when the inputs are missing.
export function buildTeamsFeed(savedTeams, inp) {
  if (!inp) return null;
  const mine = mineFromTeams(savedTeams);
  const pair = (x) => (x ? { cur: x.cur, prev: x.prev } : undefined);
  const args = { sims: pair(inp.sims), ranks: pair(inp.ranks), roles: pair(inp.roles), groups: pair(inp.groups) };
  const simPrevWeek = inp.sims?.prevWeek ?? null;
  return {
    ready: [inp.sims, inp.ranks, inp.roles, inp.groups].some((x) => x && x.prevWeek != null),
    week: inp.sims?.week ?? inp.ranks?.week ?? null,
    prevWeek: inp.sims?.prevWeek ?? inp.ranks?.prevWeek ?? null,
    teams: mine.teams,
    all: buildFeed({ mine, ...args, simPrevWeek }),
    byTeam: mine.teams.map((_, i) => buildFeed({ mine, ...args, teamIndex: i, simPrevWeek })),
  };
}

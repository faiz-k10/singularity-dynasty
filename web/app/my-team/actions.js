"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import {
  fetchSleeperUser,
  fetchSleeperLeagues,
  fetchSleeperRosters,
  fetchSleeperLeagueUsers,
  fetchSleeperState,
  fetchSleeperResearch,
  getSleeperPlayers,
} from "@/lib/sleeper";

// Looks up every league a Sleeper username plays in for the current NFL
// season and returns just THEIR roster from each one, with player ids
// already resolved to real names/positions/teams via Sleeper's own
// player dictionary. Doesn't touch Supabase at all -- this is read-only
// lookup against Sleeper, separate from saveTeam() below, so a
// signed-out visitor can still preview their team before deciding to
// sign in and save it.
export async function lookupSleeperTeams(username) {
  const trimmed = (username || "").trim();
  if (!trimmed) {
    return { error: "Enter a Sleeper username." };
  }

  const sleeperUser = await fetchSleeperUser(trimmed);
  if (!sleeperUser) {
    return { error: `No Sleeper user found for "${trimmed}".` };
  }

  const season = String(new Date().getFullYear());
  const leagues = await fetchSleeperLeagues(sleeperUser.user_id, season);
  if (!leagues.length) {
    return {
      error: `No ${season} Sleeper leagues found for "${trimmed}".`,
    };
  }

  const players = await getSleeperPlayers();

  // Platform-wide roster%/start% is the same for a given player
  // regardless of which of the user's leagues we're looking at, so this
  // is fetched once up front, not per-league. During preseason the
  // upcoming regular season's week 1 is the only week with real research
  // data yet (later weeks 404/return null) -- see fetchSleeperResearch.
  const state = await fetchSleeperState();
  const researchWeek = state.season_type === "regular" ? state.week : 1;
  const research = await fetchSleeperResearch(season, researchWeek);

  const teams = await Promise.all(
    leagues.map(async (league) => {
      const [rosters, leagueUsers] = await Promise.all([
        fetchSleeperRosters(league.league_id),
        fetchSleeperLeagueUsers(league.league_id),
      ]);
      const myRoster = rosters.find((r) => r.owner_id === sleeperUser.user_id);
      if (!myRoster) return null;

      const teamName =
        leagueUsers.find((u) => u.user_id === sleeperUser.user_id)?.metadata
          ?.team_name || sleeperUser.display_name;

      // League format labels, straight from Sleeper's own league object --
      // no separate settings call needed, this is already fetched above.
      const recPts = league.scoring_settings?.rec || 0;
      const tePremium = league.scoring_settings?.bonus_rec_te || 0;
      // Active roster_positions alone undercounts total capacity -- taxi
      // squad slots hold real rostered players (they're part of
      // myRoster.players) but aren't in roster_positions at all. IR/
      // reserve_slots deliberately excluded from the denominator per
      // request -- filled (below) still includes anyone actually
      // stashed on IR, so a league that's using its IR slots can show
      // filled slightly over total; that's accepted as the tradeoff for
      // not counting IR capacity as "real" roster space.
      const totalRosterSpots =
        (league.roster_positions || []).length +
          (league.settings?.taxi_slots || 0) || null;
      const filledRosterSpots = (myRoster.players || []).length;
      const settings = {
        teams: league.total_rosters || null,
        rosterSpots: totalRosterSpots
          ? `${filledRosterSpots}/${totalRosterSpots}`
          : null,
        qbFormat: (league.roster_positions || []).includes("SUPER_FLEX")
          ? "Superflex"
          : "1QB",
        scoring:
          recPts >= 1 ? "Full PPR" : recPts > 0 ? "Half PPR" : "Standard",
        tePremium: tePremium > 0 ? `+${tePremium} TE Premium` : null,
      };

      // myRoster.starters is ordered to match roster_positions with BN
      // slots filtered out 1:1 (confirmed against real data: a 9-player
      // starters array lines up exactly with 9 non-BN roster_positions
      // entries in order) -- zipping them together is what actually
      // recovers which SLOT ("QB", "FLEX", "SUPER_FLEX", ...) each
      // starter fills, not just who happens to be a starter.
      const nonBenchSlots = (league.roster_positions || []).filter((p) => p !== "BN");
      const slotByPlayerId = {};
      const slotIndexByPlayerId = {};
      (myRoster.starters || []).forEach((playerId, i) => {
        if (playerId && playerId !== "0") {
          slotByPlayerId[playerId] = nonBenchSlots[i] || null;
          slotIndexByPlayerId[playerId] = i;
        }
      });

      const rosterPlayers = (myRoster.players || []).map((playerId) => {
        const p = players[playerId];
        const r = research[playerId];
        return {
          player_id: playerId,
          name: p ? `${p.first_name || ""} ${p.last_name || ""}`.trim() || playerId : playerId,
          position: p?.position || null,
          team: p?.team || null,
          slot: slotByPlayerId[playerId] || null,
          isStarter: Boolean(slotByPlayerId[playerId]),
          // Index into the starting lineup's own slot order (QB, RB, RB,
          // WR, ... in whatever order this league's roster_positions
          // defines) -- what lets the default view show starters in
          // Sleeper's actual lineup order instead of an arbitrary one.
          slotIndex: slotIndexByPlayerId[playerId] ?? 999,
          rosterPct: typeof r?.owned === "number" ? r.owned : null,
          startPct: typeof r?.started === "number" ? r.started : null,
        };
      });

      return {
        league_id: league.league_id,
        league_name: league.name,
        roster_id: myRoster.roster_id,
        team_name: teamName,
        settings,
        players: rosterPlayers,
      };
    })
  );

  return {
    sleeperUsername: sleeperUser.display_name,
    teams: teams.filter(Boolean),
  };
}

// Persists one already-looked-up team as a snapshot -- re-running the
// lookup and saving again is how a stale roster gets refreshed (upsert on
// user_id+platform+platform_league_id, see the migration's unique
// constraint), not a live re-sync on every page view.
export async function saveTeam({ sleeperUsername, leagueId, leagueName, teamName, rosterId, settings, players }) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { error: "Sign in to save a team." };
  }

  const { error } = await supabase.from("saved_teams").upsert(
    {
      user_id: user.id,
      platform: "sleeper",
      platform_username: sleeperUsername,
      platform_league_id: leagueId,
      platform_roster_id: rosterId ? String(rosterId) : null,
      league_name: leagueName,
      team_name: teamName,
      settings: settings || {},
      players,
    },
    { onConflict: "user_id,platform,platform_league_id" }
  );

  if (error) {
    return { error: error.message };
  }

  revalidatePath("/my-team");
  return { success: true };
}

export async function deleteTeam(id) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { error: "Sign in to manage saved teams." };
  }

  const { error } = await supabase
    .from("saved_teams")
    .delete()
    .eq("id", id)
    .eq("user_id", user.id);

  if (error) {
    return { error: error.message };
  }

  revalidatePath("/my-team");
  return { success: true };
}

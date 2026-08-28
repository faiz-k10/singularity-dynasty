"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import {
  fetchSleeperUser,
  fetchSleeperLeagues,
  fetchSleeperRosters,
  fetchSleeperLeagueUsers,
  fetchSleeperMatchups,
  fetchSleeperState,
  fetchSleeperResearch,
  fetchSleeperProjections,
  getSleeperPlayers,
} from "@/lib/sleeper";

// Sleeper's own player dictionary drops name suffixes ("Luther Burden"
// instead of "Luther Burden III"), but our hand-published
// redraft_rankings keeps them ("Brian Thomas Jr.") -- normalizing both
// sides the same way (lowercase, no periods, no trailing suffix) is what
// actually matches them up. Checked by hand against the live dataset:
// no two different players collide once normalized this way.
function normalizeName(name) {
  return (name || "")
    .toLowerCase()
    .replace(/\./g, "")
    .replace(/\s+(jr|sr|ii|iii|iv|v)$/i, "")
    .trim();
}

// Looks up every league a Sleeper username plays in for the current NFL
// season and returns just THEIR roster from each one, with player ids
// already resolved to real names/positions/teams via Sleeper's own
// player dictionary. The only Supabase read is the public, no-auth-
// required redraft_rankings projection lookup below -- this still works
// for a signed-out visitor previewing their team before deciding to
// sign in and save it, same as the pure-Sleeper data.
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
  // Which week's head-to-head matchup to surface -- in-season, Sleeper's
  // own display_week (the week its app is showing, which rolls to the
  // next matchup once the current week's games finish), falling back to
  // the raw week; else week 1 (the upcoming opener), same preseason
  // fallback as researchWeek above.
  const matchupWeek =
    state.season_type === "regular" ? state.display_week || state.week || 1 : 1;
  const research = await fetchSleeperResearch(season, researchWeek);
  // Always week 1 specifically (not "whatever week it currently is" like
  // research above) -- this column is meant as a fixed season-opener
  // projection, not a rolling one.
  const projections = await fetchSleeperProjections(season, 1);

  // Our own model's week 1 projection, alongside Sleeper's -- same
  // redraft_rankings table /tools/redraft-rankings reads from (public
  // read, no tier gate on the projection column itself), matched by
  // normalized player name since Sleeper IDs don't exist in that table.
  const supabase = await createClient();
  const { data: myProjRows } = await supabase
    .from("redraft_rankings")
    .select("player_name, projection")
    .eq("season", Number(season))
    .eq("week", 1);
  const myProjByName = {};
  (myProjRows || []).forEach((row) => {
    if (row.player_name && typeof row.projection === "number") {
      myProjByName[normalizeName(row.player_name)] = row.projection;
    }
  });

  const teams = await Promise.all(
    leagues.map(async (league) => {
      const [rosters, leagueUsers, matchups] = await Promise.all([
        fetchSleeperRosters(league.league_id),
        fetchSleeperLeagueUsers(league.league_id),
        fetchSleeperMatchups(league.league_id, matchupWeek),
      ]);
      const myRoster = rosters.find((r) => r.owner_id === sleeperUser.user_id);
      if (!myRoster) return null;

      // This week's opponent, resolved from the matchups feed: find my
      // roster's matchup_id, then the other roster sharing it -> its
      // owner's team name + record. null when matchups aren't posted yet
      // (offseason), or when I'm the only roster on that matchup_id (bye).
      let weekOpponent = null;
      let weekOpponentRecord = null;
      let weekIsBye = false;
      if (matchups) {
        const mine = matchups.find((m) => m.roster_id === myRoster.roster_id);
        if (mine && mine.matchup_id != null) {
          const oppEntry = matchups.find(
            (m) => m.matchup_id === mine.matchup_id && m.roster_id !== myRoster.roster_id
          );
          if (oppEntry) {
            const oppRoster = rosters.find((r) => r.roster_id === oppEntry.roster_id);
            const oppUser = oppRoster
              ? leagueUsers.find((u) => u.user_id === oppRoster.owner_id)
              : null;
            weekOpponent =
              oppUser?.metadata?.team_name ||
              oppUser?.display_name ||
              `Roster ${oppEntry.roster_id}`;
            const { wins: ow = 0, losses: ol = 0, ties: ot = 0 } = oppRoster?.settings || {};
            weekOpponentRecord = ot > 0 ? `${ow}-${ol}-${ot}` : `${ow}-${ol}`;
          } else {
            weekIsBye = true;
          }
        }
      }

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
      // W-L, or W-L-T once any team in the league has an actual tie
      // (rare, so the third number stays hidden until it's ever
      // non-zero rather than always showing "-0").
      const { wins = 0, losses = 0, ties = 0 } = myRoster.settings || {};
      const record = ties > 0 ? `${wins}-${losses}-${ties}` : `${wins}-${losses}`;
      const settings = {
        record,
        week: matchupWeek,
        opponent: weekOpponent,
        opponentRecord: weekOpponentRecord,
        isBye: weekIsBye,
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
      // How many starting slots this league actually has (9 in a
      // standard QB/RB/RB/WR/WR/TE/FLEX/FLEX/SUPER_FLEX league, etc) --
      // its own badge alongside Teams/Roster Spots/QB Format/Scoring.
      settings.starters = nonBenchSlots.length;

      // Same recPts already computed above for the Scoring badge decides
      // which of the three projection flavors actually matches this
      // league's format -- a half-PPR league's players should show their
      // half-PPR week 1 number, not the PPR or standard one.
      const projField = recPts >= 1 ? "ppr" : recPts > 0 ? "half" : "std";

      const rosterPlayers = (myRoster.players || []).map((playerId) => {
        const p = players[playerId];
        const r = research[playerId];
        const proj = projections[playerId];
        const name = p ? `${p.first_name || ""} ${p.last_name || ""}`.trim() || playerId : playerId;
        const sleeperProjPts = proj ? proj[projField] : null;
        const myProjPts = myProjByName[normalizeName(name)] ?? null;
        return {
          player_id: playerId,
          name,
          position: p?.position || null,
          team: p?.team || null,
          slot: slotByPlayerId[playerId] || null,
          isStarter: Boolean(slotByPlayerId[playerId]),
          // Index into the starting lineup's own slot order (QB, RB, RB,
          // WR, ... in whatever order this league's roster_positions
          // defines) -- what lets the default view show starters in
          // Sleeper's actual lineup order instead of an arbitrary one.
          slotIndex: slotIndexByPlayerId[playerId] ?? 999,
          sleeperProjPts,
          myProjPts,
          // Computed once here (not in the client) so the sortable Diff
          // column has a real numeric field to sort on, same as every
          // other column -- null whenever either side is missing rather
          // than treating a missing projection as a 0-point player.
          diffProj:
            myProjPts !== null && sleeperProjPts !== null
              ? myProjPts - sleeperProjPts
              : null,
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

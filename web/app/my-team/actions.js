"use server";

import { bestLineup } from "@/lib/bestBall";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { resolveTier, savedTeamLimit } from "@/lib/tier";
import { getAuthUser } from "@/lib/authUser";
import { loadGameLogsFor, namesOnTeams } from "@/lib/myGameLogs";
import { computeAndSaveInsight } from "@/lib/insights";
import { getAchievements } from "../tools/achievements";
import {
  fetchAchievementInputs,
  fetchLatestRedraftFieldsByName,
  fetchWoprPercentileByName,
  buildAchievementRow,
} from "../tools/achievementsData";
import {
  fetchSleeperUser,
  fetchSleeperLeagues,
  fetchSleeperRosters,
  fetchSleeperLeagueUsers,
  fetchSleeperMatchups,
  fetchSleeperState,
  getSleeperPlayers,
} from "@/lib/sleeper";
import { fetchGameStates } from "@/lib/gameStatus";
import { loadGameStats } from "@/lib/gameStats";
import { loadLivePlays } from "@/lib/playByPlay";
import { getWeekProjections, getWeekRankRows } from "@/lib/weekProjections";
import { buildWaiverList, sleeperIndex } from "@/lib/waivers";
import { buildSide, matchupOutlook } from "@/lib/winChance";
import { getLeagueSeason } from "@/lib/leagueSeason";
import { fetchInjuryFeed } from "@/lib/injuryFeed";

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

// Same normalized-name matching problem as myProjByName below, just for
// achievementsData.js's maps (all raw-keyed by player_game_log/
// redraft_rankings' own naming) -- re-keys each one by normalizeName()
// once so a Sleeper roster player (whose name comes from Sleeper's own
// dictionary, suffix-less) can still look itself up in it.
function normalizedIndex(byName) {
  const out = {};
  for (const [name, value] of Object.entries(byName || {})) {
    out[normalizeName(name)] = value;
  }
  return out;
}

// This week's head-to-head for one roster, from the matchups feed: find
// my roster's matchup_id, then the other roster sharing it -> its owner's
// team name + record. matchupActual is Sleeper's own `points` on each
// entry -- 0 before kickoff (left null), then live-updating, final once
// games end. Opponent stays null when matchups aren't posted (offseason)
// or on a bye. Shared by the full lookup and the lightweight live poll.
function resolveMatchup(matchups, myRoster, rosters, leagueUsers, bestBall = null) {
  const out = {
    weekOpponent: null,
    weekOpponentRecord: null,
    weekIsBye: false,
    matchupActual: null,
    mine: null,
    oppEntry: null,
  };
  if (!matchups) return out;
  const mine = matchups.find((m) => m.roster_id === myRoster.roster_id);
  if (!mine || mine.matchup_id == null) return out;
  out.mine = mine;
  const oppEntry = matchups.find(
    (m) => m.matchup_id === mine.matchup_id && m.roster_id !== myRoster.roster_id
  );
  if (!oppEntry) {
    out.weekIsBye = true;
    return out;
  }
  out.oppEntry = oppEntry;
  const oppRoster = rosters.find((r) => r.roster_id === oppEntry.roster_id);
  const oppUser = oppRoster ? leagueUsers.find((u) => u.user_id === oppRoster.owner_id) : null;
  out.weekOpponent =
    oppUser?.metadata?.team_name || oppUser?.display_name || `Roster ${oppEntry.roster_id}`;
  const { wins: ow = 0, losses: ol = 0, ties: ot = 0 } = oppRoster?.settings || {};
  out.weekOpponentRecord = ot > 0 ? `${ow}-${ol}-${ot}` : `${ow}-${ol}`;
  const myPts = typeof mine.points === "number" ? mine.points : 0;
  const oppPts = typeof oppEntry.points === "number" ? oppEntry.points : 0;
  if (myPts > 0 || oppPts > 0) out.matchupActual = { mine: myPts, opp: oppPts };
  // Best ball: Sleeper's own points trail (it fills the lineup in late), so score each side's best possible lineup from every
  // player's points so far (lib/bestBall.js) -- the figure the week is finally scored on.
  if (bestBall && (mine.players_points || oppEntry.players_points)) {
    const a = bestLineup(mine.players_points, bestBall.posOf, bestBall.slots).total;
    const b = bestLineup(oppEntry.players_points, bestBall.posOf, bestBall.slots).total;
    if (a > 0 || b > 0) out.matchupActual = { mine: a, opp: b, bestLineup: true };
  }
  return out;
}

// Both lineups of this week's matchup, slot by slot, for the head-to-head view and the win chance
// (lib/winChance.js): starters + their points so far from the Sleeper matchup entries, names from infoFor, and our
// weekly projection / floor / ceiling by normalized name. Null on a bye, in best ball (no set lineup) or before the
// schedule is posted.
function buildH2H(mine, oppEntry, slots, infoFor, projByName) {
  if (!mine || !oppEntry) return null;
  const projFor = (name) => projByName[normalizeName(name)] || null;
  return {
    mine: buildSide(mine.starters, slots, infoFor, projFor, mine.players_points),
    opp: buildSide(oppEntry.starters, slots, infoFor, projFor, oppEntry.players_points),
  };
}

// Sleeper dictionary entry -> the few fields buildSide needs.
function dictInfo(p) {
  if (!p) return null;
  return {
    name: `${p.first_name || ""} ${p.last_name || ""}`.trim(),
    pos: p.position || null,
    team: p.team || null,
    active: p.status ? p.status === "Active" : true,
  };
}

function formatRecord(settings) {
  const { wins = 0, losses = 0, ties = 0 } = settings || {};
  return ties > 0 ? `${wins}-${losses}-${ties}` : `${wins}-${losses}`;
}

// Looks up every league a Sleeper username plays in for the current NFL
// season and returns just THEIR roster from each one, with player ids
// already resolved to real names/positions/teams via Sleeper's own
// player dictionary. The only Supabase read is the public, no-auth-
// required redraft_rankings projection lookup below -- this still works
// for a signed-out visitor previewing their team before deciding to
// sign in and save it, same as the pure-Sleeper data.
// opts.season: also gather standings + playoff odds per league (lib/leagueSeason.js, cached a day) -- only the saved
// teams' full refresh asks for it; the landing page box and the lookup preview stay fast.
export async function lookupSleeperTeams(username, opts = {}) {
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

  const players = await getSleeperPlayers().catch(() => ({}));

  const state = await fetchSleeperState();
  // Which week's head-to-head matchup to surface -- in-season, Sleeper's
  // own display_week (the week its app is showing, which rolls to the
  // next matchup once the current week's games finish), falling back to
  // the raw week; else week 1 (the upcoming opener), same preseason
  // fallback (week 1, the upcoming opener).
  const matchupWeek =
    state.season_type === "regular" ? state.display_week || state.week || 1 : 1;

  // Our own model's week 1 projection, alongside Sleeper's -- same
  // redraft_rankings table /tools/redraft-rankings reads from (public
  // read, no tier gate on the projection column itself), matched by
  // normalized player name since Sleeper IDs don't exist in that table.
  const supabase = await createClient();
  // Latest published week, with weekly floor/ceiling for the win chance (lib/weekProjections.js, cached 5 min).
  const [weekProj, gameStates] = await Promise.all([
    getWeekProjections(supabase, Number(season)),
    fetchGameStates(),
  ]);
  const myProjByName = {};
  for (const [name, v] of Object.entries(weekProj.byName)) myProjByName[name] = v.proj;

  // Same achievement badges Weekly Projection Rankings shows (On Fire/On
  // Thin Ice/Risky Icarus/Steady Eddy/Buy Low/Sell High/Super Hero/
  // Honorable/Con Artist), applied here as-is -- not retuned for a roster context. Uses the
  // current season (the same one already resolved above for the
  // projection lookup) for Super Hero's own season-scoping.
  const [achievementInputs, redraftFieldsByName, woprPercentileByName] = await Promise.all([
    fetchAchievementInputs(supabase, Number(season)),
    fetchLatestRedraftFieldsByName(supabase),
    fetchWoprPercentileByName(supabase),
  ]);
  const recentGamesByNormName = normalizedIndex(achievementInputs.recentGamesByName);
  const heroWinsByNormName = normalizedIndex(achievementInputs.heroWinsByName);
  const redraftFieldsByNormName = normalizedIndex(redraftFieldsByName);
  const woprPercentileByNormName = normalizedIndex(woprPercentileByName);

  const teams = await Promise.all(
    leagues.map(async (league) => {
      const [rosters, leagueUsers, matchups] = await Promise.all([
        fetchSleeperRosters(league.league_id),
        fetchSleeperLeagueUsers(league.league_id),
        fetchSleeperMatchups(league.league_id, matchupWeek),
      ]);
      const myRoster = rosters.find((r) => r.owner_id === sleeperUser.user_id);
      if (!myRoster) return null;

      // This week's opponent + projected score, from the matchups feed:
      // find my roster's matchup_id, then the other roster sharing it ->
      // its owner's team name + record, and our Singularity redraft
      // projection summed over each side's starting lineup (both sides
      // read from the feed's own `starters` arrays, so they're measured
      // the same way). weekOpponent stays null when matchups aren't
      // posted yet (offseason) or on a bye; matchupProj stays null
      // unless we projected at least 3 starters on each side.
      const {
        weekOpponent,
        weekOpponentRecord,
        weekIsBye,
        matchupActual,
        mine,
        oppEntry,
      } = resolveMatchup(
        matchups,
        myRoster,
        rosters,
        leagueUsers,
        league.settings?.best_ball === 1
          ? { posOf: (id) => players[id]?.position, slots: (league.roster_positions || []).filter((p) => p !== "BN") }
          : null
      );
      // matchupProj stays null unless we projected at least 3 starters on
      // each side (both read from the feed's own `starters` arrays, so
      // they're measured the same way).
      let matchupProj = null;
      if (mine && oppEntry) {
        const sumProj = (starterIds) => {
          let sum = 0;
          let n = 0;
          for (const pid of starterIds || []) {
            if (!pid || pid === "0") continue;
            const pl = players[pid];
            if (!pl) continue;
            const nm = `${pl.first_name || ""} ${pl.last_name || ""}`.trim();
            const v = myProjByName[normalizeName(nm)];
            if (typeof v === "number") {
              sum += v;
              n += 1;
            }
          }
          return { sum: Math.round(sum * 10) / 10, n };
        };
        const a = sumProj(mine.starters);
        const b = sumProj(oppEntry.starters);
        if (a.n >= 3 && b.n >= 3) {
          matchupProj = { mine: a.sum, opp: b.sum };
        }
      }

      // Only surface a week/matchup line when there's something to say:
      // the schedule is posted (matchups feed non-null) or we're in the
      // regular season. A pre-draft league looked up in the offseason
      // has no schedule yet -- show nothing rather than a bare "Week 1".
      const scheduleKnown = !!matchups || state.season_type === "regular";

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
      const record = formatRecord(myRoster.settings);
      // myRoster.starters is ordered to match roster_positions with BN
      // slots filtered out 1:1 (confirmed against real data: a 9-player
      // starters array lines up exactly with 9 non-BN roster_positions
      // entries in order) -- zipping them together is what actually
      // recovers which SLOT ("QB", "FLEX", "SUPER_FLEX", ...) each
      // starter fills, not just who happens to be a starter.
      const nonBenchSlots = (league.roster_positions || []).filter((p) => p !== "BN");
      const bestBall = league.settings?.best_ball === 1;
      // Head-to-head lineups + live win chance (not in best ball: no set lineup).
      const h2h = bestBall ? null : buildH2H(mine, oppEntry, nonBenchSlots, (id) => dictInfo(players[id]), weekProj.byName);
      const season = opts?.season
        ? await getLeagueSeason({
            league,
            rosters,
            users: leagueUsers,
            myRosterId: myRoster.roster_id,
            currentWeek: matchupWeek,
            currentMatchups: matchups,
            players,
            projByName: weekProj.byName,
            gameStates,
          }).catch((e) => {
            console.error("[lookupSleeperTeams] season odds failed:", e.message);
            return null;
          })
        : null;
      const settings = {
        record,
        week: scheduleKnown ? matchupWeek : null,
        opponent: weekOpponent,
        opponentRecord: weekOpponentRecord,
        isBye: weekIsBye,
        matchupProj,
        matchupActual,
        playerPoints: mine?.players_points || null,
        slots: nonBenchSlots,
        h2h,
        winChance: h2h ? matchupOutlook(h2h, gameStates)?.winChance ?? null : null,
        // Standings + playoff odds (full refresh only; see opts.season above).
        ...(season
          ? {
              season,
              playoffOdds: season.standings.find((t) => t.isMe)?.playoffOdds ?? null,
              playoffSettled: Boolean(season.standings.find((t) => t.isMe)?.settled),
            }
          : {}),
        // Best ball leagues have no set lineup -- the platform auto-starts
        // your top scorers -- so Sleeper's `starters` array is mostly "0"
        // placeholders and the Starting Lineup view is meaningless.
        bestBall,
        // Sleeper's league type: 0 redraft, 1 keeper, 2 dynasty (the Sunday board's league-type filter).
        leagueType: ["redraft", "keeper", "dynasty"][league.settings?.type] || null,
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

      const rosterPlayers = (myRoster.players || []).map((playerId) => {
        const p = players[playerId];
        const name = p ? `${p.first_name || ""} ${p.last_name || ""}`.trim() || playerId : playerId;
        const normName = normalizeName(name);
        const myProjPts = myProjByName[normName] ?? null;
        const wk = weekProj.byName[normName];
        const achievements = getAchievements(
          buildAchievementRow(normName, p?.position || null, {
            recentGamesByName: recentGamesByNormName,
            heroWinsByName: heroWinsByNormName,
            redraftFieldsByName: redraftFieldsByNormName,
            woprPercentileByName: woprPercentileByNormName,
          })
        );
        return {
          player_id: playerId,
          name,
          achievements,
          position: p?.position || null,
          team: p?.team || null,
          slot: slotByPlayerId[playerId] || null,
          isStarter: Boolean(slotByPlayerId[playerId]),
          // Index into the starting lineup's own slot order (QB, RB, RB,
          // WR, ... in whatever order this league's roster_positions
          // defines) -- what lets the default view show starters in
          // Sleeper's actual lineup order instead of an arbitrary one.
          slotIndex: slotIndexByPlayerId[playerId] ?? 999,
          myProjPts,
          // This week's weekly range (the lineup optimizer's ceiling / floor tilt, lib/lineupOptimizer.js).
          myFloor: wk?.floor ?? null,
          myCeiling: wk?.ceiling ?? null,
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

// Re-pulls every saved team from Sleeper (record, matchup, live score,
// roster, projections) and writes it back, so the page isn't stuck on
// whatever week the team was saved in. Reuses lookupSleeperTeams, one call
// per distinct Sleeper username.
export async function refreshSavedTeams() {
  const supabase = await createClient();
  const user = await getAuthUser(supabase); // read path: local JWT check, no round trip to Supabase Auth
  if (!user) return { error: "Sign in to refresh teams." };

  const { data: rows } = await supabase
    .from("saved_teams")
    .select("id, platform_username, platform_league_id")
    .eq("user_id", user.id)
    .eq("platform", "sleeper");
  if (!rows?.length) return { teams: {} };

  const usernames = [...new Set(rows.map((r) => r.platform_username).filter(Boolean))];
  const looked = await Promise.all(usernames.map((u) => lookupSleeperTeams(u, { season: true })));
  const byLeague = {};
  for (const res of looked) {
    for (const t of res.teams || []) byLeague[t.league_id] = t;
  }

  const teams = {};
  await Promise.all(
    rows.map(async (row) => {
      const fresh = byLeague[row.platform_league_id];
      if (!fresh) return;
      await supabase
        .from("saved_teams")
        .update({ team_name: fresh.team_name, settings: fresh.settings, players: fresh.players })
        .eq("id", row.id)
        .eq("user_id", user.id);
      teams[row.id] = { team_name: fresh.team_name, settings: fresh.settings, players: fresh.players };
    })
  );
  return { teams, gameStates: await fetchGameStates(), updatedAt: Date.now() };
}

// Lightweight poll for the live dashboard: record, week, opponent, the live
// score, both head-to-head lineups and the win chance for each saved team --
// cheap enough to run every ~30 seconds during games: projections come from a
// 5-minute memory cache (lib/weekProjections.js) and player names from the
// saved lineup, so Sleeper's big player dictionary (itself cached a day) is
// only touched when a starter we haven't seen appears. Returns only the fields
// that change by the minute; the client merges them over the saved settings.
export async function pollLiveScores() {
  const t0 = Date.now();
  const supabase = await createClient();
  const user = await getAuthUser(supabase); // read path: local JWT check, no round trip to Supabase Auth
  if (!user) return { error: "Sign in required." };
  const tAuth = Date.now() - t0;

  // The league rows, the NFL week and the ESPN scoreboard + projections are independent, so they start together.
  const gameStatesP = fetchGameStates();
  const projP = getWeekProjections(supabase, new Date().getFullYear()).catch(() => ({ byName: {} }));
  const stateP = fetchSleeperState();
  stateP.catch(() => {}); // no unhandled rejection if we return early below; the await further down still throws
  const { data: rows } = await supabase
    .from("saved_teams")
    .select("id, platform_league_id, platform_roster_id, settings")
    .eq("user_id", user.id)
    .eq("platform", "sleeper");
  if (!rows?.length) return { live: {} };
  const tRows = Date.now() - t0;
  const state = await stateP;
  const tState = Date.now() - t0;
  const inSeason = state.season_type === "regular";
  const week = inSeason ? state.display_week || state.week || 1 : null;

  // Names for the lineups: everyone already in a saved head-to-head, else the dictionary (loaded at most once).
  const known = {};
  for (const r of rows) {
    for (const p of [...(r.settings?.h2h?.mine || []), ...(r.settings?.h2h?.opp || [])]) {
      if (p.id) known[p.id] = { name: p.name, pos: p.pos, team: p.team, active: !p.out };
    }
  }
  let dictP = null;
  let bbDictP = null; // the player dictionary, loaded only when a best-ball league needs positions
  const fillInfo = async (ids) => {
    if (ids.every((id) => !id || id === "0" || known[id])) return;
    dictP ??= getSleeperPlayers().catch(() => ({}));
    const dict = await dictP;
    for (const id of ids) if (id && id !== "0" && !known[id]) known[id] = dictInfo(dict[id]);
  };

  const live = {};
  const lineups = {};
  await Promise.all(
    rows.map(async (row) => {
      const [rosters, leagueUsers, matchups] = await Promise.all([
        fetchSleeperRosters(row.platform_league_id),
        fetchSleeperLeagueUsers(row.platform_league_id),
        week ? fetchSleeperMatchups(row.platform_league_id, week) : Promise.resolve(null),
      ]);
      const myRoster = rosters.find((r) => String(r.roster_id) === String(row.platform_roster_id));
      if (!myRoster) return;
      // Current starting lineup, so the client can tell when it changed in Sleeper and refresh (lib/rosterAlerts.js).
      lineups[row.id] = (myRoster.starters || []).filter((id) => id && id !== "0").map(String);
      let bestBall = null;
      if (row.settings?.bestBall && row.settings?.slots?.length) {
        bbDictP ??= getSleeperPlayers().catch(() => ({}));
        const dict = await bbDictP;
        bestBall = { posOf: (id) => dict[id]?.position, slots: row.settings.slots };
      }
      const m = resolveMatchup(matchups, myRoster, rosters, leagueUsers, bestBall);
      let h2h = null;
      let winChance = null;
      if (m.mine && m.oppEntry && !row.settings?.bestBall) {
        await fillInfo([...(m.mine.starters || []), ...(m.oppEntry.starters || [])]);
        const [proj, gameStates] = await Promise.all([projP, gameStatesP]);
        h2h = buildH2H(m.mine, m.oppEntry, row.settings?.slots, (id) => known[id], proj.byName);
        winChance = matchupOutlook(h2h, gameStates)?.winChance ?? null;
      }
      live[row.id] = {
        record: formatRecord(myRoster.settings),
        week: matchups || inSeason ? week : null,
        opponent: m.weekOpponent,
        opponentRecord: m.weekOpponentRecord,
        isBye: m.weekIsBye,
        matchupActual: m.matchupActual,
        // Each player's points so far this week in this league's scoring (the Starting Lineup's Points column).
        playerPoints: m.mine?.players_points || null,
        h2h,
        winChance,
      };
    })
  );
  const gameStates = await gameStatesP;
  // Timing of each stage (ms since the poll started), in the runtime logs, to see where a slow poll spends its time.
  console.info("[poll]", JSON.stringify({ leagues: rows.length, auth: tAuth, rows: tRows, state: tState, total: Date.now() - t0 }));
  return { live, lineups, gameStates, updatedAt: Date.now() };
}

// Recent plays for the players on the field right now (the Sunday board's "Playing now" panel, lib/playByPlay.js).
// The browser sends the panel's rows (it already knows who is live and on which side); nothing is stored.
export async function getLivePlays(players) {
  const supabase = await createClient();
  const user = await getAuthUser(supabase); // read path: local JWT check, no round trip to Supabase Auth
  if (!user) return { error: "Sign in required." };
  if (!Array.isArray(players) || !players.length) return { plays: [] };
  const clean = players
    .slice(0, 80)
    .map((p) => ({
      playerId: String(p?.playerId ?? "").slice(0, 20),
      name: String(p?.name ?? "").slice(0, 60),
      pos: String(p?.pos ?? "").slice(0, 4),
      team: String(p?.team ?? "").slice(0, 4),
      side: p?.side === "theirs" ? "theirs" : "mine",
    }))
    .filter((p) => p.playerId && p.name && p.team);
  try {
    return await loadLivePlays(clean, await fetchGameStates()); // { plays, totals }
  } catch {
    return { plays: [], totals: {} };
  }
}

// One player's box-score line for this game (the matchup rows' click-the-score slide, app/my-team/GameStats.js, lib/gameStats.js).
export async function getGameStats(players) {
  const supabase = await createClient();
  const user = await getAuthUser(supabase);
  if (!user) return { error: "Sign in required." };
  const clean = (Array.isArray(players) ? players : [])
    .slice(0, 4)
    .map((p) => ({ name: String(p?.name ?? "").slice(0, 60), team: String(p?.team ?? "").slice(0, 4), pos: String(p?.pos ?? "").slice(0, 4) }))
    .filter((p) => p.name && p.team);
  try {
    return { stats: await loadGameStats(clean, await fetchGameStates()) };
  } catch {
    return { stats: {} };
  }
}

// "Best available" for one saved league (app/my-team/WaiverWire.js): QB / RB / WR / TE on no roster in that league,
// ranked by this week's projection, (lib/waivers.js). Depth follows the weekly
// rankings gate: Explorer and up see everyone; free accounts see available players inside the free top 50 plus a
// count of the rest. Read fresh from Sleeper each time the panel opens; nothing is stored.
let waiverIdx = { dict: null, idx: null };
export async function getWaiverWire(teamId) {
  const supabase = await createClient();
  const { user, tier } = await resolveTier(supabase);
  if (!user) return { error: "Sign in required." };
  const { data: row } = await supabase
    .from("saved_teams")
    .select("platform_league_id")
    .eq("id", teamId)
    .eq("user_id", user.id)
    .eq("platform", "sleeper")
    .maybeSingle();
  if (!row?.platform_league_id) return { error: "League not found." };
  const [rosters, dict, week] = await Promise.all([
    fetchSleeperRosters(row.platform_league_id).catch(() => null),
    getSleeperPlayers().catch(() => null),
    getWeekRankRows(supabase, new Date().getFullYear()),
  ]);
  if (!rosters?.length || !dict) return { error: "Couldn't read this league from Sleeper right now." };
  if (waiverIdx.dict !== dict) waiverIdx = { dict, idx: sleeperIndex(dict) };
  const rostered = new Set();
  for (const r of rosters) for (const id of [...(r.players || []), ...(r.reserve || []), ...(r.taxi || [])]) rostered.add(String(id));
  const full = tier === "explorer" || tier === "singularity";
  const { players, hidden } = buildWaiverList({ rows: week.rows, rostered, idx: waiverIdx.idx, maxRank: full ? Infinity : 50 });
  return { players, hidden, full, week: week.week };
}

// The Analytics tab's game log, loaded when that tab opens instead of with every My Team page view (lib/myGameLogs.js). The
// players come from the signed-in user's own saved teams, never from the browser.
export async function getMyGameLogs() {
  const supabase = await createClient();
  const user = await getAuthUser(supabase);
  if (!user) return { logs: {} };
  const { data: teams } = await supabase.from("saved_teams").select("players").eq("user_id", user.id);
  return { logs: await loadGameLogsFor(namesOnTeams(teams)) };
}

// Injury + news for everyone on the signed-in user's saved rosters, from
// the live ESPN feed (lib/injuryFeed.js). Returns `items` (one per player,
// with the leagues they start / are rostered in, newest news first) for the news panel and
// `byTeam` (starters with an injury designation, per saved team) for
// the dashboard's Alerts column. Healthy players only appear if their latest news is under 72h old.
export async function getRosterNews() {
  const supabase = await createClient();
  const user = await getAuthUser(supabase); // read path: local JWT check, no round trip to Supabase Auth
  if (!user) return { error: "Sign in required." };

  const [{ data: teams }, feed] = await Promise.all([
    supabase.from("saved_teams").select("id, team_name, league_name, players").eq("user_id", user.id),
    fetchInjuryFeed(),
  ]);
  if (!feed) return { unavailable: true };

  const byKey = new Map();
  const byNorm = new Map();
  for (const f of feed) {
    byKey.set(`${f.norm}|${f.position}`, f);
    if (!byNorm.has(f.norm)) byNorm.set(f.norm, f);
  }

  const items = new Map();
  const byTeam = {};
  // Every rostered player's designation, keyed like the client's lib/rosterAlerts.js, so the browser can rebuild the
  // alerts from the current lineup (a player benched since this ran stops being an alert right away).
  const statusByKey = {};
  const cutoff = Date.now() - 72 * 3600 * 1000;
  for (const t of teams || []) {
    for (const p of t.players || []) {
      const norm = normalizeName(p.name);
      const f = byKey.get(`${norm}|${p.position}`) || byNorm.get(norm);
      if (!f) continue;
      const recent = f.date && new Date(f.date).getTime() > cutoff;
      const key = `${norm}|${p.position}`;
      if (f.severity > 0) statusByKey[key] = { status: f.status, severity: f.severity };
      if (f.severity === 0 && !recent) continue;
      if (!items.has(key)) {
        items.set(key, { ...f, key, team: p.team, starts: [], rosters: [] });
      }
      const it = items.get(key);
      const label = t.league_name || t.team_name;
      it.rosters.push(label);
      if (p.isStarter) it.starts.push(label);
      // Dashboard alert: a STARTER carrying a designation (Questionable /
      // Doubtful / Out / IR) for the upcoming game.
      if (p.isStarter && f.severity > 0) {
        (byTeam[t.id] ??= []).push({ name: p.name, status: f.status, severity: f.severity });
      }
    }
  }
  // Newest news first (the 80-item cap then keeps the freshest, not the most severe).
  const list = [...items.values()].sort(
    (a, b) =>
      new Date(b.date || 0) - new Date(a.date || 0) || b.severity - a.severity
  );
  return { items: list.slice(0, 80), byTeam, statusByKey, updatedAt: Date.now() };
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

  // Only a NEW save counts against the tier cap -- re-saving an existing
  // team to refresh its roster is always allowed. The DB trigger
  // (0024_saved_teams_tier_limit.sql) enforces the same rule; this
  // pre-check just produces a friendlier message than the raw pg error.
  const { data: existing } = await supabase
    .from("saved_teams")
    .select("id")
    .eq("user_id", user.id)
    .eq("platform", "sleeper")
    .eq("platform_league_id", leagueId)
    .maybeSingle();

  if (!existing) {
    const { tier } = await resolveTier(supabase);
    const limit = savedTeamLimit(tier);
    if (limit != null) {
      const { count } = await supabase
        .from("saved_teams")
        .select("id", { count: "exact", head: true })
        .eq("user_id", user.id);
      if ((count || 0) >= limit) {
        return {
          error:
            limit === 1
              ? "Stargazer saves 1 team. Upgrade to Explorer for unlimited saved teams."
              : `Your plan saves up to ${limit} teams.`,
          limitReached: true,
        };
      }
    }
  }

  const { data: savedRow, error } = await supabase
    .from("saved_teams")
    .upsert(
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
    )
    .select()
    .single();

  if (error) {
    // Trigger fallback, in case a concurrent save slipped past the check.
    if (error.code === "23514" || /Saved-team limit/.test(error.message || "")) {
      return {
        error: "Saved-team limit reached. Upgrade for unlimited saved teams.",
        limitReached: true,
      };
    }
    return { error: error.message };
  }

  // Append-only history row (see 0031_team_snapshot_history.sql) plus a
  // refreshed season-record insight -- both best-effort: a failure here
  // shouldn't block the save itself from succeeding, since the roster is
  // already safely persisted in saved_teams above.
  if (savedRow) {
    await supabase.from("team_snapshot_history").insert({
      saved_team_id: savedRow.id,
      user_id: user.id,
      players,
      settings: settings || {},
    });
    await computeAndSaveInsight(supabase, {
      key: "season_record_badge",
      userId: user.id,
      savedTeamId: savedRow.id,
      input: { settings: settings || {} },
    }).catch((e) => console.error("[saveTeam] season_record_badge insight failed:", e.message));
  }

  // No revalidatePath here: the client appends the saved team to its own list
  // so several teams can be added back-to-back without the page re-rendering
  // after each one. (deleteTeam / setBuyIn still revalidate.)
  return { success: true, id: savedRow?.id ?? null };
}

// Scores the GM Archetype quiz (see lib/insights/gmArchetype.js) and
// persists it as a user-scoped insight -- no saved team required, so
// this works the moment someone signs in, before they've imported a
// roster at all.
export async function submitGmArchetypeQuiz(answers) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { error: "Sign in to take the quiz." };
  }

  let value;
  try {
    value = await computeAndSaveInsight(supabase, {
      key: "gm_archetype_quiz",
      userId: user.id,
      input: answers,
    });
  } catch (e) {
    console.error("[submitGmArchetypeQuiz] insight save failed:", e.message);
    return { error: "Couldn't save your result — try again in a moment." };
  }

  revalidatePath("/my-team");
  revalidatePath("/my-team/quiz");
  return { success: true, value };
}

// Sets (or clears, with null/"") the optional per-team buy-in used by
// the portfolio view. Its own action rather than part of saveTeam()
// since it's user-entered and independent of the Sleeper snapshot.
export async function setBuyIn(teamId, buyIn) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { error: "Sign in to manage saved teams." };
  }

  const n =
    buyIn === "" || buyIn === null || buyIn === undefined ? null : Number(buyIn);
  if (n !== null && (!Number.isFinite(n) || n < 0)) {
    return { error: "Enter a valid buy-in amount." };
  }

  const { error } = await supabase
    .from("saved_teams")
    .update({ buy_in: n })
    .eq("id", teamId)
    .eq("user_id", user.id);

  if (error) {
    return { error: error.message };
  }

  revalidatePath("/my-team");
  return { success: true, buyIn: n };
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


// Turns the weekly "Your Players This Week" email on or off (Explorer and up; sent by scripts/send-weekly-digest.mjs).
// Needs migration 0038 (profiles.email_digest, and the column privilege that lets a member change only this one).
export async function setEmailDigest(enabled) {
  const supabase = await createClient();
  const { user, tier } = await resolveTier(supabase);
  if (!user) return { error: "Sign in first." };
  if (tier === "stargazer") return { error: "The weekly email is part of Explorer." };
  const { error } = await supabase.from("profiles").update({ email_digest: Boolean(enabled) }).eq("id", user.id);
  if (error) {
    return { error: /email_digest/.test(error.message || "") ? "The weekly email isn't set up yet (database migration 0038 is pending)." : "Couldn't save that. Please try again." };
  }
  return { enabled: Boolean(enabled) };
}

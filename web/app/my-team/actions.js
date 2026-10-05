"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { resolveTier, savedTeamLimit } from "@/lib/tier";
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
  fetchSleeperResearch,
  getSleeperPlayers,
} from "@/lib/sleeper";
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
function resolveMatchup(matchups, myRoster, rosters, leagueUsers) {
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
  return out;
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

  // Our own model's week 1 projection, alongside Sleeper's -- same
  // redraft_rankings table /tools/redraft-rankings reads from (public
  // read, no tier gate on the projection column itself), matched by
  // normalized player name since Sleeper IDs don't exist in that table.
  const supabase = await createClient();
  // Latest week our model has published for this season (it publishes the
  // upcoming week), rather than a hard-coded week 1.
  const { data: latestProj } = await supabase
    .from("redraft_rankings")
    .select("week")
    .eq("season", Number(season))
    .order("week", { ascending: false })
    .limit(1)
    .maybeSingle();
  const projWeek = latestProj?.week ?? 1;
  const { data: myProjRows } = await supabase
    .from("redraft_rankings")
    .select("player_name, projection")
    .eq("season", Number(season))
    .eq("week", projWeek);
  const myProjByName = {};
  (myProjRows || []).forEach((row) => {
    if (row.player_name && typeof row.projection === "number") {
      myProjByName[normalizeName(row.player_name)] = row.projection;
    }
  });

  // Same achievement badges Weekly Projection Rankings shows (On Fire/On
  // Thin Ice/Risky Icarus/Steady Eddy/Buy Low/Sell High/Weekly Hero/
  // Honorable/Con Artist), applied here as-is -- not retuned for a roster context. Uses the
  // current season (the same one already resolved above for the
  // projection lookup) for Weekly Hero's own season-scoping.
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
      } = resolveMatchup(matchups, myRoster, rosters, leagueUsers);
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
      const settings = {
        record,
        week: scheduleKnown ? matchupWeek : null,
        opponent: weekOpponent,
        opponentRecord: weekOpponentRecord,
        isBye: weekIsBye,
        matchupProj,
        matchupActual,
        // Best ball leagues have no set lineup -- the platform auto-starts
        // your top scorers -- so Sleeper's `starters` array is mostly "0"
        // placeholders and the Starting Lineup view is meaningless.
        bestBall: league.settings?.best_ball === 1,
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

      const rosterPlayers = (myRoster.players || []).map((playerId) => {
        const p = players[playerId];
        const r = research[playerId];
        const name = p ? `${p.first_name || ""} ${p.last_name || ""}`.trim() || playerId : playerId;
        const normName = normalizeName(name);
        const myProjPts = myProjByName[normName] ?? null;
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

// Re-pulls every saved team from Sleeper (record, matchup, live score,
// roster, projections) and writes it back, so the page isn't stuck on
// whatever week the team was saved in. Reuses lookupSleeperTeams, one call
// per distinct Sleeper username.
export async function refreshSavedTeams() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Sign in to refresh teams." };

  const { data: rows } = await supabase
    .from("saved_teams")
    .select("id, platform_username, platform_league_id")
    .eq("user_id", user.id)
    .eq("platform", "sleeper");
  if (!rows?.length) return { teams: {} };

  const usernames = [...new Set(rows.map((r) => r.platform_username).filter(Boolean))];
  const looked = await Promise.all(usernames.map((u) => lookupSleeperTeams(u)));
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
  return { teams, updatedAt: Date.now() };
}

// Lightweight poll for the live dashboard: just record, week, opponent and
// the live score for each saved team -- no player dictionary, no
// projections -- so it's cheap enough to run every ~30 seconds during
// games. Returns only the fields that change by the minute; the client
// merges them over the saved settings.
export async function pollLiveScores() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Sign in required." };

  const { data: rows } = await supabase
    .from("saved_teams")
    .select("id, platform_league_id, platform_roster_id")
    .eq("user_id", user.id)
    .eq("platform", "sleeper");
  if (!rows?.length) return { live: {} };

  const state = await fetchSleeperState();
  const inSeason = state.season_type === "regular";
  const week = inSeason ? state.display_week || state.week || 1 : null;

  const live = {};
  await Promise.all(
    rows.map(async (row) => {
      const [rosters, leagueUsers, matchups] = await Promise.all([
        fetchSleeperRosters(row.platform_league_id),
        fetchSleeperLeagueUsers(row.platform_league_id),
        week ? fetchSleeperMatchups(row.platform_league_id, week) : Promise.resolve(null),
      ]);
      const myRoster = rosters.find((r) => String(r.roster_id) === String(row.platform_roster_id));
      if (!myRoster) return;
      const m = resolveMatchup(matchups, myRoster, rosters, leagueUsers);
      live[row.id] = {
        record: formatRecord(myRoster.settings),
        week: matchups || inSeason ? week : null,
        opponent: m.weekOpponent,
        opponentRecord: m.weekOpponentRecord,
        isBye: m.weekIsBye,
        matchupActual: m.matchupActual,
      };
    })
  );
  return { live, updatedAt: Date.now() };
}

// Injury + news for everyone on the signed-in user's saved rosters, from
// the live ESPN feed (lib/injuryFeed.js). Returns `items` (one per player,
// with the leagues they start / are rostered in, newest news first) for the news panel and
// `byTeam` (starters with an injury designation, per saved team) for
// the dashboard's Alerts column. Healthy players only appear if their latest news is under 72h old.
export async function getRosterNews() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
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
  const cutoff = Date.now() - 72 * 3600 * 1000;
  for (const t of teams || []) {
    for (const p of t.players || []) {
      const norm = normalizeName(p.name);
      const f = byKey.get(`${norm}|${p.position}`) || byNorm.get(norm);
      if (!f) continue;
      const recent = f.date && new Date(f.date).getTime() > cutoff;
      if (f.severity === 0 && !recent) continue;
      const key = `${norm}|${p.position}`;
      if (!items.has(key)) {
        items.set(key, { ...f, team: p.team, starts: [], rosters: [] });
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
  return { items: list.slice(0, 80), byTeam, updatedAt: Date.now() };
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

  revalidatePath("/my-team");
  return { success: true };
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

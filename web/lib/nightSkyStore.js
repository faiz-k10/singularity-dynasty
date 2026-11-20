import { after } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { grantPlanTime } from "@/lib/skyPlanTime";
import { fetchSleeperState } from "@/lib/sleeper";
import { nflSeason } from "@/lib/season";
import { getCachedRedraftData } from "@/app/tools/redraft-rankings/data";
import { fetchWeekGameStates, teamCode } from "@/lib/gameStatus";
import { freshState, normalize, award, rollSeason, skySeasonFor, unlockSkins, equipSkin, makeFreePick, makeSkinChoice, pickPairs, gradePicks, eventFor, titleOf, seasonProgress, LADDER } from "@/lib/nightSky";

// The Night Sky's storage and every roll of the dice (the rules are lib/nightSky.js). One row per member in `night_sky` (migration 0046),
// read and written only here with the service role. Nothing in this file throws to its caller: the game must never break a page.

const TABLE = "night_sky";

// Today's date in the Eastern time zone (the NFL's), as YYYY-MM-DD and as a UTC-midnight Date for the calendar events.
function easternDay(now = Date.now()) {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(now));
  return { day: parts, date: new Date(`${parts}T00:00:00Z`) };
}
async function context(now = Date.now()) {
  const state = await fetchSleeperState().catch(() => ({}));
  const { day, date } = easternDay(now);
  const week = state.season_type === "regular" ? Number(state.display_week || state.week) || 0 : 0;
  return { now, day, event: eventFor(date, week), week, season: nflSeason(state), skySeason: skySeasonFor(day) };
}

// read() returns the state; readV() also its version (updated_at; null = no row yet) for mutate().
async function readV(userId) {
  const { data, error } = await createAdminClient().from(TABLE).select("state, updated_at").eq("user_id", userId).maybeSingle();
  if (error) throw error;
  return { state: normalize(data?.state || freshState()), version: data?.updated_at ?? null };
}
const read = async (userId) => (await readV(userId)).state;

// Every change goes through here: read, change, and write ONLY if nobody wrote in between (compare-and-swap on updated_at); on a clash
// it reads again and redoes the change. Before (Nov 17 2026, founder: tasks didn't show as done), each writer saved the whole state it
// had read, so an award landing while another page's award or the sky page itself was saving could be overwritten and lost.
// `change(state)` edits the state in place and returns { write: boolean, value }.
async function mutate(userId, change, tries = 5) {
  const db = createAdminClient();
  for (let i = 0; i < tries; i++) {
    const { state, version } = await readV(userId);
    const r = await change(state);
    if (!r.write) return r.value;
    const row = { state, updated_at: new Date().toISOString() };
    const { data, error } = version == null
      ? await db.from(TABLE).insert({ user_id: userId, ...row }).select("user_id")
      : await db.from(TABLE).update(row).eq("user_id", userId).eq("updated_at", version).select("user_id");
    if (error && error.code !== "23505") throw error; // 23505: someone created the row first -- read again
    if (!error && data?.length === 1) return r.value;
  }
  throw new Error("The Night Sky is busy. Please try again.");
}

// The Account page's one-line summary: { title, points, waiting } or null (no table yet, or nothing played).
export async function skySummary(userId) {
  try {
    const s = await read(userId);
    if (!s.actions) return { title: "Spotter", points: 0, waiting: 0, fresh: true };
    return { title: titleOf(s), points: seasonProgress(s).points, waiting: s.pending.length, fresh: false };
  } catch {
    return null;
  }
}

// One action on the site (lib/nightSky.js ACTIONS). Counted once a day; never throws.
export async function awardAction(userId, action) {
  if (!userId) return null;
  try {
    const ctx = await context();
    return await mutate(userId, (state) => {
      const r = award(state, action, ctx);
      if (r.awarded) unlockSkins(state, ctx.now);
      return { write: r.awarded, value: r };
    });
  } catch (e) {
    console.error("[night-sky] award failed:", e?.message || e);
    return null;
  }
}
// Award after the page has been sent, so the game never slows a page down.
export function awardLater(userId, action) {
  if (!userId) return;
  after(() => awardAction(userId, action));
}

// This week's Beat the Model pairs (from the weekly rankings), and grading any finished week the member picked in.
async function weekPairs(ctx) {
  const cached = await getCachedRedraftData().catch(() => null);
  if (!cached?.latest) return null;
  const { season, week } = cached.latest;
  return { key: `${season}-${week}`, season, week, pairs: pickPairs(cached.rows, season, week) };
}
// A week is over once Sleeper has moved past it OR the next week's rankings are published (the Tuesday run only
// publishes them after every game of the week is final; Sleeper's week only turns on Wednesday).
async function gradeFinished(state, ctx, latest) {
  const open = Object.entries(state.picks).filter(([, w]) => !w.graded && w.choice?.some((c) => c != null));
  const before = (season, week, s2, w2) => season < s2 || (season === s2 && week < w2);
  for (const [key, w] of open) {
    if (!before(w.season, w.week, ctx.season, ctx.week) && !(latest && before(w.season, w.week, latest.season, latest.week))) continue; // the week isn't over yet
    const names = [...new Set(w.pairs.flatMap((p) => [p.a, p.b]))];
    const { data } = await createAdminClient().from("player_game_log").select("player_name, fantasy_points_ppr").eq("season", w.season).eq("week", w.week).in("player_name", names);
    if (!data?.length) continue; // the game log for that week isn't published yet
    const pts = Object.fromEntries(data.map((r) => [r.player_name, Number(r.fantasy_points_ppr) || 0]));
    gradePicks(state, key, pts, ctx);
  }
}

// Everything the sky page needs. { ready: false } when the table isn't there yet (migration 0046 not run).
export async function loadSky(userId) {
  try {
    const ctx = await context();
    const wk = await weekPairs(ctx);
    const state = await mutate(userId, async (state) => {
      const rolled = rollSeason(state, ctx.skySeason); // a new NFL season: a new set of constellations
      const before = JSON.stringify(state.picks);
      await gradeFinished(state, ctx, wk);
      if (wk && !state.picks[wk.key]) state.picks[wk.key] = { season: wk.season, week: wk.week, pairs: wk.pairs, choice: wk.pairs.map(() => null), graded: false };
      const grantsBefore = JSON.stringify([state.granted, state.choices]);
      const newSkins = unlockSkins(state, ctx.now).length; // e.g. earned before skins existed, or by graded picks; also hands out rung rewards
      const granted = JSON.stringify([state.granted, state.choices]) !== grantsBefore;
      return { write: !!(rolled || newSkins || granted || JSON.stringify(state.picks) !== before), value: state };
    });
    return { ready: true, state, ctx, weekKey: wk?.key || null };
  } catch (e) {
    console.error("[night-sky] load failed:", e?.message || e);
    return { ready: false };
  }
}

// The member saw their finds in the telescope.
export async function markSeen(userId, ids) {
  const set = new Set(ids);
  return mutate(userId, (state) => {
    state.pending = state.pending.filter((p) => !set.has(p.id));
    state.strains = 0;
    return { write: true, value: state };
  });
}
// A Beat the Model pick for this week (only before the week's games are graded).
// A pick closes once EITHER player's game has kicked off (security pass, Nov 16 2026: picks used to stay open until the week was graded, after
// Monday night, so a member could pick the player who had already scored more and farm stars toward the ladder's real rewards). Reads that
// exact week's scoreboard; anything it can't confirm (an older week, an unknown team, ESPN unreachable) counts as closed.
export const PICK_CLOSED = "Picks close when either player's game kicks off.";
async function pickClosed(wk, index, now = Date.now()) {
  const cached = await getCachedRedraftData().catch(() => null);
  if (!cached?.latest || cached.latest.season !== wk.season || cached.latest.week !== wk.week) return true;
  const states = await fetchWeekGameStates(wk.season, wk.week).catch(() => null);
  if (!states) return true;
  const pair = wk.pairs[index];
  return [pair.a, pair.b].some((name) => {
    const g = states[teamCode(cached.rows.find((r) => r.player_name === name)?.team)];
    return !g || g.state !== "pre" || (g.start && Date.parse(g.start) <= now);
  });
}

export async function makePick(userId, key, index, choice) {
  return mutate(userId, async (state) => {
    const wk = state.picks[key];
    if (!wk || wk.graded || !wk.pairs[index] || (choice !== 0 && choice !== 1)) return { write: false, value: state };
    if (await pickClosed(wk, index)) throw Object.assign(new Error(PICK_CLOSED), { closed: true });
    const had = wk.choice[index] != null;
    wk.choice[index] = choice;
    if (!had) state.log.unshift({ t: Date.now(), text: "Pick made: an unlit star waits for the week's results" });
    return { write: true, value: state };
  });
}
// Choosing a skin the member has earned.
export async function setSkin(userId, kind, id) {
  return mutate(userId, (state) => ({ write: !!equipSkin(state, kind, id), value: state }));
}
// Claiming a ladder reward. One claim per rung per season: the key is "<season>:<rung index>". Plan time (`plan`) is granted on the spot
// (lib/skyPlanTime.js) and the claim is marked done with what was given; if the grant fails the claim is taken back so the member can try
// again. Everything else (the Discord role, the newsletter shout-out) waits for the founder in openClaims().
export const CLAIM_FAILED = "Couldn't add your plan time just now. Please try again in a minute.";
export async function claimReward(userId, index) {
  const rung = LADDER[index];
  let key = null;
  const state = await mutate(userId, (state) => {
    const p = seasonProgress(state);
    key = `${state.season}:${index}`;
    if (!rung?.claim || !p.done[index] || state.claimed[key]) return { write: false, value: state };
    state.claimed[key] = { at: Date.now(), season: state.season, index };
    return { write: true, value: state };
  });
  if (!rung?.plan || state.claimed[key]?.done || state.claimed[key]?.gave) return state;
  try {
    const { gave, manual } = await grantPlanTime(userId, rung.plan, state.season);
    // a manual one (a Singularity member's consult) stays open for the founder in /admin
    return await mutate(userId, (s) => { if (s.claimed[key]) s.claimed[key] = { ...s.claimed[key], done: !manual, gave }; return { write: true, value: s }; });
  } catch (e) {
    console.error("[night-sky] plan time failed:", e?.message || e);
    await mutate(userId, (s) => { const { [key]: _gone, ...rest } = s.claimed; s.claimed = rest; return { write: true, value: s }; }).catch(() => {});
    throw Object.assign(new Error(CLAIM_FAILED), { closed: true });
  }
}
// A free "fill a gap" pick (ladder rungs with `pick`): the member chose a kind and colour; the version is rolled here. Rung rewards it unlocks
// (a set's points can pass a rung) are handed out in the same write.
export async function choosePick(userId, key, fam, colour) {
  return mutate(userId, (state) => {
    const f = makeFreePick(state, key, fam, colour, { now: Date.now() });
    if (f) unlockSkins(state, Date.now());
    return { write: !!f, value: state };
  });
}
// The 20,000 rung's skin of the member's choice: the next locked sky or core skin.
export async function chooseSkin(userId, key, kind, id) {
  return mutate(userId, (state) => ({ write: makeSkinChoice(state, key, kind, id, Date.now()), value: state }));
}
// For /admin: every claimed reward the founder still has to give by hand (the Discord role, the newsletter shout-out, a Singularity
// member's consult), oldest first, with the member's email. `what` names the one thing to do.
const CLAIM_WHAT = (c) => (c.gave?.startsWith("1-on-1") ? "1-on-1 consult" : LADDER[c.index]?.discord ? "Discord season role" : LADDER[c.index]?.skinChoice ? "Newsletter shout-out" : LADDER[c.index]?.reward);
export async function openClaims() {
  const admin = createAdminClient();
  const { data, error } = await admin.from(TABLE).select("user_id, state");
  if (error) throw error;
  const out = [];
  for (const row of data || []) for (const [key, c] of Object.entries(row.state?.claimed || {})) if (!c.done && c.index != null) out.push({ user_id: row.user_id, key, season: c.season, what: CLAIM_WHAT(c), when: c.at });
  const ids = [...new Set(out.map((c) => c.user_id))];
  const { data: people } = ids.length ? await admin.from("profiles").select("id, email, tier").in("id", ids) : { data: [] };
  const who = new Map((people || []).map((p) => [p.id, p]));
  return out.map((c) => ({ ...c, email: who.get(c.user_id)?.email || "", tier: who.get(c.user_id)?.tier || "" })).sort((a, b) => a.when - b.when);
}
// The founder gave a hand-fulfilled reward: it leaves /admin's list (and the member's ladder row says "Sent").
export async function markClaimDone(userId, key) {
  return mutate(userId, (state) => {
    const c = state.claimed?.[key];
    if (!c || c.done) return { write: false, value: null };
    state.claimed[key] = { ...c, done: true, doneAt: Date.now() };
    return { write: true, value: null };
  });
}

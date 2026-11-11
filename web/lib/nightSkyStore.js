import { after } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { fetchSleeperState } from "@/lib/sleeper";
import { nflSeason } from "@/lib/season";
import { getCachedRedraftData } from "@/app/tools/redraft-rankings/data";
import { freshState, normalize, award, rollSeason, skySeasonFor, unlockSkins, equipSkin, pickPairs, gradePicks, eventFor, titleFor, LADDER } from "@/lib/nightSky";

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

async function read(userId) {
  const { data, error } = await createAdminClient().from(TABLE).select("state").eq("user_id", userId).maybeSingle();
  if (error) throw error;
  return normalize(data?.state || freshState());
}
async function write(userId, state) {
  const { error } = await createAdminClient().from(TABLE).upsert({ user_id: userId, state, updated_at: new Date().toISOString() });
  if (error) throw error;
}

// The Account page's one-line summary: { title, points, waiting } or null (no table yet, or nothing played).
export async function skySummary(userId) {
  try {
    const s = await read(userId);
    if (!s.actions) return { title: titleFor(0), points: 0, waiting: 0, fresh: true };
    return { title: titleFor(s.points), points: s.points, waiting: s.pending.length, fresh: false };
  } catch {
    return null;
  }
}

// One action on the site (lib/nightSky.js ACTIONS). Counted once a day; never throws.
export async function awardAction(userId, action) {
  if (!userId) return null;
  try {
    const [state, ctx] = await Promise.all([read(userId), context()]);
    const r = award(state, action, ctx);
    if (r.awarded) { unlockSkins(state, ctx.now); await write(userId, state); }
    return r;
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
async function gradeFinished(state, ctx) {
  const open = Object.entries(state.picks).filter(([, w]) => !w.graded && w.choice?.some((c) => c != null));
  for (const [key, w] of open) {
    if (!(w.season < ctx.season || (w.season === ctx.season && w.week < ctx.week))) continue; // the week isn't over yet
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
    const [state, ctx] = await Promise.all([read(userId), context()]);
    const rolled = rollSeason(state, ctx.skySeason); // a new NFL season: a new set of constellations
    const before = JSON.stringify(state.picks);
    await gradeFinished(state, ctx);
    const wk = await weekPairs(ctx);
    if (wk && !state.picks[wk.key]) state.picks[wk.key] = { season: wk.season, week: wk.week, pairs: wk.pairs, choice: wk.pairs.map(() => null), graded: false };
    const newSkins = unlockSkins(state, ctx.now).length; // e.g. earned before skins existed, or by graded picks
    if (rolled || newSkins || JSON.stringify(state.picks) !== before) await write(userId, state);
    return { ready: true, state, ctx, weekKey: wk?.key || null };
  } catch (e) {
    console.error("[night-sky] load failed:", e?.message || e);
    return { ready: false };
  }
}

// The member saw their finds in the telescope.
export async function markSeen(userId, ids) {
  const state = await read(userId);
  const set = new Set(ids);
  state.pending = state.pending.filter((p) => !set.has(p.id));
  state.strains = 0;
  await write(userId, state);
  return state;
}
// A Beat the Model pick for this week (only before the week's games are graded).
export async function makePick(userId, key, index, choice) {
  const state = await read(userId);
  const wk = state.picks[key];
  if (!wk || wk.graded || !wk.pairs[index] || (choice !== 0 && choice !== 1)) return state;
  const had = wk.choice[index] != null;
  wk.choice[index] = choice;
  if (!had) state.log.unshift({ t: Date.now(), text: "Pick made: an unlit star waits for the week's results" });
  await write(userId, state);
  return state;
}
// Choosing a skin the member has earned.
export async function setSkin(userId, kind, id) {
  const state = await read(userId);
  if (equipSkin(state, kind, id)) await write(userId, state);
  return state;
}
// Claiming a ladder reward the founder fulfils by hand (it shows in /admin).
export async function claimReward(userId, at) {
  const state = await read(userId);
  const rung = LADDER.find((r) => r.at === at);
  if (!rung?.claim || state.points < at || state.claimed[at]) return state;
  state.claimed[at] = { at: Date.now() };
  await write(userId, state);
  return state;
}
// For /admin: every claimed reward not yet marked fulfilled.
export async function openClaims() {
  try {
    const { data, error } = await createAdminClient().from(TABLE).select("user_id, state");
    if (error) throw error;
    const out = [];
    for (const row of data || []) for (const [at, c] of Object.entries(row.state?.claimed || {})) if (!c.done) out.push({ user_id: row.user_id, at: Number(at), reward: LADDER.find((r) => r.at === Number(at))?.reward, when: c.at });
    return out.sort((a, b) => b.when - a.when);
  } catch {
    return null;
  }
}

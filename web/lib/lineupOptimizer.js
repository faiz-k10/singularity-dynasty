// Start / sit for one saved league (app/my-team/LineupAdvice.js, the Companion's "Lineup upgrade" cards): who to start over whom.
// Pure; tested in test/lineupOptimizer.test.mjs.
//
// THE DECISION is the win chance, not a score of our own: every swap is judged by what it does to your chance of beating this week's
// opponent, using the same model that draws the "% to win" on the cards (lib/winChance.js). Each player is the split normal his
// published floor / median / ceiling describe, so an underdog is steered to upside and a favorite to a safe floor automatically, and
// a long-shot ceiling isn't mistaken for an average. A Smash Spot / Tough Spot (his opponent's trend against his position, saved as
// myLean = { call, effect }) moves his whole range by the points effect the Weekly Projection Rankings page quotes for it -- the
// published number, no weighting of our own. Every number shown on a swap is one the site publishes (median, floor, ceiling).
// Without this week's opponent (a snapshot from before the matchup was saved, a bye) it falls back to the median, and says so.
//
// What it will NOT touch: a player whose game has started (Sleeper locks him) stays where he is and can't be moved in or out;
// slots our model has no projection for (K, DEF, IDP) and players with no projection keep whoever is there now. A player the injury
// feed lists Doubtful or worse is never a start (and a starter like that scores 0).
import { ELIGIBLE } from "./bestBall.js";
import { num, round1 as r1, fmt1 } from "./format.js";
import { summarizeSide, playerOutlook, lineupSwapSim } from "./winChance.js";

// "SUPER_FLEX" -> "SUPERFLEX": how a slot is named on screen (the one place that maps it).
export const slotLabel = (slot) => (slot === "SUPER_FLEX" ? "SUPERFLEX" : slot);

const PROJECTED = new Set(["QB", "RB", "WR", "TE"]);

// "10.8 (3.0–22.0)": a player's median and his floor-ceiling range the way the rankings show them; just the median when there is no range.
export const rangeText = (p) => {
  const f = num(p?.myFloor);
  const c = num(p?.myCeiling);
  return f != null && c != null ? `${fmt1(p.myProjPts)} (${fmt1(f)}–${fmt1(c)})` : fmt1(p?.myProjPts ?? 0);
};

const MIN_GAIN = 0.1; // median fallback: points
const MIN_WIN_GAIN = 0.005; // win chance: half a point of win probability
// A player the injury feed lists Doubtful or worse (severity 3+): he is not a lineup option, and a starter like that is worth 0 in the lineup.
const OUT_SEVERITY = 3;
const outNames = (injuries) => new Set((injuries || []).filter((i) => i.severity >= OUT_SEVERITY).map((i) => i.name));

// Roster with locks, Out players zeroed, the slots that can change and the bench players who can move in. null when there is nothing to optimize.
function prepare(team, gameStates, injuries) {
  const s = team?.settings || {};
  const slots = s.slots;
  if (!slots?.length || s.bestBall || s.isBye) return null;
  const known = gameStates && Object.keys(gameStates).length > 0;
  const locked = (p) => known && p.team && gameStates[p.team] && gameStates[p.team].state !== "pre";
  const outs = outNames(injuries);
  // An Out player scores 0 everywhere (the rows show 0.0), whatever the model's pregame projection says.
  const roster = (team.players || []).map((p0) => {
    const unavailable = outs.has(p0.name);
    const p = unavailable ? { ...p0, myProjPts: 0, myFloor: 0, myCeiling: 0, myLean: null } : p0;
    return { ...p, val: num(p.myProjPts), locked: Boolean(locked(p)), unavailable };
  });
  const byIndex = new Map();
  for (const p of roster) if (p.isStarter && p.slotIndex < slots.length) byIndex.set(p.slotIndex, p);
  // Slots we can move people in and out of: a kind we project, whose current starter isn't locked.
  const open = [];
  slots.forEach((kind, i) => {
    if (!ELIGIBLE[kind] || !ELIGIBLE[kind].some((pos) => PROJECTED.has(pos))) return;
    const cur = byIndex.get(i);
    if (cur?.locked) return;
    open.push({ i, kind, cur: cur || null });
  });
  const bench = roster.filter((p) => !p.isStarter && PROJECTED.has(p.position) && p.val != null && !p.locked && !p.unavailable);
  return { slots, roster, open, bench };
}

// Median fallback: simple one-for-one swaps, best first, only when they GAIN median points (nobody used twice; legal for the slot).
export function optimizeLineup(team, gameStates, injuries = []) {
  const prep = prepare(team, gameStates, injuries);
  if (!prep) return null;
  const { slots, open, bench } = prep;
  const val = (p) => (p && p.val != null ? p.val : 0);
  const current = open.reduce((t, o) => t + val(o.cur), 0);
  const swaps = [];
  const done = new Set(); // anyone already swapped in or out
  for (;;) {
    let best = null;
    for (const o of open) {
      if (o.cur && done.has(o.cur.player_id)) continue;
      for (const b of bench) {
        if (done.has(b.player_id) || !ELIGIBLE[o.kind].includes(b.position)) continue;
        const gain = val(b) - val(o.cur);
        if (gain >= MIN_GAIN && (!best || gain > best.gain)) best = { o, b, gain };
      }
    }
    if (!best) break;
    done.add(best.b.player_id);
    if (best.o.cur) done.add(best.o.cur.player_id);
    swaps.push({ slot: best.o.kind, in: best.b, out: best.o.cur, gain: r1(best.gain) });
  }
  const gain = swaps.reduce((t, x) => t + x.gain, 0);
  return { basis: "median", current: r1(current), best: r1(current + gain), gain: r1(gain), swaps, optimizedSlots: open.length, lockedStarters: slots.length - open.length };
}

// A player's range as the win-chance model reads it: Out = nothing; a Smash / Tough Spot shifts the whole range by its published points effect.
function simEntry(p, slot) {
  const lean = p.myLean ? num(p.myLean.effect) || 0 : 0;
  const shift = (v) => (v == null ? null : Math.max(0, v + lean));
  return {
    id: p.player_id, slot, name: p.name, pos: p.position, team: p.team,
    proj: shift(num(p.myProjPts)), floor: shift(num(p.myFloor)), ceiling: shift(num(p.myCeiling)),
    pts: null, ...(p.unavailable ? { out: true } : {}),
  };
}

// Why a swap: one plain sentence from the published numbers and the matchup's state.
function whyFor(inn, out, win) {
  if (!out) return "Fills an empty slot";
  if (out.unavailable) return `${out.name} is listed Out`;
  const f = (p) => num(p.myFloor);
  const c = (p) => num(p.myCeiling);
  const lean = inn.myLean?.call === "SMASH" ? " · Smash Spot" : out.myLean?.call === "AVOID" ? " · avoids a Tough Spot" : "";
  if (win != null && win <= 0.4 && c(inn) != null && c(out) != null && c(inn) - c(out) >= 1) return `Higher ceiling (${fmt1(c(inn))} vs ${fmt1(c(out))}), which an underdog needs${lean}`;
  if (win != null && win >= 0.75 && f(inn) != null && f(out) != null && f(inn) - f(out) >= 1) return `Higher floor (${fmt1(f(inn))} vs ${fmt1(f(out))}), which protects a favorite${lean}`;
  if (inn.myProjPts - out.myProjPts >= 0.5) return `Higher median (${fmt1(inn.myProjPts)} vs ${fmt1(out.myProjPts)})${lean}`;
  if (f(inn) != null && f(out) != null && c(inn) != null && c(out) != null && f(inn) >= f(out) && c(inn) >= c(out)) return `Higher floor and ceiling${lean}`;
  return `Better odds against this week's opponent${lean}`;
}

// The win-chance version: the same greedy one-for-one swaps, each judged by its effect on P(win), best first. Needs the saved matchup
// (settings.h2h, both lineups with their ranges and live points); null when it isn't there or doesn't line up with the roster.
function winAdvice(team, gameStates, injuries, prep) {
  const h2h = team.settings?.h2h;
  const { slots, roster, open, bench } = prep;
  if (!h2h?.mine || h2h.mine.length !== slots.length || !h2h.opp?.length) return null;
  const byId = new Map(roster.map((p) => [p.player_id, p]));
  for (const o of open) if (o.cur && h2h.mine[o.i]?.id !== o.cur.player_id) return null; // a stale matchup snapshot
  const entries = h2h.mine.map((e, i) => {
    const p = e?.id ? byId.get(e.id) : null;
    if (!p) return e || { id: null, slot: slots[i] };
    if (p.unavailable) return { ...e, proj: 0, floor: 0, ceiling: 0, out: true };
    const lean = !e.est && p.myLean ? num(p.myLean.effect) || 0 : 0;
    const shift = (v) => (typeof v === "number" ? Math.max(0, v + lean) : v);
    return { ...e, proj: shift(e.proj), floor: shift(e.floor), ceiling: shift(e.ceiling) };
  });
  const mine = summarizeSide(entries, gameStates);
  const sim = lineupSwapSim(mine, summarizeSide(h2h.opp, gameStates));
  const now = sim.now();
  const asPlayer = (p, slot) => {
    const e = simEntry(p, slot);
    return { ...e, outlook: playerOutlook(e, gameStates) };
  };
  const chance = num(team.settings?.winChance);
  const swaps = [];
  const done = new Set();
  for (;;) {
    let best = null;
    for (const o of open) {
      if (o.cur && done.has(o.cur.player_id)) continue;
      const outP = o.cur ? mine.players[o.i] : null;
      for (const b of bench) {
        if (done.has(b.player_id) || !ELIGIBLE[o.kind].includes(b.position)) continue;
        const gain = sim.winWith(outP, asPlayer(b, o.kind)) - sim.now();
        if (gain >= MIN_WIN_GAIN && (!best || gain > best.gain)) best = { o, b, outP, gain };
      }
    }
    if (!best) break;
    sim.apply(best.outP, asPlayer(best.b, best.o.kind));
    done.add(best.b.player_id);
    if (best.o.cur) done.add(best.o.cur.player_id);
    swaps.push({ slot: best.o.kind, in: best.b, out: best.o.cur, gain: r1(best.gain * 100), why: whyFor(best.b, best.o.cur, chance) });
  }
  const gain = swaps.reduce((t, x) => t + x.gain, 0);
  return { basis: "win", now, best: sim.now(), gain: r1(gain), swaps, optimizedSlots: open.length, lockedStarters: slots.length - open.length };
}

// The advice for a league: swaps by win chance when this week's matchup is there (gains are points of win chance), else by median
// (gains are points). `chance` is the saved win chance (the card's number) for the underdog / favorite wording.
export function lineupAdvice(team, gameStates, injuries = []) {
  const prep = prepare(team, gameStates, injuries);
  if (!prep) return null;
  const win = winAdvice(team, gameStates, injuries, prep);
  return { ...(win || optimizeLineup(team, gameStates, injuries)), chance: num(team.settings?.winChance) };
}

// What needs fixing in the current lineup, most urgent first: an empty slot, a starter on a bye, one the model projects out / inactive,
// or one carrying an injury tag (injuries: [{ name, status, severity }] from the injury feed). Each gets the best bench player who
// can fill that slot, when there is one. Starters whose game has started are left out (nothing to fix).
export function lineupAlerts(team, gameStates, injuries = []) {
  const s = team?.settings || {};
  const slots = s.slots;
  if (!slots?.length || s.bestBall || s.isBye) return [];
  const known = gameStates && Object.keys(gameStates).length > 0;
  const started = (p) => known && p.team && gameStates[p.team] && gameStates[p.team].state !== "pre";
  const tags = new Map();
  for (const i of injuries || []) if (!tags.has(i.name) || i.severity > tags.get(i.name).severity) tags.set(i.name, i);
  const starters = new Map();
  for (const p of team.players || []) if (p.isStarter && p.slotIndex < slots.length) starters.set(p.slotIndex, p);
  const outs = outNames(injuries);
  const bench = (team.players || []).filter((p) => !p.isStarter && PROJECTED.has(p.position) && num(p.myProjPts) > 0 && !started(p) && !outs.has(p.name));
  const used = new Set();
  const replacementFor = (kind) => {
    const pick = bench.filter((p) => !used.has(p.player_id) && ELIGIBLE[kind]?.includes(p.position)).sort((a, b) => b.myProjPts - a.myProjPts)[0];
    if (pick) used.add(pick.player_id);
    return pick || null;
  };
  const out = [];
  slots.forEach((kind, i) => {
    const cur = starters.get(i);
    const h = s.h2h?.mine?.[i];
    if (!cur) {
      if (!(h && h.id)) out.push({ type: "empty", severity: 3, slot: kind, player: null, status: "Empty slot", replacement: replacementFor(kind) });
      return;
    }
    if (started(cur)) return;
    const tag = tags.get(cur.name);
    if (known && cur.team && !gameStates[cur.team] && cur.position !== "DEF") out.push({ type: "bye", severity: 3, slot: kind, player: cur, status: "Bye week", replacement: replacementFor(kind) });
    else if (h?.out || (tag && tag.severity >= 3)) out.push({ type: "out", severity: 3, slot: kind, player: cur, status: tag?.status || "Out", replacement: replacementFor(kind) });
    else if (tag && tag.severity > 0) out.push({ type: "injury", severity: tag.severity, slot: kind, player: cur, status: tag.status, replacement: replacementFor(kind) });
  });
  return out.sort((a, b) => b.severity - a.severity);
}

// THE lineup-alert number, used everywhere a count is shown (the Lineup tab's badge, the Game Board header, the league cards, the dashboard):
// the urgent alerts (empty slot, bye, out, injury tag) plus the start / sit swaps. One function so the screens can never disagree.
// `advice` (the full lineupAdvice result, or null) rides along so a caller that needs the swaps too (the Lineup tab, the Companion) reuses it.
export function lineupAlertCount(team, gameStates, injuries = []) {
  const alerts = lineupAlerts(team, gameStates, injuries);
  const advice = lineupAdvice(team, gameStates, injuries);
  const swaps = advice?.swaps || [];
  return { alerts, swaps, advice, total: alerts.length + swaps.length };
}

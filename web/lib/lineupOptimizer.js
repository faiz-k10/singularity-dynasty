// Start / sit for one saved league (app/my-team/LineupAdvice.js, the Companion's "Lineup upgrade" cards): who to start over whom.
// Pure; tested in test/lineupOptimizer.test.mjs.
//
// THE DECISION uses only what held up in a backtest (model/backtest_start_sit_rules.py: 2026 weeks 1-6 as published, ~43,000 same-position
// pairs, "which rule picks the player who actually scored more"):
//   - the weekly median (projection) -- the baseline;
//   - plus his Smash Spot / Tough Spot, the FULL points-per-game effect the rankings page quotes for it (saved as myLean = { call, effect }).
//     Among close calls (medians within 4 points) with a flagged player, picking by median alone was right 57.2% of the time, adding
//     0.5x the effect 63.5%, the full effect 65.5%, 1.5x 65.2%; flagged Smash players beat their median by +2.5 on average (quoted effect
//     +2.4), Tough players fell short by -2.3 (quoted -2.2), unflagged players by 0.0.
// NOT used: the floor and the ceiling. As tie-breakers or blended in (30/40/30, ceiling alone, mean of floor and ceiling) they picked the
// higher scorer LESS often than the median in close calls (ceiling alone 48.1% vs 54.4%, 30/40/30 50.2%), and the ranges aren't equally
// reliable: the widest-range quartile beat its ceiling 4.5% of the time (the narrowest 16.1%), and players whose ceiling is over 3x their
// median beat it 3.8%. Likewise no win-chance simulation decides anything: that idea has NOT been backtested. A swap's gain is in points of
// median + matchup trend; the floor and ceiling are shown for context only.
//
// What it will NOT touch: a player whose game has started (Sleeper locks him) stays where he is and can't be moved in or out;
// slots our model has no projection for (K, DEF, IDP) and players with no projection keep whoever is there now. A player the injury
// feed lists Doubtful or worse is never a start (and a starter like that scores 0).
import { ELIGIBLE } from "./lineupSlots.js";
import { num, round1 as r1, fmt1 } from "./format.js";
import { startValue } from "./startSit.js";

// "SUPER_FLEX" -> "SUPERFLEX": how a slot is named on screen (the one place that maps it).
export const slotLabel = (slot) => (slot === "SUPER_FLEX" ? "SUPERFLEX" : slot);

const PROJECTED = new Set(["QB", "RB", "WR", "TE"]);

const MIN_GAIN = 0.1;
// A player the injury feed lists Doubtful or worse (severity 3+): he is not a lineup option, and a starter like that is worth 0 in the lineup.
const OUT_SEVERITY = 3;
const outNames = (injuries) => new Set((injuries || []).filter((i) => i.severity >= OUT_SEVERITY).map((i) => i.name));

// What a player is worth for start / sit: his median plus the full points effect of a Smash / Tough Spot (see the header for the evidence).
const value = (p) => startValue(num(p.myProjPts), num(p.myLean?.effect));

// Roster with locks, Out players zeroed, the slots that can change and the bench players who can move in. null when there is nothing to optimize.
function prepare(team, gameStates, injuries) {
  const s = team?.settings || {};
  const slots = s.slots;
  if (!slots?.length || s.isBye) return null;
  const known = gameStates && Object.keys(gameStates).length > 0;
  const locked = (p) => known && p.team && gameStates[p.team] && gameStates[p.team].state !== "pre";
  const outs = outNames(injuries);
  // An Out player scores 0 everywhere (the rows show 0.0), whatever the model's pregame projection says.
  const roster = (team.players || []).map((p0) => {
    const unavailable = outs.has(p0.name);
    const p = unavailable ? { ...p0, myProjPts: 0, myFloor: 0, myCeiling: 0, myLean: null } : p0;
    return { ...p, val: value(p), locked: Boolean(locked(p)), unavailable };
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

// Simple one-for-one swaps, best first, only when they GAIN median points (nobody used twice; legal for the slot).
export function optimizeLineup(team, gameStates, injuries = []) {
  const prep = prepare(team, gameStates, injuries);
  if (!prep) return null;
  const { slots, open, bench } = prep;
  const val = (p) => (p && p.val != null ? p.val : 0);
  const current = open.reduce((t, o) => t + val(o.cur), 0);
  const swaps = [];
  const done = new Set(); // anyone already swapped in or out
  const filled = new Set(); // slots already given a recommendation (an EMPTY slot has no starter to mark as done, so it must be tracked itself)
  for (;;) {
    let best = null;
    for (const o of open) {
      if (filled.has(o.i) || (o.cur && done.has(o.cur.player_id))) continue;
      for (const b of bench) {
        if (done.has(b.player_id) || !ELIGIBLE[o.kind].includes(b.position)) continue;
        const gain = val(b) - val(o.cur);
        if (gain >= MIN_GAIN && (!best || gain > best.gain)) best = { o, b, gain };
      }
    }
    if (!best) break;
    done.add(best.b.player_id);
    filled.add(best.o.i);
    if (best.o.cur) done.add(best.o.cur.player_id);
    swaps.push({ slot: best.o.kind, in: best.b, out: best.o.cur, gain: r1(best.gain) });
  }
  const gain = swaps.reduce((t, x) => t + x.gain, 0);
  return { current: r1(current), best: r1(current + gain), gain: r1(gain), swaps, optimizedSlots: open.length, lockedStarters: slots.length - open.length };
}

// What besides the medians moved a swap, in the numbers the site publishes: a Smash / Tough Spot on either side, or that the starter is listed Out
// ("" otherwise -- an empty slot needs no caption).
const leanText = (p) => (p.myLean ? `${p.myLean.call === "SMASH" ? "Smash" : "Tough"} Spot ${p.myLean.effect > 0 ? "+" : "−"}${fmt1(Math.abs(p.myLean.effect))}` : null);
function whyFor(inn, out) {
  if (!out) return "";
  if (out.unavailable) return `${out.name} is listed Out`;
  return [inn.myLean && `${leanText(inn)} for him`, out.myLean && `${leanText(out)} for ${out.name}`].filter(Boolean).join(" · ");
}

// The advice for a league: the same greedy one-for-one swaps, valued by median + matchup trend.
export function lineupAdvice(team, gameStates, injuries = []) {
  const r = optimizeLineup(team, gameStates, injuries);
  return r && { ...r, swaps: r.swaps.map((x) => ({ ...x, why: whyFor(x.in, x.out) })) };
}

// What needs fixing in the current lineup, most urgent first: an empty slot, a starter on a bye, one the model projects out / inactive,
// or one carrying an injury tag (injuries: [{ name, status, severity }] from the injury feed). Each gets the best bench player who
// can fill that slot, when there is one. Starters whose game has started are left out (nothing to fix).
export function lineupAlerts(team, gameStates, injuries = []) {
  const s = team?.settings || {};
  const slots = s.slots;
  if (!slots?.length || s.isBye) return [];
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

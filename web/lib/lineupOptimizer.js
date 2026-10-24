// Lineup optimizer for one saved league (app/my-team/LineupAdvice.js, the Companion's "Lineup upgrade" cards): who to start over whom
// by this week's projection, and -- when the win chance says the matchup is
// lopsided -- a variation that plays for the ceiling (underdog) or the floor (heavy favorite). Pure, no imports of its own;
// tested in test/lineupOptimizer.test.mjs.
//
// What it will NOT touch: a player whose game has started (Sleeper locks him) stays where he is and can't be moved in or out;
// slots our model has no projection for (K, DEF, IDP) and players with no projection keep whoever is there now.
import { ELIGIBLE } from "./bestBall.js";
import { num, round1 as r1 } from "./format.js";

// "SUPER_FLEX" -> "SUPERFLEX": how a slot is named on screen (the one place that maps it).
export const slotLabel = (slot) => (slot === "SUPER_FLEX" ? "SUPERFLEX" : slot);

const PROJECTED = new Set(["QB", "RB", "WR", "TE"]);

// How a player counts for start / sit. Uses everything the site publishes about his week, not just the median:
//   proj    expected points = Swanson's rule over his weekly range, 30% floor (10th pct) + 40% median + 30% ceiling (90th pct) -- the standard
//           three-point estimate of a mean, so a player with a long upside tail is worth more than his median and a boom-or-bust one isn't
//           oversold; plus the matchup nudge below.
//   ceiling / floor   the 90th / 10th percentile alone (the underdog / favorite versions), plus the same matchup nudge.
// Matchup nudge: when the opponent is a Smash Spot or Tough Spot for his position (lib/defenseLeans.js, saved as p.myLean = { call, effect }
// where effect is points a game against an average defense), add MATCHUP_WEIGHT of that effect, capped. The leans are ridge-shrunk trends
// (defense terms improve prediction only 0.2-1.7%), so they are a nudge and never beat a clear gap in the player's own numbers; a judgement
// call, not backtested. A missing floor / ceiling (old snapshots) falls back to the median, a missing lean to no nudge.
export const SWANSON = { floor: 0.3, median: 0.4, ceiling: 0.3 };
export const MATCHUP_WEIGHT = 0.5;
export const MATCHUP_CAP = 2;
export const matchupNudge = (p) => {
  const e = num(p.myLean?.effect);
  return e == null ? 0 : Math.max(-MATCHUP_CAP, Math.min(MATCHUP_CAP, e * MATCHUP_WEIGHT));
};
export const startValue = (p, mode = "proj") => {
  const proj = num(p.myProjPts);
  if (proj == null) return null;
  const floor = num(p.myFloor);
  const ceil = num(p.myCeiling);
  let base = proj;
  if (mode === "ceiling") base = ceil ?? proj;
  else if (mode === "floor") base = floor ?? proj;
  else if (floor != null && ceil != null) base = SWANSON.floor * floor + SWANSON.median * proj + SWANSON.ceiling * ceil;
  return base + matchupNudge(p);
};
const valueOf = startValue;

// Simple one-for-one swaps, best first: start a bench player in place of a starter whose slot he is eligible for, only when it GAINS points
// (by the measure in use). After each swap the bench player is a starter and the benched one is done -- nobody is used twice -- and the
// next best swap is taken from what is left. Every recommendation is legal for its slot and positive, which is the point: the earlier
// "best possible lineup" version reshuffled whole chains (a QB to SUPERFLEX, a TE up from FLEX ...), and a single row of a chain can lose
// points even though the chain gains, which read as nonsense. This can miss a gain that only a chain finds; it never recommends a loss.
// team: saved_teams row (players[] with position, team, slot, slotIndex, isStarter, myProjPts / myFloor / myCeiling, and settings.slots).
// gameStates: team -> { state }. Returns null when there is nothing to optimize.
const MIN_GAIN = 0.1;
// A player the injury feed lists Doubtful or worse (severity 3+): he is not a lineup option, and a starter like that is worth 0 in the lineup.
const OUT_SEVERITY = 3;
const outNames = (injuries) => new Set((injuries || []).filter((i) => i.severity >= OUT_SEVERITY).map((i) => i.name));
// injuries: [{ name, status, severity }] from the injury feed (optional).
export function optimizeLineup(team, gameStates, mode = "proj", injuries = []) {
  const s = team?.settings || {};
  const slots = s.slots;
  if (!slots?.length || s.bestBall || s.isBye) return null;
  const known = gameStates && Object.keys(gameStates).length > 0;
  const locked = (p) => known && p.team && gameStates[p.team] && gameStates[p.team].state !== "pre";

  const outs = outNames(injuries);
  // An Out player scores 0 everywhere (the rows show 0.0, the gains add up), whatever the model's pregame projection says.
  const roster = (team.players || []).map((p0) => {
    const unavailable = outs.has(p0.name);
    const p = unavailable ? { ...p0, myProjPts: 0, myFloor: 0, myCeiling: 0, myLean: null } : p0;
    return { ...p, val: valueOf(p, mode), locked: Boolean(locked(p)), unavailable };
  });
  const byIndex = new Map();
  for (const p of roster) if (p.isStarter && p.slotIndex < slots.length) byIndex.set(p.slotIndex, p);
  const val = (p) => (p && p.val != null ? p.val : 0);

  // Slots we can move people in and out of: a kind we project, whose current starter isn't locked.
  const open = [];
  slots.forEach((kind, i) => {
    if (!ELIGIBLE[kind] || !ELIGIBLE[kind].some((pos) => PROJECTED.has(pos))) return;
    const cur = byIndex.get(i);
    if (cur?.locked) return;
    open.push({ i, kind, cur: cur || null });
  });
  const bench = roster.filter((p) => !p.isStarter && PROJECTED.has(p.position) && p.val != null && !p.locked && !p.unavailable);
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
  return { mode, current: r1(current), best: r1(current + gain), gain: r1(gain), swaps, optimizedSlots: open.length, lockedStarters: slots.length - open.length };
}

// The advice for a league: the best lineup by projection, plus the risk-tilted version when the win chance is lopsided and the tilt
// buys a real gain for a small cost to the median (underdog: ceiling; heavy favorite: floor).
export function lineupAdvice(team, gameStates, injuries = []) {
  const base = optimizeLineup(team, gameStates, "proj", injuries);
  if (!base) return null;
  const win = num(team.settings?.winChance);
  let tilt = null;
  const mode = win == null ? null : win <= 0.4 ? "ceiling" : win >= 0.75 ? "floor" : null;
  if (mode) {
    const alt = optimizeLineup(team, gameStates, mode, injuries);
    if (alt && alt.swaps.length) {
      // What the tilted lineup scores on the median, and what it gains on the tilted measure over the projection-best lineup.
      const medianCost = r1(alt.swaps.reduce((t, x) => t + (startValue(x.in) ?? 0) - (startValue(x.out || {}) ?? 0), 0));
      const tiltGain = alt.gain;
      if (tiltGain >= 2 && medianCost >= -4) tilt = { mode, win, ...alt, medianChange: medianCost };
    }
  }
  return { ...base, tilt };
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
    const pick = bench.filter((p) => !used.has(p.player_id) && ELIGIBLE[kind]?.includes(p.position)).sort((a, b) => startValue(b) - startValue(a))[0];
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
// `advice` (the full lineupAdvice result, or null) rides along so a caller that needs the swaps and the tilt too (the Lineup tab, the Companion) reuses it.
export function lineupAlertCount(team, gameStates, injuries = []) {
  const alerts = lineupAlerts(team, gameStates, injuries);
  const advice = lineupAdvice(team, gameStates, injuries);
  const swaps = advice?.swaps || [];
  return { alerts, swaps, advice, total: alerts.length + swaps.length };
}

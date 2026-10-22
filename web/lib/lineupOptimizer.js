// Lineup optimizer for one saved league (app/my-team/LineupAdvice.js, the Companion's "Lineup upgrade" cards): the best
// set of starters from the roster by this week's projection, who to swap, and -- when the win chance says the matchup is
// lopsided -- a variation that plays for the ceiling (underdog) or the floor (heavy favorite). Pure, no imports of its own;
// tested in test/lineupOptimizer.test.mjs.
//
// What it will NOT touch: a player whose game has started (Sleeper locks him) stays where he is and can't be moved in or out;
// slots our model has no projection for (K, DEF, IDP) and players with no projection keep whoever is there now.
import { ELIGIBLE, FILL_ORDER } from "./bestBall.js";

const PROJECTED = new Set(["QB", "RB", "WR", "TE"]);
const r1 = (v) => Math.round(v * 10) / 10;
const num = (v) => (typeof v === "number" && Number.isFinite(v) ? v : null);

// How a player counts in each mode; a missing floor / ceiling falls back to the median so old snapshots still work.
const valueOf = (p, mode) => {
  const proj = num(p.myProjPts);
  if (proj == null) return null;
  if (mode === "ceiling") return num(p.myCeiling) ?? proj;
  if (mode === "floor") return num(p.myFloor) ?? proj;
  return proj;
};

// team: saved_teams row (players[] with position, team, slot, slotIndex, isStarter, myProjPts / myFloor / myCeiling, and
// settings.slots). gameStates: team -> { state }. Returns null when there is nothing to optimize.
export function optimizeLineup(team, gameStates, mode = "proj") {
  const s = team?.settings || {};
  const slots = s.slots;
  if (!slots?.length || s.bestBall || s.isBye) return null;
  const known = gameStates && Object.keys(gameStates).length > 0;
  const locked = (p) => known && p.team && gameStates[p.team] && gameStates[p.team].state !== "pre";

  const roster = (team.players || []).map((p) => ({ ...p, val: valueOf(p, mode), locked: Boolean(locked(p)) }));
  const byIndex = new Map();
  for (const p of roster) if (p.isStarter && p.slotIndex < slots.length) byIndex.set(p.slotIndex, p);

  // Slots we can move people in and out of: a kind we project, whose current starter isn't locked.
  const open = [];
  slots.forEach((kind, i) => {
    const cur = byIndex.get(i);
    if (!ELIGIBLE[kind] || !ELIGIBLE[kind].some((pos) => PROJECTED.has(pos))) return;
    if (cur?.locked) return;
    open.push({ i, kind, cur });
  });
  const pool = roster.filter((p) => PROJECTED.has(p.position) && p.val != null && !p.locked);
  // Players who stay put are never re-offered: locked starters hold their slots, so they aren't in the pool at all.

  const used = new Set();
  const chosen = new Map(); // slot index -> player
  for (const kind of FILL_ORDER) {
    for (const slot of open.filter((o) => o.kind === kind)) {
      const best = pool
        .filter((p) => !used.has(p.player_id) && ELIGIBLE[kind].includes(p.position))
        // best value first; on a tie the player already starting there keeps the slot, then any current starter keeps priority over the bench
        .sort((a, b) => b.val - a.val || Number(b === slot.cur) - Number(a === slot.cur) || Number(b.isStarter) - Number(a.isStarter))[0];
      if (best) {
        used.add(best.player_id);
        chosen.set(slot.i, best);
      }
    }
  }

  const val = (p) => (p && p.val != null ? p.val : 0);
  let current = 0;
  let best = 0;
  const startingNow = new Set();
  const picked = new Set();
  const moves = []; // a player who keeps a starting spot but changes slot
  for (const o of open) {
    const pick = chosen.get(o.i) || o.cur || null;
    current += val(o.cur);
    best += val(pick);
    if (o.cur) startingNow.add(o.cur.player_id);
    if (pick) {
      picked.add(pick.player_id);
      if (o.cur && pick.player_id !== o.cur.player_id && startingNow.has(pick.player_id)) moves.push({ player: pick, to: o.kind });
    }
  }
  // As people would say it: who comes in from the bench, who goes out, paired best-in with worst-out.
  const ins = open.map((o) => chosen.get(o.i) || o.cur).filter((p) => p && !startingNow.has(p.player_id)).sort((a, b) => val(b) - val(a));
  const outs = open.map((o) => o.cur).filter((p) => p && !picked.has(p.player_id)).sort((a, b) => val(a) - val(b));
  const swaps = ins.map((inn, i) => ({ in: inn, out: outs[i] || null, gain: r1(val(inn) - val(outs[i]))}));
  return {
    mode,
    current: r1(current),
    best: r1(best),
    gain: r1(best - current),
    swaps,
    // A player shuffled between two slots of the same kind (FLEX to FLEX) isn't a move anyone has to make.
    moves: moves.map((m) => ({ player: m.player, to: m.to, from: byIndexSlot(slots, byIndex, m.player) })).filter((m) => m.from !== m.to),
    optimizedSlots: open.length,
    lockedStarters: slots.length - open.length,
  };
}

const byIndexSlot = (slots, byIndex, player) => {
  for (const [i, p] of byIndex) if (p.player_id === player.player_id) return slots[i];
  return null;
};

// The advice for a league: the best lineup by projection, plus the risk-tilted version when the win chance is lopsided and the tilt
// buys a real gain for a small cost to the median (underdog: ceiling; heavy favorite: floor).
export function lineupAdvice(team, gameStates) {
  const base = optimizeLineup(team, gameStates, "proj");
  if (!base) return null;
  const win = num(team.settings?.winChance);
  let tilt = null;
  const mode = win == null ? null : win <= 0.4 ? "ceiling" : win >= 0.75 ? "floor" : null;
  if (mode) {
    const alt = optimizeLineup(team, gameStates, mode);
    if (alt && alt.swaps.length) {
      // What the tilted lineup scores on the median, and what it gains on the tilted measure over the projection-best lineup.
      const medianCost = r1(alt.swaps.reduce((t, x) => t + (num(x.in.myProjPts) ?? 0) - (num(x.out?.myProjPts) ?? 0), 0));
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
  const bench = (team.players || []).filter((p) => !p.isStarter && PROJECTED.has(p.position) && num(p.myProjPts) > 0 && !started(p));
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

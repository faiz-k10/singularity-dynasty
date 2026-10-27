import { test } from "node:test";
import assert from "node:assert/strict";
import { optimizeLineup, lineupAdvice, lineupAlerts, lineupAlertCount } from "../lib/lineupOptimizer.js";

const P = (id, name, position, team, proj, extra = {}) => ({ player_id: id, name, position, team, myProjPts: proj, isStarter: false, slotIndex: 999, ...extra });
const team = (players, slots = ["QB", "RB", "WR", "FLEX"], settings = {}) => ({ settings: { slots, ...settings }, players });

test("swaps a bench player who projects higher into a slot he can play", () => {
  const t = team([
    P("1", "Qb", "QB", "A", 18, { isStarter: true, slotIndex: 0 }),
    P("2", "Rb", "RB", "B", 12, { isStarter: true, slotIndex: 1 }),
    P("3", "Wr", "WR", "C", 11, { isStarter: true, slotIndex: 2 }),
    P("4", "Flex", "WR", "D", 6, { isStarter: true, slotIndex: 3 }),
    P("5", "BenchRb", "RB", "E", 14),
  ]);
  const r = optimizeLineup(t, {});
  assert.equal(r.gain, 8);
  assert.deepEqual(r.swaps.map((x) => [x.slot, x.in.name, x.out.name, x.gain]), [["FLEX", "BenchRb", "Flex", 8]]);
  assert.equal(r.best, r.current + 8);
});

test("already optimal: no swaps; ties keep the current starter", () => {
  const t = team([
    P("1", "Qb", "QB", "A", 18, { isStarter: true, slotIndex: 0 }),
    P("2", "Rb", "RB", "B", 12, { isStarter: true, slotIndex: 1 }),
    P("3", "Wr", "WR", "C", 11, { isStarter: true, slotIndex: 2 }),
    P("4", "Flex", "WR", "D", 9, { isStarter: true, slotIndex: 3 }),
    P("5", "Bench", "WR", "E", 9),
  ]);
  const r = optimizeLineup(t, {});
  assert.equal(r.gain, 0);
  assert.equal(r.swaps.length, 0);
});

test("a player whose game started is locked: he can't be benched or started", () => {
  const t = team([
    P("1", "Qb", "QB", "A", 18, { isStarter: true, slotIndex: 0 }),
    P("2", "Rb", "RB", "B", 12, { isStarter: true, slotIndex: 1 }),
    P("3", "Wr", "WR", "C", 11, { isStarter: true, slotIndex: 2 }),
    P("4", "LockedFlex", "WR", "D", 3, { isStarter: true, slotIndex: 3 }),
    P("5", "LockedBench", "RB", "E", 20),
    P("6", "OpenBench", "TE", "F", 7),
  ]);
  const r = optimizeLineup(t, { D: { state: "in" }, E: { state: "post" }, F: { state: "pre" } });
  assert.equal(r.swaps.length, 0, "the only open slots have nobody better who can still move");
  assert.equal(r.lockedStarters, 1);
});

test("SUPER_FLEX / FLEX are filled after the fixed slots", () => {
  const t = team(
    [
      P("1", "Qb1", "QB", "A", 20, { isStarter: true, slotIndex: 0 }),
      P("2", "Qb2", "QB", "B", 17),
      P("3", "Rb", "RB", "C", 10, { isStarter: true, slotIndex: 1 }),
      P("4", "Junk", "WR", "D", 2, { isStarter: true, slotIndex: 2 }),
    ],
    ["QB", "RB", "SUPER_FLEX"]
  );
  const r = optimizeLineup(t, {});
  assert.equal(r.swaps[0].slot, "SUPER_FLEX");
  assert.equal(r.swaps[0].in.name, "Qb2");
  assert.equal(r.swaps[0].out.name, "Junk");
});

test("byes and teams without slots return null", () => {
  assert.equal(optimizeLineup(team([], ["QB"], { isBye: true }), {}), null);
  assert.equal(optimizeLineup({ settings: {}, players: [] }, {}), null);
});

test("two FLEX slots: the bench player replaces the weaker one, nothing else is reported", () => {
  const t = team(
    [
      P("1", "A", "WR", "A", 9, { isStarter: true, slotIndex: 0 }),
      P("2", "B", "WR", "B", 12, { isStarter: true, slotIndex: 1 }),
      P("3", "Bench", "WR", "C", 15),
    ],
    ["FLEX", "FLEX"]
  );
  const r = optimizeLineup(t, {});
  assert.deepEqual(r.swaps.map((x) => [x.in.name, x.out.name, x.gain]), [["Bench", "A", 6]]);
});

test("lineup alerts: empty slot, bye, out and injury tags, each with the best bench fill; started games skipped", () => {
  const t = team(
    [
      P("1", "Hurt", "RB", "A", 12, { isStarter: true, slotIndex: 0 }),
      P("2", "OnBye", "WR", "BYE", 10, { isStarter: true, slotIndex: 1 }),
      P("3", "Played", "WR", "C", 8, { isStarter: true, slotIndex: 2 }),
      P("4", "BenchRb", "RB", "D", 7),
      P("5", "BenchWr", "WR", "E", 9),
    ],
    ["RB", "WR", "WR", "TE"]
  );
  const gs = { A: { state: "pre" }, C: { state: "post" }, D: { state: "pre" }, E: { state: "pre" } };
  const a = lineupAlerts(t, gs, [{ name: "Hurt", status: "Questionable", severity: 1 }, { name: "Played", status: "Out", severity: 3 }]);
  assert.deepEqual(a.map((x) => x.type).sort(), ["bye", "empty", "injury"]);
  assert.equal(a.find((x) => x.type === "injury").replacement.name, "BenchRb");
  assert.equal(a.find((x) => x.type === "bye").replacement.name, "BenchWr");
  assert.equal(a.find((x) => x.type === "empty").slot, "TE");
  assert.equal(lineupAlerts(team([], ["QB"], { isBye: true }), {}, []).length, 0);
});

test("every swap is legal for its slot and a gain; Rodgers can't take a plain FLEX and nobody is swapped for a loss", () => {
  const t = team(
    [
      P("1", "Geno", "QB", "A", 14.6, { isStarter: true, slotIndex: 0 }),
      P("2", "Back", "RB", "B", 9, { isStarter: true, slotIndex: 1 }),
      P("3", "Kelce", "TE", "C", 11, { isStarter: true, slotIndex: 2 }),
      P("4", "Wide", "WR", "D", 10, { isStarter: true, slotIndex: 3 }),
      P("5", "Rodgers", "QB", "E", 16.9),
      P("6", "Saquon", "RB", "F", 12.9),
    ],
    ["QB", "RB", "FLEX", "SUPER_FLEX"]
  );
  const r = optimizeLineup(t, {});
  const ELIGIBLE = { QB: ["QB"], RB: ["RB"], FLEX: ["RB", "WR", "TE"], SUPER_FLEX: ["QB", "RB", "WR", "TE"] };
  assert.ok(r.swaps.length > 0);
  for (const x of r.swaps) {
    assert.ok(ELIGIBLE[x.slot].includes(x.in.position), `${x.in.name} can't play ${x.slot}`);
    assert.ok(x.gain > 0, "never a negative recommendation");
  }
  assert.ok(Math.abs(r.swaps.reduce((a, x) => a + x.gain, 0) - r.gain) < 0.11);
  const used = r.swaps.flatMap((x) => [x.in.player_id, x.out?.player_id]).filter(Boolean);
  assert.equal(new Set(used).size, used.length, "nobody is used twice");
});

test("an already-better starter is never swapped out (a starter at 18.3 stays over a bench 16.9)", () => {
  const t = team(
    [
      P("1", "Love", "QB", "A", 18.3, { isStarter: true, slotIndex: 1 }),
      P("2", "Weak", "QB", "B", 5, { isStarter: true, slotIndex: 0 }),
      P("3", "Rodgers", "QB", "C", 16.9),
    ],
    ["QB", "SUPER_FLEX"]
  );
  const r = optimizeLineup(t, {});
  assert.deepEqual(r.swaps.map((x) => [x.slot, x.in.name, x.out.name, x.gain]), [["QB", "Rodgers", "Weak", 11.9]]);
});

test("lineupAlertCount is the one number: urgent alerts + start / sit swaps (3 injury tags + 2 swaps = 5)", () => {
  const t = team(
    [
      P("1", "Hurt1", "WR", "A", 9, { isStarter: true, slotIndex: 0 }),
      P("2", "Hurt2", "TE", "B", 7, { isStarter: true, slotIndex: 1 }),
      P("3", "Hurt3", "RB", "C", 6, { isStarter: true, slotIndex: 2 }),
      P("4", "BenchRb", "RB", "D", 12),
      P("5", "BenchTe", "TE", "E", 8.5),
    ],
    ["WR", "TE", "FLEX"]
  );
  const inj = [1, 2, 3].map((i) => ({ name: `Hurt${i}`, status: "Questionable", severity: 1 }));
  const c = lineupAlertCount(t, {}, inj);
  assert.equal(c.alerts.length, 3);
  assert.equal(c.swaps.length, 2);
  assert.equal(c.total, 5);
  assert.equal(lineupAlertCount({ settings: {}, players: [] }, {}, []).total, 0);
});

test("a bench player the injury feed lists Out is never recommended, and an Out starter counts 0", () => {
  const t = {
    settings: { slots: ["WR", "FLEX"] },
    players: [
      { player_id: "1", name: "Starter WR", position: "WR", team: "A", isStarter: true, slot: "WR", slotIndex: 0, myProjPts: 15 },
      { player_id: "2", name: "Flex Guy", position: "RB", team: "B", isStarter: true, slot: "FLEX", slotIndex: 1, myProjPts: 8 },
      { player_id: "3", name: "Hurt Star", position: "WR", team: "C", isStarter: false, myProjPts: 13 },
      { player_id: "4", name: "Healthy Backup", position: "WR", team: "D", isStarter: false, myProjPts: 9 },
    ],
  };
  const injuries = [{ name: "Hurt Star", status: "Out", severity: 4 }];
  assert.equal(optimizeLineup(t, {}).swaps[0].in.name, "Hurt Star");
  const r = optimizeLineup(t, {}, injuries);
  assert.equal(r.swaps.length, 1);
  assert.equal(r.swaps[0].in.name, "Healthy Backup");
  // an Out starter is worth 0, so the healthy bench player replaces him
  const inj2 = [{ name: "Flex Guy", status: "Out", severity: 4 }];
  const r2 = optimizeLineup(t, {}, inj2);
  assert.equal(r2.swaps[0].out.name, "Flex Guy");
});

// ---- median + Smash / Tough Spot (the backtested rule) ------------------------------------------------------------------------

const PL = (id, name, pos, team, proj, floor, ceiling, x = {}) => ({ player_id: id, name, position: pos, team, myProjPts: proj, myFloor: floor, myCeiling: ceiling, isStarter: false, slotIndex: 999, ...x });
const PRE = { A: { state: "pre" }, B: { state: "pre" }, D: { state: "pre" } };
function league(bench = []) {
  return {
    settings: { slots: ["WR", "FLEX"], winChance: 0.3 },
    players: [
      PL("1", "Starter", "WR", "A", 15, 9, 21, { isStarter: true, slotIndex: 0 }),
      PL("2", "Steady", "WR", "B", 10.8, 9.5, 12.5, { isStarter: true, slotIndex: 1 }),
      ...bench,
    ],
  };
}

test("a huge ceiling or a wide range never beats a clearly higher median (the Skattebo case), whatever the win chance", () => {
  // bench: 6.0 median with a 4.5-24.4 range vs the starter's 10.8 median
  const t = league([PL("3", "Boom", "WR", "D", 6.0, 4.5, 24.4)]);
  assert.equal(lineupAdvice(t, PRE).swaps.length, 0);
});

test("a higher median wins even when the range is tight", () => {
  const t = league([PL("3", "Better", "WR", "D", 12.1, 9, 14)]);
  const a = lineupAdvice(t, PRE);
  assert.equal(a.swaps[0].in.name, "Better");
  assert.equal(a.swaps[0].gain, 1.3);
  assert.equal(a.swaps[0].why, ""); // the rows show both medians; nothing else moved it
});

test("a Smash Spot adds its full published effect and can flip a close call; a Tough Spot subtracts it", () => {
  const near = PL("3", "Near", "WR", "D", 10.2, 8, 12);
  assert.equal(lineupAdvice(league([near]), PRE).swaps.length, 0); // 10.2 < 10.8
  const smash = { ...near, myLean: { call: "SMASH", effect: 2.4 } };
  const a = lineupAdvice(league([smash]), PRE);
  assert.equal(a.swaps[0].in.name, "Near");
  assert.equal(a.swaps[0].gain, 1.8); // 10.2 + 2.4 - 10.8
  assert.match(a.swaps[0].why, /^Smash Spot \+2\.4 for him$/);
  const tough = league([PL("3", "Better", "WR", "D", 11.5, 9, 14)]);
  tough.players[1] = { ...tough.players[1], myLean: { call: "AVOID", effect: -2.2 } }; // the starter's Tough Spot
  const b = lineupAdvice(tough, PRE);
  assert.equal(b.swaps[0].in.name, "Better");
  assert.equal(b.swaps[0].gain, 2.9); // 11.5 - (10.8 - 2.2)
  assert.match(b.swaps[0].why, /Tough Spot −2\.2 for Steady/);
});

test("an Out starter is replaced, an Out bench player never chosen", () => {
  const t = league([PL("3", "Hurt Star", "WR", "D", 13, 5, 25), PL("4", "Fine", "WR", "D", 9, 5, 13)]);
  const a = lineupAdvice(t, PRE, [{ name: "Hurt Star", status: "Out", severity: 4 }]);
  assert.ok(a.swaps.every((x) => x.in.name !== "Hurt Star"));
  const b = lineupAdvice(t, PRE, [{ name: "Steady", status: "Out", severity: 4 }]);
  assert.equal(b.swaps[0].out.name, "Steady");
  assert.match(b.swaps[0].why, /Steady is listed Out/);
});

test("an empty slot is filled once: two empty RB slots and a WR slot take the two best RBs and the WR, nothing more (Fantasy Degenerates)", () => {
  const P3 = (id, name, pos, team, proj, x = {}) => ({ player_id: id, name, position: pos, team, myProjPts: proj, isStarter: false, slotIndex: 999, ...x });
  const t = {
    settings: { slots: ["QB", "RB", "RB", "WR", "FLEX"] },
    players: [
      P3("1", "QB1", "QB", "A", 20, { isStarter: true, slotIndex: 0, slot: "QB" }),
      P3("2", "Flex", "WR", "A", 9, { isStarter: true, slotIndex: 4, slot: "FLEX" }),
      P3("3", "Bijan", "RB", "A", 23.9), P3("4", "CMC", "RB", "A", 21.2), P3("5", "Dowdle", "RB", "A", 8.8), P3("6", "Perine", "RB", "A", 5.6), P3("7", "Golden", "WR", "A", 13.9),
    ],
  };
  const r = optimizeLineup(t, { A: { state: "pre" } });
  const empties = r.swaps.filter((x) => !x.out);
  assert.deepEqual(empties.map((x) => `${x.slot}:${x.in.name}`).sort(), ["RB:Bijan", "RB:CMC", "WR:Golden"]);
  assert.equal(new Set(r.swaps.map((x) => x.in.name)).size, r.swaps.length); // nobody twice
});

import { test } from "node:test";
import assert from "node:assert/strict";
import { optimizeLineup, lineupAdvice, lineupAlerts } from "../lib/lineupOptimizer.js";

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

test("underdog tilt: a ceiling swap that costs little median is offered", () => {
  const t = team(
    [
      P("1", "Qb", "QB", "A", 18, { isStarter: true, slotIndex: 0, myCeiling: 28 }),
      P("2", "Rb", "RB", "B", 12, { isStarter: true, slotIndex: 1, myCeiling: 18 }),
      P("3", "Wr", "WR", "C", 11, { isStarter: true, slotIndex: 2, myCeiling: 17 }),
      P("4", "Steady", "WR", "D", 10, { isStarter: true, slotIndex: 3, myCeiling: 13 }),
      P("5", "Boom", "WR", "E", 9.5, { myCeiling: 27 }),
    ],
    ["QB", "RB", "WR", "FLEX"],
    { winChance: 0.25 }
  );
  const a = lineupAdvice(t, {});
  assert.equal(a.gain, 0, "by projection he's already set");
  assert.equal(a.tilt.mode, "ceiling");
  assert.equal(a.tilt.swaps[0].in.name, "Boom");
});

test("best ball, byes and teams without slots return null", () => {
  assert.equal(optimizeLineup(team([], ["QB"], { bestBall: true }), {}), null);
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
  assert.equal(lineupAlerts(team([], ["QB"], { bestBall: true }), {}, []).length, 0);
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

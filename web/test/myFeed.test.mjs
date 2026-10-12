import test from "node:test";
import assert from "node:assert/strict";
import { buildFeed } from "../lib/myFeed.js";

const mine = {
  signedIn: true,
  teams: ["Dynasty", "Redraft"],
  byName: { "bijan robinson": [[0, 1], [1, 1]], "josh allen": [[0, 0]], "puka nacua": [[1, 1]], "steady eddie": [[0, 1]] },
};
const sim = (name, position, median, floor = median - 60, ceiling = median + 60) => ({ player_name: name, position, median, floor, ceiling });

test("a big median move is a headline with position rank; a tiny one is ignored", () => {
  const f = buildFeed({
    mine,
    sims: {
      prev: [sim("Bijan Robinson", "RB", 250), sim("Rival RB", "RB", 255), sim("Steady Eddie", "WR", 200)],
      cur: [sim("Bijan Robinson", "RB", 270), sim("Rival RB", "RB", 255), sim("Steady Eddie", "WR", 201)],
    },
  });
  assert.equal(f.items.length, 1);
  assert.match(f.items[0].lines[0].text, /^Season median \+20 pts \(250 → 270\) · RB2 → RB1$/);
  assert.equal(f.items[0].lines[0].dir, "up");
});

test("role, sustainability and stage flips are reported; unchanged labels are not", () => {
  const f = buildFeed({
    mine,
    roles: { prev: [{ player_name: "Josh Allen", archetype: "Dual-Threat" }], cur: [{ player_name: "Josh Allen", archetype: "Pocket Distributor" }] },
    groups: {
      prev: [{ player_name: "Josh Allen", kind: "sustainability", label: "Running Hot" }, { player_name: "Josh Allen", kind: "career_stage", label: "Prime" }],
      cur: [{ player_name: "Josh Allen", kind: "sustainability", label: "In Line" }, { player_name: "Josh Allen", kind: "career_stage", label: "Prime" }],
    },
  });
  assert.deepEqual(f.items[0].lines.map((l) => l.kind), ["role", "sus"]);
});

test("weekly rank moves need the threshold and carry the opponent", () => {
  const f = buildFeed({
    mine,
    ranks: {
      prev: [{ player_name: "Puka Nacua", rank: 4, week: 5 }, { player_name: "Bijan Robinson", rank: 3, week: 5 }],
      cur: [{ player_name: "Puka Nacua", rank: 11, week: 6, opponent: "KC", is_home: false }, { player_name: "Bijan Robinson", rank: 5, week: 6 }],
    },
  });
  assert.equal(f.items.length, 1);
  assert.equal(f.items[0].lines[0].text, "Week 6 rank 4 → 11 · @ KC");
  assert.equal(f.items[0].lines[0].dir, "down");
});

test("starters sort ahead of bench players, then by size of change", () => {
  const f = buildFeed({
    mine,
    sims: {
      prev: [sim("Josh Allen", "QB", 300), sim("Puka Nacua", "WR", 200)],
      cur: [sim("Josh Allen", "QB", 360), sim("Puka Nacua", "WR", 215)],
    },
  });
  assert.deepEqual(f.items.map((i) => i.name), ["Puka Nacua", "Josh Allen"]);
  assert.equal(f.starters, 1);
  assert.equal(f.bench, 1);
});

test("narrowing to one team drops players who are not on it", () => {
  const args = {
    mine,
    sims: { prev: [sim("Puka Nacua", "WR", 200), sim("Josh Allen", "QB", 300)], cur: [sim("Puka Nacua", "WR", 230), sim("Josh Allen", "QB", 340)] },
  };
  assert.equal(buildFeed({ ...args, teamIndex: 0 }).items.map((i) => i.name).join(), "Josh Allen");
  assert.equal(buildFeed({ ...args, teamIndex: 1 }).items.map((i) => i.name).join(), "Puka Nacua");
});

test("missing prior week means no changes, not an error", () => {
  const f = buildFeed({ mine, sims: { cur: [sim("Josh Allen", "QB", 300)], prev: [] } });
  assert.equal(f.items.length, 0);
});

test("a player listed OUT gets a status line, not a fake rank crash", () => {
  const f = buildFeed({
    mine,
    ranks: {
      prev: [{ player_name: "Puka Nacua", rank: 4, week: 5 }],
      cur: [{ player_name: "Puka Nacua", rank: 427, week: 6, opponent: "NA", notes: "OUT" }],
    },
  });
  assert.equal(f.items[0].lines.length, 1);
  assert.equal(f.items[0].lines[0].text, "Listed OUT for week 6");
});

test("floor/ceiling are only compared once both weeks use the same method", () => {
  const sims = { prev: [sim("Josh Allen", "QB", 300, 200, 400)], cur: [sim("Josh Allen", "QB", 301, 260, 470)] };
  assert.equal(buildFeed({ mine, sims, simPrevWeek: 4 }).items.length, 0);
  const f = buildFeed({ mine, sims, simPrevWeek: 5 });
  assert.deepEqual(f.items[0].lines.map((l) => l.kind).sort(), ["ceiling", "floor"]);
});

test("rank moves deep in the pack are not worth a card", () => {
  const f = buildFeed({
    mine,
    ranks: { prev: [{ player_name: "Puka Nacua", rank: 266, week: 5 }], cur: [{ player_name: "Puka Nacua", rank: 290, week: 6 }] },
  });
  assert.equal(f.items.length, 0);
});

test("a starter listed out outranks a big median move", () => {
  const f = buildFeed({
    mine,
    sims: { prev: [sim("Puka Nacua", "WR", 200), sim("Josh Allen", "QB", 300)], cur: [sim("Puka Nacua", "WR", 260), sim("Josh Allen", "QB", 300)] },
    ranks: { prev: [{ player_name: "Puka Nacua", rank: 4, week: 5 }], cur: [{ player_name: "Puka Nacua", rank: 400, week: 6, notes: "OUT" }] },
  });
  assert.equal(f.items[0].lines[0].kind, "status");
});

test("a player on a bye gets no rank-move line (his rank only drops because he has no game)", () => {
  const f = buildFeed({
    mine,
    ranks: {
      prev: [{ player_name: "Puka Nacua", rank: 4, week: 5 }],
      cur: [{ player_name: "Puka Nacua", rank: 40, week: 6, opponent: "NA" }],
    },
  });
  assert.equal(f.items.length, 0);
});

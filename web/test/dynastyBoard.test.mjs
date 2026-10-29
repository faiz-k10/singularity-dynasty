import test from "node:test";
import assert from "node:assert/strict";
import { boardRows, buildBoard, metaFromData, pBetter, phi, profileRead, rowsFromData, scoreRows } from "../lib/dynastyBoard.js";
import data from "../data/dynasty-values.json" with { type: "json" };

const row = (name, pos, p1, ps, age, sd = 2) => ({ id: name, name, pos, team: "AAA", age: 25, games: 17, ppg: 15, ageValue: age, por1qb: p1, porSf: ps, sdProd: sd });

test("phi is the standard normal CDF", () => {
  assert.ok(Math.abs(phi(0) - 0.5) < 1e-7);
  assert.ok(Math.abs(phi(1.2816) - 0.9) < 1e-4);
  assert.ok(Math.abs(phi(-1.2816) - 0.1) < 1e-4);
  assert.ok(Math.abs(phi(0.8416) - 0.8) < 1e-4);
  assert.ok(Math.abs(phi(0.3853) - 0.65) < 1e-4);
  assert.ok(Math.abs(phi(0.1257) - 0.55) < 1e-4);
});

test("mode weights and format pick the score", () => {
  const rows = [row("A", "QB", 4, 9, 8)];
  assert.ok(Math.abs(scoreRows(rows, "1qb", "contender")[0].score - (0.8 * 4 + 0.2 * 8)) < 1e-9);
  assert.ok(Math.abs(scoreRows(rows, "sf", "rebuilder")[0].score - (0.65 * 9 + 0.35 * 8)) < 1e-9);
});

test("a quarterback climbs from 1QB to superflex", () => {
  const rows = [row("QB1", "QB", 3, 8.5, 7), row("WR1", "WR", 7, 7, 6), row("WR2", "WR", 6, 6, 6)];
  assert.equal(scoreRows(rows, "1qb", "contender")[0].name, "WR1");
  assert.equal(scoreRows(rows, "sf", "contender")[0].name, "QB1");
});

test("ranges are an 80% interval around the score", () => {
  const [r] = scoreRows([row("A", "WR", 9, 9, 9, 3)], "1qb", "contender");
  assert.ok(Math.abs(r.hi - r.score - 1.2816 * 0.8 * 3) < 1e-9);
  assert.ok(Math.abs(r.score - r.lo - 1.2816 * 0.8 * 3) < 1e-9);
});

test("a player below replacement ranks below one at replacement, whatever his age", () => {
  const L = scoreRows([row("Vet", "WR", 1, 1, 3), row("Kid", "WR", -4, -4, 9.5)], "1qb", "rebuilder");
  assert.equal(L[0].name, "Vet");
});

test("boxes cover every player once and nest: ties in tiers in groups", () => {
  const rows = [];
  for (let i = 0; i < 60; i++) rows.push(row("P" + i, "WR", 10 - i * 0.15, 10 - i * 0.15, 5));
  const L = scoreRows(rows, "1qb", "contender");
  const { groups, tiers, ties } = buildBoard(L);
  for (const boxes of [groups, tiers, ties]) {
    assert.equal(boxes[0].a, 0);
    assert.equal(boxes.at(-1).b, L.length - 1);
    boxes.slice(1).forEach((b, i) => assert.equal(b.a, boxes[i].b + 1));
  }
  tiers.forEach((t) => assert.ok(groups[t.g].a <= t.a && t.b <= groups[t.g].b));
  ties.forEach((x) => assert.ok(tiers[x.ti].a <= x.a && x.b <= tiers[x.ti].b));
});

test("nobody inside a box is likely better than anyone below him", () => {
  const rows = [];
  for (let i = 0; i < 80; i++) rows.push(row("P" + i, "RB", 10 - i * 0.11, 10 - i * 0.11, 5));
  const L = scoreRows(rows, "1qb", "rebuilder");
  const { tiers, ties } = buildBoard(L);
  const z = (i, j) => (L[i].score - L[j].score) / Math.hypot(L[i].sd, L[j].sd);
  for (const [boxes, limit] of [[tiers, 0.3853], [ties, 0.1257]]) {
    for (const b of boxes) {
      for (let i = b.a; i < b.b; i++) for (let j = i + 1; j <= b.b; j++) assert.ok(z(i, j) < limit);
    }
  }
});

test("a clear cliff becomes a tier break, with a high beat probability", () => {
  const rows = [row("A", "WR", 9, 9, 6, 1), row("B", "WR", 8.9, 8.9, 6, 1), row("C", "WR", 4, 4, 6, 1), row("D", "WR", 3.9, 3.9, 6, 1)];
  const { tiers } = buildBoard(scoreRows(rows, "1qb", "contender"));
  assert.equal(tiers.length, 2);
  assert.deepEqual([tiers[0].a, tiers[0].b], [0, 1]);
  assert.ok(tiers[0].beat > 0.99);
});

test("the published data loads and builds a board in every format, mode and position", () => {
  const rows = rowsFromData(data);
  assert.ok(rows.length > 100);
  for (const f of ["1qb", "sf"]) for (const m of ["contender", "rebuilder"]) {
    const L = boardRows(rows, { format: f, mode: m, pos: "ALL" });
    assert.equal(L.length, 120);
    for (const pos of ["QB", "RB", "WR", "TE"]) {
      const P = boardRows(rows, { format: f, mode: m, pos });
      assert.ok(P.length > 10 && P.every((p) => p.pos === pos));
      assert.ok(buildBoard(P).tiers.length >= 2);
    }
    const { groups, tiers } = buildBoard(L);
    assert.ok(tiers.length >= 3 && groups.length >= 1);
  }
});

test("pBetter is 50% for equal scores and rises with the gap", () => {
  const [a, b, c] = scoreRows([row("A", "WR", 8, 8, 6), row("B", "WR", 8, 8, 6), row("C", "WR", 4, 4, 6)], "1qb", "contender");
  assert.ok(Math.abs(pBetter(a, b) - 0.5) < 1e-9);
  assert.ok(pBetter(a, c) > 0.8 && pBetter(c, a) < 0.2);
});

test("the published metadata has replacement, an age curve and the memory settings", () => {
  const meta = metaFromData(data);
  for (const f of ["1QB", "SF"]) for (const p of ["QB", "RB", "WR", "TE"]) assert.ok(meta.replacement[f][p] > 5);
  assert.ok(meta.replacement["1QB"].QB > meta.replacement.SF.QB, "superflex lowers the QB bar");
  for (const p of ["QB", "RB", "WR", "TE"]) assert.ok(meta.ageCurve[p].length > 15 && meta.ageCurve[p][0].length === 3);
  assert.equal(meta.window.games, 34);
});

test("profileRead: only facts from his own numbers", () => {
  const base = { id: "x", name: "A", pos: "WR", ppg: 14, prod: 3, ageValue: 9, score: 5 };
  const young = profileRead({ p: base, mode: "rebuilder", repl: 11, tied: [], ranks: [8, 9, 20] });
  assert.match(young, /Young for his position/);
  assert.match(young, /Ranks #8 to #20/);
  const below = profileRead({ p: { ...base, ppg: 5 }, mode: "contender", repl: 11, tied: [{ name: "B" }, { name: "C" }, { name: "D" }], ranks: [10, 11] });
  assert.match(below, /Below replacement/);
  assert.match(below, /Can't be separated from B or C and 1 more/);
  assert.match(below, /Holds his rank/);
  const old = profileRead({ p: { ...base, prod: 8, ageValue: 2 }, mode: "contender", repl: 11, tied: [], ranks: null });
  assert.match(old, /Age is the drag/);
  assert.doesNotMatch(old, /Ranks #|Holds his rank/);
});

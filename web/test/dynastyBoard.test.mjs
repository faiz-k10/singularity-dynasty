import test from "node:test";
import assert from "node:assert/strict";
import { MODES, SHOW, ageValueOf, boardRows, buildBoard, metaFromData, pBetter, phi, rowsFromData, runwayOf, scoreRows, viewBoard } from "../lib/dynastyBoard.js";
import data from "../data/dynasty-values.json" with { type: "json" };

const row = (name, pos, p1, ps, age, sd = 2) => ({ id: name, name, pos, team: "AAA", age: 25, games: 17, ppg: 15, ageValue: age, runway: 10, por1qb: p1, porSf: ps, sdProd: sd });

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
  assert.ok(Math.abs(scoreRows(rows, "1qb", "contender")[0].raw - (MODES.contender.prod * 4 + MODES.contender.age * 8)) < 1e-9);
  assert.ok(Math.abs(scoreRows(rows, "sf", "rebuilder")[0].raw - (MODES.rebuilder.prod * 9 + MODES.rebuilder.age * 8)) < 1e-9);
});

test("a quarterback climbs from 1QB to superflex", () => {
  const rows = [row("QB1", "QB", 3, 8.5, 7), row("WR1", "WR", 7, 7, 6), row("WR2", "WR", 6, 6, 6)];
  assert.equal(scoreRows(rows, "1qb", "contender")[0].name, "WR1");
  assert.equal(scoreRows(rows, "sf", "contender")[0].name, "QB1");
});

test("ranges are an 80% interval around the score", () => {
  const [r] = scoreRows([row("A", "WR", 9, 9, 9, 3)], "1qb", "contender");
  assert.ok(Math.abs(r.hi - r.score - 1.2816 * MODES.contender.prod * 3 * r.scale) < 1e-9);
  assert.ok(Math.abs(r.score - r.lo - 1.2816 * MODES.contender.prod * 3 * r.scale) < 1e-9);
});

test("a player below replacement ranks below one at replacement when their ages are the same", () => {
  // at 35/65 (Rebuilder) age leads: a younger player below replacement can pass a replacement-level veteran, so the guard holds for equal ages
  const L = scoreRows([row("Vet", "WR", 1, 1, 3), row("Kid", "WR", -4, -4, 3)], "1qb", "rebuilder");
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
    assert.equal(L.length, SHOW.all);
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

test("the published metadata has replacement, the done ages and the memory settings", () => {
  const meta = metaFromData(data);
  for (const f of ["1QB", "SF"]) for (const p of ["QB", "RB", "WR", "TE"]) assert.ok(meta.replacement[f][p] > 5);
  assert.ok(meta.replacement["1QB"].QB > meta.replacement.SF.QB, "superflex lowers the QB bar");
  for (const p of ["QB", "RB", "WR", "TE"]) assert.ok(meta.doneAge[p] > 25 && meta.doneAge[p] < 40);
  assert.equal(meta.doneAge.QB, 35); assert.equal(meta.doneAge.RB, 28);
  assert.equal(meta.window.games, 34);
});

test("same displayed score: the younger player ranks first", () => {
  const mk = (id, age, ageValue, por) => ({ id, age, ageValue, runway: 10, ppg: 10, porSf: por, por1qb: por, sdProd: 1 });
  const out = scoreRows([mk("top", 25, 10, 10), mk("old", 31, 5, 5.04), mk("young", 24, 5, 5.0)], "sf", "contender").slice(1); // "top" (raw 10) keeps the scale at 1
  assert.equal(out[0].id, "young");
});

test("age value is the years until his position's done age: 10+ years = 10, past it = 1", () => {
  const done = { QB: 35, RB: 28, WR: 29.3, TE: 30.4 };
  assert.equal(runwayOf(done, "RB", 30.2), 0);
  assert.equal(runwayOf(done, "QB", 30), 5);
  assert.equal(ageValueOf(0), 1); assert.equal(ageValueOf(5), 5.5); assert.equal(ageValueOf(14), 10);
  const d = { done_age: done, columns: ["player_id", "player", "position", "team", "age", "games_in_window", "ppg_weighted", "por_1qb", "por_sf", "sd_prod"], rows: [["a", "A", "QB", "X", 30, 20, 15, 3, 3, 2]] };
  const [r] = rowsFromData(d);
  assert.equal(r.runway, 5); assert.equal(r.ageValue, 5.5);
});

test("Rebuilder counts production only for the part of its window a player still has (a 30-year-old RB keeps only his youth)", () => {
  const mk = (id, runway, por) => ({ id, name: id, pos: "RB", age: 25, ppg: 15, ppgS: 15, porSf: por, porSfS: por, por1qb: por, por1qbS: por, sdProd: 1, sdProdS: 1, runway, ageValue: ageValueOf(runway) });
  const [vet] = scoreRows([mk("vet", 0, 9), mk("kid", 4, 3)], "sf", "rebuilder").filter((r) => r.id === "vet");
  assert.equal(vet.prod, 0);
  const [half] = scoreRows([mk("half", 1, 8)], "sf", "rebuilder");
  assert.equal(half.prod, 4);
  // Contender counts all of it
  assert.equal(scoreRows([mk("vet", 0, 9)], "sf", "contender")[0].prod, 9);
});

test("move: the score change over the drift games is the production drift in score points", () => {
  const rows = rowsFromData(data), S = scoreRows(rows, "sf", "contender");
  const r = S.find((x) => x.move != null);
  assert.ok(Math.abs(r.move - r.scale * MODES.contender.prod * r.driftPor) < 1e-9);
  assert.equal(data.drift_games, 9);
});

test("Rebuilder reads the 17-game production numbers, Contender the 34-game ones", () => {
  const cols = ["player_id", "player", "position", "team", "age", "games_in_window", "ppg_weighted", "age_value", "por_1qb", "por_sf", "sd_prod", "ppg_s", "games_s", "por_1qb_s", "por_sf_s", "sd_prod_s"];
  const d = { done_age: { QB: 35, RB: 28, WR: 29.3, TE: 30.4 }, columns: cols, rows: [["a", "A", "WR", "X", 25, 34, 12, 5, 2, 2, 1, 15, 17, 4, 4, 2]] };
  const [r] = rowsFromData(d);
  const con = scoreRows([r], "1qb", "contender")[0], reb = scoreRows([r], "1qb", "rebuilder")[0];
  assert.equal(con.ppg, 12); assert.equal(con.games, 34); assert.equal(con.prod, 2); assert.equal(con.sd, MODES.contender.prod * 1 * con.scale);
  assert.equal(reb.ppg, 15); assert.equal(reb.games, 17); assert.equal(reb.prod, 4); assert.equal(reb.sd, MODES.rebuilder.prod * 2 * reb.scale);
  // an older data file with no short columns: Rebuilder falls back to the long numbers
  const old = rowsFromData({ done_age: d.done_age, columns: cols.slice(0, 11), rows: [["a", "A", "WR", "X", 25, 34, 12, 5, 2, 2, 1]] });
  assert.equal(scoreRows(old, "1qb", "rebuilder")[0].ppg, 12);
});

test("same displayed score: the player with more years before his position's done age ranks first, not just the youngest", () => {
  const mk = (id, age, ageValue, por) => ({ id, age, ageValue, runway: 10, ppg: 10, porSf: por, por1qb: por, sdProd: 1 });
  // young but closer to his position's done age (RB, age value 4) vs older but further from his (QB, age value 6), the same
  // shown score at 70/30: the QB goes first
  const out = scoreRows([mk("youngRB", 23, 4, 4.86), mk("olderQB", 29, 6, 4)], "sf", "rebuilder");
  assert.equal(out[0].id, "olderQB");
});

test("staff tiebreak orders players with the same shown score: both, then Playcaller HC, then GM still there, then neither", async () => {
  const { staffTiebreak } = await import("../lib/dynastyBoard.js");
  // same production and age value, so the same score; the youngest is listed LAST so the old age tiebreak can't explain the order
  const mk = (id, team, draftTeam, draftYear, age) => ({ id, name: id, pos: "WR", team, draftTeam, draftYear, acqDate: "", acqHow: "", age, ageValue: 5, runway: 10, ppg: 15, porSf: 6, por1qb: 6, sdProd: 1 });
  const rows = [
    mk("neither", "MIA", "MIA", 2022, 24), // Hafley doesn't call plays, Grier's pick (Sullivan since 2026)
    mk("gm", "SEA", "SEA", 2023, 25),      // Macdonald doesn't call plays, Schneider's pick
    mk("oc", "JAX", "JAX", 2023, 26),      // Coen calls plays, Baalke's pick (Gladstone since 2025)
    mk("both", "LA", "LA", 2023, 27),      // McVay calls plays, Snead's pick
  ];
  assert.deepEqual(rows.map(staffTiebreak), [0, 1, 2, 3]);
  assert.deepEqual(scoreRows(rows, "sf", "contender").map((r) => r.id), ["both", "oc", "gm", "neither"]);
  // it never beats a higher shown score
  rows[0].porSf = 6.2;
  assert.equal(scoreRows(rows, "sf", "contender")[0].id, "neither");
});

test("scores are relative: the best on the board reads 10, filtering a position keeps the board's scale", () => {
  const rows = [row("QB1", "QB", 6, 6, 6), row("WR1", "WR", 4, 4, 6), row("WR2", "WR", 2, 2, 6)];
  const L = scoreRows(rows, "1qb", "contender");
  assert.ok(Math.abs(L[0].score - 10) < 1e-9);
  assert.ok(Math.abs(L[1].score / L[0].score - L[1].raw / L[0].raw) < 1e-9); // a plain multiplication
  const wr = boardRows(rows, { format: "1qb", mode: "contender", pos: "WR" });
  assert.ok(wr[0].score < 10 && Math.abs(wr[0].score - L[1].score) < 1e-9);
});

test("rankGrid: ranks every player in every format and mode over the whole pool", async () => {
  const { rankGrid, scoreRows, FORMATS, MODES } = await import("../lib/dynastyBoard.js");
  const { rowsFromData } = await import("../lib/dynastyBoard.js");
  const data = (await import("../data/dynasty-values.json", { with: { type: "json" } })).default;
  const rows = rowsFromData(data), g = rankGrid(rows);
  for (const fk of Object.keys(FORMATS)) for (const mk of Object.keys(MODES)) {
    const S = scoreRows(rows, fk, mk);
    S.forEach((r, i) => {
      const c = g.get(r.id)[`${fk}:${mk}`];
      assert.equal(c.rank, i + 1);
      assert.equal(c.posRank, S.filter((x) => x.pos === r.pos).findIndex((x) => x.id === r.id) + 1);
    });
  }
});

test("groups: one Replacement group, never split; groups above it under 20 and named from the top", () => {
  const rows = rowsFromData(data);
  for (const [f, m] of [["sf", "contender"], ["sf", "rebuilder"], ["1qb", "contender"], ["1qb", "rebuilder"]]) {
    const L = boardRows(rows, { format: f, mode: m, pos: "ALL" });
    const { groups } = buildBoard(L);
    const r = groups.findIndex((g) => g.name === "Replacement");
    assert.ok(r > 0, `${f}/${m}: has a Replacement group`);
    assert.equal(groups.filter((g) => g.name === "Replacement").length, 1);
    assert.equal(groups[0].name, "Future Legend");
    groups.slice(0, r).forEach((g) => assert.ok(g.b - g.a + 1 < 20, `${f}/${m}: ${g.name} under 20`));
    // contiguous and covering the whole view
    groups.forEach((g, k) => assert.equal(g.a, k ? groups[k - 1].b + 1 : 0));
    assert.equal(groups.at(-1).b, L.length - 1);
  }
});

test("a position view keeps every player's group from the all-positions board", () => {
  const rows = rowsFromData(data);
  for (const [format, mode] of [["sf", "contender"], ["1qb", "rebuilder"]]) {
    const A = viewBoard(rows, { format, mode, pos: "ALL" });
    const name = new Map();
    A.groups.forEach((g) => { for (let i = g.a; i <= g.b; i++) name.set(A.L[i].id, g.name); });
    for (const pos of ["QB", "RB", "WR", "TE"]) {
      const P = viewBoard(rows, { format, mode, pos });
      P.groups.forEach((g, k) => {
        assert.equal(g.a, k ? P.groups[k - 1].b + 1 : 0);
        for (let i = g.a; i <= g.b; i++) if (name.has(P.L[i].id)) assert.equal(g.name, name.get(P.L[i].id));
      });
    }
  }
});

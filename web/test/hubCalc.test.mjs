import { test } from "node:test";
import assert from "node:assert/strict";
import {
  isInSeason, pickDefaultTab, buildMovers, buildRangeLeaders, buildHotCold, buildLeanGroups, buildStageBars, buildAgeCurve, buildStageList,
} from "../lib/hubCalc.js";

test("in season = September-January and the newest published season is the one in progress", () => {
  assert.equal(isInSeason(new Date(2026, 9, 17), 2026), true); // Oct 2026, 2026 season
  assert.equal(isInSeason(new Date(2027, 0, 10), 2026), true); // Jan 2027, 2026 season (playoffs)
  assert.equal(isInSeason(new Date(2027, 2, 1), 2026), false); // March
  assert.equal(isInSeason(new Date(2026, 6, 1), 2025), false); // July
  assert.equal(isInSeason(new Date(2026, 8, 20), 2025), false); // Sept but this season not published yet
  assert.equal(isInSeason(new Date(2026, 9, 17), null), false);
});

test("default tab: auto follows the season, a forced tab wins", () => {
  assert.equal(pickDefaultTab({ defaultTab: "auto" }, new Date(2026, 9, 17), 2026), "inseason");
  assert.equal(pickDefaultTab({ defaultTab: "auto" }, new Date(2027, 3, 17), 2026), "offseason");
  assert.equal(pickDefaultTab({ defaultTab: "offseason" }, new Date(2026, 9, 17), 2026), "offseason");
});

const P = [
  { n: "A", pos: "QB", rank: 1, proj: 20, prev: 15 },
  { n: "B", pos: "RB", rank: 2, proj: 8, prev: 12 },
  { n: "C", pos: "WR", rank: 3, proj: 14, prev: 13 },
  { n: "D", pos: "WR", rank: 4, proj: 9, prev: 1 }, // prev under 3: ignored (bye/injury return)
  { n: "E", pos: "TE", rank: 5, proj: 6, prev: null },
];

test("movers: risers and fallers by projection change, needing a real previous number", () => {
  const m = buildMovers(P, { limit: 5 });
  assert.deepEqual(m.risers.map((r) => r.n), ["A", "C"]);
  assert.deepEqual(m.fallers.map((r) => r.n), ["B"]);
  assert.equal(m.maxAbs, 5);
  assert.deepEqual(buildMovers(P, { pos: "WR" }).risers.map((r) => r.n), ["C"]);
});

test("range leaders: highest ceilings first, with a shared scale", () => {
  const rows = [
    { n: "A", pos: "QB", floor: 10, proj: 20, ceil: 40 },
    { n: "B", pos: "RB", floor: 5, proj: 12, ceil: 44 },
    { n: "C", pos: "WR", floor: null, proj: 12, ceil: 50 },
  ];
  const r = buildRangeLeaders(rows, { limit: 2 });
  assert.deepEqual(r.list.map((x) => x.n), ["B", "A"]);
  assert.equal(r.max, 44);
});

test("hot / cold: biggest gaps between points per game and expected", () => {
  const rows = [
    { n: "H1", pos: "RB", sus: "Running Hot", susFp: 20, susXfp: 14 },
    { n: "H2", pos: "WR", sus: "Running Hot", susFp: 18, susXfp: 16 },
    { n: "C1", pos: "WR", sus: "Running Cold", susFp: 8, susXfp: 14 },
    { n: "X", pos: "WR", sus: "In Line", susFp: 10, susXfp: 10 },
  ];
  const h = buildHotCold(rows, { limit: 4 });
  assert.deepEqual(h.hot.map((r) => r.n), ["H1", "H2"]);
  assert.deepEqual(h.cold.map((r) => r.n), ["C1"]);
  assert.deepEqual(buildHotCold(rows, { pos: "RB" }).hot.map((r) => r.n), ["H1"]);
});

test("lean groups: grouped by defense, strongest first, filterable by position", () => {
  const leans = [
    { def: "DAL", pos: "QB", call: "SMASH", score: 3.7, effect: 3 },
    { def: "DAL", pos: "RB", call: "SMASH", score: 3.2, effect: 0.9 },
    { def: "SEA", pos: "WR", call: "AVOID", score: 3.1, effect: -2 },
  ];
  const g = buildLeanGroups(leans);
  assert.deepEqual(g.map((x) => x.def), ["DAL", "SEA"]);
  assert.equal(g[0].items.length, 2);
  assert.deepEqual(buildLeanGroups(leans, { pos: "WR" }).map((x) => x.def), ["SEA"]);
});

test("stage bars: shares per position add to 100 and skip empty positions", () => {
  const bars = buildStageBars({ RB: { Ascending: 1, Prime: 2, "Decline Watch": 1, "Late Career": 0 }, QB: {} });
  assert.equal(bars.length, 1);
  assert.equal(bars[0].pos, "RB");
  assert.equal(Math.round(bars[0].segments.reduce((s, x) => s + x.pct, 0)), 100);
  assert.equal(bars[0].segments[1].count, 2);
});

test("age curve: points plus an average-by-age trend, null when too few points", () => {
  const pts = [
    { pos: "RB", age: 22, proj: 10 }, { pos: "RB", age: 23, proj: 14 }, { pos: "RB", age: 26, proj: 12 }, { pos: "RB", age: 27, proj: 8 },
  ];
  const c = buildAgeCurve(pts);
  assert.equal(c.minAge, 22);
  assert.equal(c.maxAge, 27);
  assert.deepEqual(c.trend.map((t) => [t.age, t.avg]), [[23, 12], [27, 10]]);
  assert.equal(buildAgeCurve(pts.slice(0, 2)), null);
});

test("stage list: players in the given stages, best-ranked first", () => {
  const rows = [
    { n: "A", pos: "RB", rank: 9, stage: "Ascending" },
    { n: "B", pos: "WR", rank: 2, stage: "Ascending" },
    { n: "C", pos: "WR", rank: 1, stage: "Prime" },
  ];
  assert.deepEqual(buildStageList(rows, ["Ascending"]).map((r) => r.n), ["B", "A"]);
  assert.deepEqual(buildStageList(rows, ["Ascending"], { pos: "RB" }).map((r) => r.n), ["A"]);
});

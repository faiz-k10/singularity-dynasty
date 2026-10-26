import { test } from "node:test";
import assert from "node:assert/strict";
import { seasonLine, percentiles, linearFit, corrWord, niceTicks, weeklySeries, rolling, median, stdDev } from "../lib/labCalc.js";
import { buildLabRows, indexLabGames } from "../lib/labData.js";
import { LAB_METRICS, LAB_METRIC, formatMetric } from "../lib/labMetrics.js";

test("seasonLine: games, points, last three, spread and points over expected", () => {
  const s = seasonLine([[1, 10, 8, "DAL"], [2, 20, 15, "NYG"], [4, 0, null, "PHI"], [5, 30, 20, "WAS"]]);
  assert.equal(s.gp, 4);
  assert.equal(s.total, 60);
  assert.equal(s.ppg, 15);
  assert.equal(s.l3, 16.67);
  assert.equal(s.best, 30);
  assert.equal(s.sd, 11.18);
  assert.equal(s.fpoe, 5.67); // (2 + 5 + 10) / 3: the game without xFP is left out
  assert.deepEqual(seasonLine([]), {});
  assert.equal(seasonLine([[1, 5, null, "A"], [2, 7, null, "B"]]).sd, undefined); // spread needs 3 games
});

test("percentiles: within each position, best = 100, lower-is-better flipped", () => {
  const rows = [
    { name: "a", pos: "WR", m: { x: 10, s: 2 } },
    { name: "b", pos: "WR", m: { x: 20, s: 6 } },
    { name: "c", pos: "WR", m: { x: 30, s: 4 } },
    { name: "d", pos: "RB", m: { x: 1 } },
  ];
  const p = percentiles(rows, [{ key: "x" }, { key: "s", lower: true }]);
  assert.equal(p.c.x, 100);
  assert.equal(p.b.x, 50);
  assert.equal(p.a.x, 0);
  assert.equal(p.d.x, 100); // alone at his position
  assert.equal(p.a.s, 100);
  assert.equal(p.b.s, 0);
  assert.equal(p.d.s, undefined);
});

test("linearFit and corrWord", () => {
  const f = linearFit([[1, 2], [2, 4], [3, 6], [4, 8]]);
  assert.equal(Math.round(f.slope * 1000) / 1000, 2);
  assert.equal(Math.round(f.intercept * 1000) / 1000, 0);
  assert.equal(Math.round(f.r * 1000) / 1000, 1);
  assert.equal(linearFit([[1, 1], [2, 2]]), null);
  assert.equal(linearFit([[1, 1], [1, 2], [1, 3]]), null);
  assert.equal(corrWord(0.05), "no clear link");
  assert.equal(corrWord(-0.42), "moderate negative");
  assert.equal(corrWord(0.81), "very strong positive");
});

test("niceTicks enclose the range in round steps", () => {
  assert.deepEqual(niceTicks(0, 23), [0, 5, 10, 15, 20, 25]);
  assert.deepEqual(niceTicks(-0.13, 0.27, 4), [-0.2, -0.1, 0, 0.1, 0.2, 0.3]);
  const t = niceTicks(7, 7);
  assert.ok(t[0] <= 7 && t[t.length - 1] >= 7);
});

test("weeklySeries, rolling, median, stdDev", () => {
  const g = [[1, 10, 8, "A"], [2, 20, null, "B"], [3, 30, 25, "C"]];
  assert.deepEqual(weeklySeries(g, "pts").map((p) => p.value), [10, 20, 30]);
  assert.deepEqual(weeklySeries(g, "fpoe").map((p) => [p.week, p.value]), [[1, 2], [3, 5]]);
  assert.deepEqual(weeklySeries(g, "pts", true).map((p) => p.value), [10, 15, 20]);
  assert.deepEqual(rolling([2, 4, 6, 8], 2), [2, 3, 5, 7]);
  assert.equal(median([3, 1, 2]), 2);
  assert.equal(median([4, 1, 2, 3]), 2.5);
  assert.equal(stdDev([2, 4]), 1);
});

test("lab metrics: every key is unique, labelled and formatted", () => {
  assert.equal(new Set(LAB_METRICS.map((m) => m.key)).size, LAB_METRICS.length);
  for (const m of LAB_METRICS) {
    assert.ok(m.label && m.group && typeof m.format === "function" && m.hint, m.key);
  }
  assert.equal(LAB_METRIC.u_sack_rate.lower, true);
  assert.equal(formatMetric("rank", 4), "#4");
  assert.equal(formatMetric("ppg", null), "—");
});

test("buildLabRows: whole-pool percentiles, free slice, byes, last season and sims", () => {
  const ranked = [
    { player_name: "A", position: "WR", team: "CIN", opponent: "PIT", rank: 1, projection: 20, floor: 10, ceiling: 30, u_tgt_pg: 10 },
    { player_name: "B", position: "WR", team: "DAL", opponent: "NA", rank: 2, projection: 0, u_tgt_pg: 8 },
    { player_name: "C", position: "WR", team: "MIA", opponent: "NYJ", rank: 3, projection: 12, floor: 5, ceiling: 20, u_tgt_pg: 6 },
  ];
  const games = indexLabGames(
    [
      { player_name: "A", season: 2026, week: 2, opponent: "BAL", fantasy_points_ppr: 20, exp_points_ppr: 18 },
      { player_name: "A", season: 2026, week: 1, opponent: "CLE", fantasy_points_ppr: 10, exp_points_ppr: 12 },
      { player_name: "A", season: 2025, week: 9, opponent: "CLE", fantasy_points_ppr: 30 },
      { player_name: "A", season: 2025, week: 10, opponent: "CLE", fantasy_points_ppr: 10 },
      { player_name: "C", season: 2024, week: 1, opponent: "CLE", fantasy_points_ppr: 50 },
    ],
    2026,
  );
  assert.deepEqual(games.A.g.map((x) => x[0]), [1, 2]);
  const { rows, total } = buildLabRows({ ranked, games, sims: { C: { median: 200, pace: -3.5 } }, limit: 2 });
  assert.equal(total, 3);
  assert.equal(rows.length, 2);
  const [a, b] = rows;
  assert.equal(a.m.range, 20);
  assert.equal(a.m.ppg, 15);
  assert.equal(a.m.lyPpg, 20);
  assert.equal(a.pct.u_tgt_pg, 100);
  assert.equal(b.bye, true);
  assert.equal(b.m.projection, undefined); // a bye week has no projection numbers
  assert.equal(b.pct.u_tgt_pg, 50); // ranked against C too, although C is past the free slice
  assert.equal(b.m.s_median, undefined);
  assert.equal(buildLabRows({ ranked, games }).rows[2].m.s_median, undefined);
  assert.equal(buildLabRows({ ranked, games, sims: { C: { median: 200 } } }).rows[2].m.s_median, 200);
});

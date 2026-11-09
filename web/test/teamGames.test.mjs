import { test } from "node:test";
import assert from "node:assert/strict";
import { buildTeamWeeks, byeWeeks, indexGameLog, missedSegments, missedWeeks, teamGamesThrough } from "../lib/teamGames.js";

const row = (player_name, team, week) => ({ player_name, team, week });

test("counts the team's games, not the player's, so missed games show up", () => {
  const idx = indexGameLog([
    row("Star", "WAS", 1), row("Mate", "WAS", 1),
    row("Star", "WAS", 2), row("Mate", "WAS", 2),
    row("Mate", "WAS", 3),
    row("Mate", "WAS", 4),
  ]);
  assert.equal(teamGamesThrough(idx, "Star", 2), 2);
  assert.equal(teamGamesThrough(idx, "Star", 3), 3);
  assert.equal(teamGamesThrough(idx, "Star"), 4);
  assert.equal(idx.lastGameWeek, 4);
});

test("a bye week is not a game", () => {
  const idx = indexGameLog([row("A", "KC", 1), row("A", "KC", 2), row("A", "KC", 4), row("A", "KC", 5)]);
  assert.equal(teamGamesThrough(idx, "A", 3), 2);
  assert.equal(teamGamesThrough(idx, "A", 5), 4);
});

test("a traded player is counted against the team he was on at the time", () => {
  const idx = indexGameLog([
    row("T", "NYJ", 1), row("X", "NYJ", 1), row("X", "NYJ", 2), row("X", "NYJ", 3), row("X", "NYJ", 4),
    row("T", "DAL", 3), row("Y", "DAL", 3), row("Y", "DAL", 4),
  ]);
  assert.equal(teamGamesThrough(idx, "T", 2), 2); // NYJ weeks 1-2
  assert.equal(teamGamesThrough(idx, "T", 4), 2); // DAL weeks 3-4
});

test("unknown player or no team -> null", () => {
  const idx = indexGameLog([{ player_name: "Z", team: null, week: 1 }]);
  assert.equal(teamGamesThrough(idx, "Nobody", 4), null);
  assert.equal(teamGamesThrough(idx, "Z", 4), null);
  assert.equal(teamGamesThrough(indexGameLog([]), "Z"), null);
});

test("missedWeeks: team played, he did not (byes excluded)", () => {
  const idx = indexGameLog([
    row("Star", "WAS", 1), row("Mate", "WAS", 1),
    row("Star", "WAS", 2), row("Mate", "WAS", 2),
    row("Mate", "WAS", 3),
    // bye in week 4
    row("Mate", "WAS", 5), row("Star", "WAS", 5),
  ]);
  assert.deepEqual(missedWeeks(idx, "Star"), [3]);
  assert.deepEqual(missedWeeks(idx, "Mate"), []);
  assert.deepEqual(missedWeeks(idx, "Nobody"), []);
});

test("buildTeamWeeks works from a partial set of rows (e.g. only QBs)", () => {
  const weeks = buildTeamWeeks([row("QB1", "KC", 1), row("QB1", "KC", 2), row("QB2", "KC", 4), { player_name: "X", team: null, week: 9 }]);
  assert.deepEqual([...weeks.KC].sort(), [1, 2, 4]);
  assert.equal(Object.keys(weeks).length, 1);
});

const near = (a, b) => Math.abs(a - b) < 1e-9;
const third = 100 / 3;

test("missedSegments: each week's stretch is the span ending at its own dot (W1 at 0%, W4 at 100%, evenly between)", () => {
  // missed weeks 3 and 4 of 4, at the latest week: one merged gray stretch from W2's dot to the end
  const segs = missedSegments([3, 4], 4, 4);
  assert.equal(segs.length, 1);
  assert.ok(near(segs[0].start, third) && near(segs[0].end, 100));
});

test("missedSegments: scrubbed back, only the weeks up to the selected one show", () => {
  const segs = missedSegments([3, 4], 3, 4);
  assert.equal(segs.length, 1);
  assert.ok(near(segs[0].start, third) && near(segs[0].end, 2 * third));
  assert.deepEqual(missedSegments([3, 4], 2, 4), []);
});

test("missedSegments: missed weeks 1-2, played week 3 -> gray ends exactly where week 3's stretch begins; week 1 has no stretch", () => {
  const segs = missedSegments([1, 2], 3, 4);
  assert.equal(segs.length, 1);
  assert.ok(near(segs[0].start, 0) && near(segs[0].end, third));
});

test("missedSegments: separate misses stay separate; nothing at Week 1; no misses -> none", () => {
  const segs = missedSegments([2, 4], 4, 4);
  assert.equal(segs.length, 2);
  assert.ok(near(segs[0].start, 0) && near(segs[0].end, third));
  assert.ok(near(segs[1].start, 2 * third) && near(segs[1].end, 100));
  assert.deepEqual(missedSegments([1, 2], 1, 4), []);
  assert.deepEqual(missedSegments([], 4, 4), []);
  assert.deepEqual(missedSegments(undefined, 4, 4), []);
  assert.deepEqual(missedSegments([2], 1, 1), []);
});

test("byeWeeks: the weeks his team had no game, not the weeks he sat out", () => {
  const idx = indexGameLog([
    row("A", "KC", 1), row("B", "KC", 1),
    row("A", "KC", 2), row("B", "KC", 2),
    row("B", "KC", 4), // week 3 is KC's bye; A also misses week 4 (a real missed game)
    row("A", "KC", 5), row("B", "KC", 5),
    row("C", "DAL", 1), row("C", "DAL", 2), row("C", "DAL", 3), row("C", "DAL", 4), row("C", "DAL", 5),
  ]);
  assert.deepEqual(byeWeeks(idx, "A"), [3]);
  assert.deepEqual(missedWeeks(idx, "A"), [4]);
  assert.deepEqual(byeWeeks(idx, "C"), []);
});

import { recentWeekRows } from "../lib/teamGames.js";

test("recentWeekRows: a bye week is a BYE row worth 0.0 inside the newest three weeks", () => {
  const g = (week, pts) => ({ season: 2026, week, opponent: "BAL", is_home: false, fantasy_points_ppr: pts });
  const rows = recentWeekRows([g(4, 9), g(5, 4.2), g(7, 26.8), g(8, 12)], [6], 8);
  assert.deepEqual(rows.map((r) => r.week), [8, 7, 6]);
  assert.equal(rows[2].bye, true);
  assert.equal(rows[2].fantasy_points_ppr, 0);
  // rewound to week 7 the same bye is still there; before it, there is none
  assert.deepEqual(recentWeekRows([g(4, 9), g(5, 4.2), g(7, 26.8)], [6], 7).map((r) => r.week), [7, 6, 5]);
  assert.deepEqual(recentWeekRows([g(4, 9), g(5, 4.2), g(7, 26.8)], [6], 5).map((r) => r.week), [5, 4]);
  assert.equal(recentWeekRows([], [], 8).length, 0);
});

test("recentWeekRows: weeks he sat out are DNP rows, before his debut they are flagged pre; settleRecent keeps BUILDING for rookies only", async () => {
  const { recentWeekRows, settleRecent } = await import("../lib/teamGames.js");
  const games = [{ season: 2026, week: 4, opponent: "X", is_home: true, fantasy_points_ppr: 9 }, { season: 2026, week: 6, opponent: "Y", is_home: false, fantasy_points_ppr: 5 }];
  const rows = recentWeekRows(games, [8], 8, 5, [2, 3, 5, 7]);
  assert.deepEqual(rows.map((r) => [r.week, r.bye ? "bye" : r.dnp ? (r.pre ? "pre" : "dnp") : "game"]), [[8, "bye"], [7, "dnp"], [6, "game"], [5, "dnp"], [4, "game"]]);
  const early = recentWeekRows(games, [], 6, 6, [2, 3]);
  assert.deepEqual(early.filter((r) => r.dnp).map((r) => r.pre), [true, true]);
  assert.equal(settleRecent(early, true).filter((r) => r.pre).length, 2);
  assert.equal(settleRecent(early, false).filter((r) => r.pre).length, 0);
});

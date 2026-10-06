import { test } from "node:test";
import assert from "node:assert/strict";
import { buildTeamWeeks, indexGameLog, missedSegments, missedWeeks, teamGamesThrough } from "../lib/teamGames.js";

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

test("missedSegments: missed weeks 3 and 4 of 4, at the latest week -> one gray stretch, 50% to the end", () => {
  const segs = missedSegments([3, 4], 4, 4);
  assert.equal(segs.length, 1);
  assert.ok(near(segs[0].start, 50) && near(segs[0].end, 100));
});

test("missedSegments: the handle is at the right end of the selected week, so that week's whole stretch shows", () => {
  // selected W3 of 4: filled through 75%; week 3's stretch is 50%..75%
  const segs = missedSegments([3, 4], 3, 4);
  assert.equal(segs.length, 1);
  assert.ok(near(segs[0].start, 50) && near(segs[0].end, 75));
  // selected W2: weeks 3 and 4 aren't filled yet
  assert.deepEqual(missedSegments([3, 4], 2, 4), []);
});

test("missedSegments: missed weeks 1-2, played week 3 (Bowers-style) -> gray stops exactly where week 3 begins", () => {
  const segs = missedSegments([1, 2], 3, 4);
  assert.equal(segs.length, 1);
  assert.ok(near(segs[0].start, 0) && near(segs[0].end, 50));
});

test("missedSegments: separate misses stay separate, no misses -> none", () => {
  const segs = missedSegments([1, 3], 4, 4);
  assert.equal(segs.length, 2);
  assert.ok(near(segs[0].start, 0) && near(segs[0].end, 25));
  assert.ok(near(segs[1].start, 50) && near(segs[1].end, 75));
  assert.deepEqual(missedSegments([], 4, 4), []);
  assert.deepEqual(missedSegments(undefined, 4, 4), []);
  assert.deepEqual(missedSegments([2], 1, 1), []);
});

test("missedSegments: nothing is filled at Week 1 (the starting point); week 1's stretch appears once a later week is selected", () => {
  assert.deepEqual(missedSegments([1, 2], 1, 4), []);
  const segs = missedSegments([1], 2, 4);
  assert.equal(segs.length, 1);
  assert.ok(near(segs[0].start, 0) && near(segs[0].end, 25));
});

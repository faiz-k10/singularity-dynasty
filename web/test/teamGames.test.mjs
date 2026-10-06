import { test } from "node:test";
import assert from "node:assert/strict";
import { indexGameLog, teamGamesThrough } from "../lib/teamGames.js";

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

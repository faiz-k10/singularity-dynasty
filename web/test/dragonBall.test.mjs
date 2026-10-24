import { test } from "node:test";
import assert from "node:assert/strict";
import { ballStars, dragonBallSvg, MAX_BALL_STARS } from "../lib/dragonBall.js";
import { getAchievements, HERO_MAX_TIER } from "../app/tools/achievements.js";

test("a ball has exactly as many stars as the count, from 1 to 7", () => {
  for (let n = 1; n <= 7; n++) assert.equal(ballStars(n).stars.length, n);
  assert.equal(dragonBallSvg(4).split("<polygon").length - 1, 4);
});

test("counts above 7 show the 7-star ball; zero/garbage falls back to 1", () => {
  assert.equal(ballStars(9).stars.length, 7);
  assert.equal(ballStars(0).stars.length, 1);
  assert.equal(ballStars(undefined).stars.length, 1);
});

test("Super Hero badge carries the ball variant and its tier is capped at the 7-star art", () => {
  assert.equal(HERO_MAX_TIER, MAX_BALL_STARS);
  const hero = (wins) => getAchievements({ heroWins: wins }).find((a) => a.key === "hero");
  assert.equal(hero(2).variant, "ball");
  assert.equal(hero(2).tier, 2);
  assert.equal(hero(7).tier, 7);
  assert.equal(hero(9).tier, 7);
  assert.equal(hero(9).label, "9x Super Hero");
  assert.equal(hero(0), undefined);
});

test("Super Hero is always the last badge in the row", () => {
  const keys = getAchievements({ heroWins: 3, sample_confidence: "established", defLean: { call: "SMASH", text: "x" } }).map((a) => a.key);
  assert.equal(keys[keys.length - 1], "hero");
});

test("a player projected for 0 points keeps his past-games badges but not the ones that read this week (range, matchup)", () => {
  const base = { heroWins: 3, sample_confidence: "established", defLean: { call: "SMASH", text: "x" }, floor: 0, ceiling: 0 };
  const keys = (row) => getAchievements(row).map((a) => a.key);
  assert.ok(keys({ ...base, projection: 5 }).includes("matchup"));
  assert.deepEqual(keys({ ...base, projection: 0 }), ["confidence", "hero"]); // no Smash / Tough Spot, no range badge
  assert.ok(keys(base).length > 0); // no projection on the row -> unchanged
});

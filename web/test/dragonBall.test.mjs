import { test } from "node:test";
import assert from "node:assert/strict";
import { ballStars, dragonBallSvg, MAX_BALL_STARS } from "../lib/dragonBall.js";
import { getAchievements, HERO_MAX_TIER } from "../app/tools/achievements.js";

test("a ball has exactly as many stars as the count, from 1 to 6", () => {
  for (let n = 1; n <= 6; n++) assert.equal(ballStars(n).stars.length, n);
  assert.equal(dragonBallSvg(4).split("<polygon").length - 1, 4);
});

test("counts above 6 show the 6-star ball; zero/garbage falls back to 1", () => {
  assert.equal(ballStars(9).stars.length, MAX_BALL_STARS);
  assert.equal(ballStars(0).stars.length, 1);
  assert.equal(ballStars(undefined).stars.length, 1);
});

test("Super Hero badge carries the ball variant and its tier is capped at the 6-star art", () => {
  assert.equal(HERO_MAX_TIER, MAX_BALL_STARS);
  const hero = (wins) => getAchievements({ heroWins: wins }).find((a) => a.key === "hero");
  assert.equal(hero(2).variant, "ball");
  assert.equal(hero(2).tier, 2);
  assert.equal(hero(7).tier, 6);
  assert.equal(hero(7).label, "7x Super Hero");
  assert.equal(hero(0), undefined);
});

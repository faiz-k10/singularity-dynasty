import { test } from "node:test";
import assert from "node:assert/strict";
import { scorePlay, scoringFrom, STANDARD_SCORING } from "../lib/playScoring.js";
import { playPoints } from "../lib/playByPlay.js";

test("standard rates are the site's fixed play points (playPoints delegates here)", () => {
  assert.equal(scorePlay("Catch", 10), 2);
  assert.equal(scorePlay("Touchdown catch", 20), 9);
  assert.equal(scorePlay("Run", 8), 0.8);
  assert.equal(scorePlay("Touchdown run", 2), 6.2);
  assert.ok(Math.abs(scorePlay("Completion", 25) - 1) < 1e-9);
  assert.ok(Math.abs(scorePlay("Touchdown pass", 25) - 5) < 1e-9);
  assert.equal(scorePlay("Interception thrown"), -2);
  assert.equal(scorePlay("Fumble lost"), -2);
  assert.equal(scorePlay("Fumble"), 0);
  for (const [l, y] of [["Catch", 7], ["Run", 12], ["Touchdown pass", 9], ["Field goal", null], ["Sack"]]) assert.equal(playPoints(l, y), scorePlay(l, y, STANDARD_SCORING));
});

test("a league's own rates change the play: 0.25 per carry, a 6-point passing TD, a TE catch bonus, a one-point fumble", () => {
  const s = scoringFrom({ rush_att: 0.25, pass_td: 6, bonus_rec_te: 0.75, fum: -1, rec: 1, rec_yd: 0.1 });
  assert.equal(scorePlay("Run", 4, s), 0.65);
  assert.equal(scorePlay("Touchdown run", 2, s), 6.45);
  assert.ok(Math.abs(scorePlay("Touchdown pass", 25, s) - 7) < 1e-9);
  assert.equal(scorePlay("Catch", 10, s, "TE"), 2.75); // the bonus is for tight ends only
  assert.equal(scorePlay("Catch", 10, s, "WR"), 2);
  assert.equal(scorePlay("Fumble lost", null, s), -3); // a lost fumble is also a fumble
  assert.equal(scorePlay("Fumble", null, s), -1);
});

test("scoringFrom keeps only the rates it knows and fills the rest from the standard ones; null in, null out", () => {
  assert.equal(scoringFrom(null), null);
  const s = scoringFrom({ rec: 0.5, rush_att: 0.25, something_else: 9 });
  assert.equal(s.rec, 0.5);
  assert.equal(s.rush_yd, STANDARD_SCORING.rush_yd);
  assert.equal(s.something_else, undefined);
});

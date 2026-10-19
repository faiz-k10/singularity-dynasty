import { test } from "node:test";
import assert from "node:assert/strict";
import { standing } from "../lib/standing.js";

test("standing: the one-word reading from the win chance", () => {
  assert.equal(standing(0.7, false).label, "Favored");
  assert.equal(standing(0.5, false).label, "Toss-up");
  assert.equal(standing(0.3, false).label, "Underdog");
  assert.equal(standing(null, false).label, null);
  assert.equal(standing(1, true).label, "Won");
  assert.equal(standing(0, true).label, "Lost");
});

test("standing: Locked in / Out of reach need the score to agree", () => {
  assert.equal(standing(0.997, false, true).label, "You win");
  assert.equal(standing(0.997, false, null).label, "You win"); // level or unknown: the number decides
  assert.equal(standing(0.997, false, false).label, "Favored"); // still BEHIND on the board: never "locked in"
  assert.equal(standing(0.002, false, false).label, "Out of reach");
  assert.equal(standing(0.002, false, true).label, "Underdog"); // leading on the board: not "out of reach"
});
